// Recebe os avisos (webhooks) do Shopify e grava as vendas no ERP.
// Tópicos usados: orders/paid (cria a venda), orders/cancelled (marca como cancelada),
// products/create e products/update (atualiza o Catálogo), products/delete (marca como excluído do site).
// Segredo necessário (Supabase → Edge Functions → Secrets): SHOPIFY_WEBHOOK_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";
import { pedidoParaVenda } from "./map.js";
import { gravarProdutos, marcarExcluido, produtoParaLinhas } from "../_shared/produtos.js";
import { calcular, usarBanco } from "../_shared/frete_calc.ts";

// Webhooks criados em Configurações → Notificações usam o segredo mostrado lá; os criados pelo app usam o Client Secret do app.
const SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
usarBanco(sb);

// Frete OMG: o checkout cobra frete + seguro + II + ICMS numa linha só. Refaz a mesma conta para o ERP
// guardar cada parte (declaração, manifesto, lucratividade). Se não bater com o cobrado, avisa na obs.
async function separarFreteOMG(pedido: any, venda: any) {
  const linha = (pedido.shipping_lines || []).find((l: any) => /OMG_INTL/i.test(l.code || "") || /Entrega internacional OMG/i.test(l.title || ""));
  if (!linha) return;
  const ad = pedido.shipping_address || {};
  const itens = (pedido.line_items || []).filter((li: any) => li.requires_shipping !== false)
    .map((li: any) => ({ grams: Number(li.grams) || 0, price: Math.round(Number(li.price) * 100), quantity: Number(li.quantity) || 1 }));
  const cobrado = Number(linha.price_set?.shop_money?.amount ?? linha.price) || 0;
  try {
    const c = await calcular(ad.zip, ad.province_code || null, itens);
    venda.frete = c.brl.frete_seguro; venda.ii = c.brl.ii; venda.icms = c.brl.icms;
    venda.dados_site = { ...(venda.dados_site || {}), frete_omg: { ...c, cobrado } };
    const dif = Math.round((cobrado - c.brl.total_linha) * 100) / 100;
    if (Math.abs(dif) > 0.05) venda.obs = [venda.obs, "Frete OMG: cobrado R$ " + cobrado.toFixed(2) + ", conta de hoje R$ " + c.brl.total_linha.toFixed(2) + " (diferença R$ " + dif.toFixed(2) + ")"].filter(Boolean).join(" · ");
  } catch (e) {
    venda.obs = [venda.obs, "Frete OMG: não deu para separar frete e impostos (" + String((e as Error).message || e) + "); total cobrado R$ " + cobrado.toFixed(2)].filter(Boolean).join(" · ");
  }
}

async function assinaturaOk(corpo: Uint8Array, recebida: string | null) {
  if (!SECRET || !recebida) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, corpo));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  const calc = btoa(bin);
  if (calc.length !== recebida.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ recebida.charCodeAt(i);
  return diff === 0;
}

const resp = (status: number, msg: string) =>
  new Response(JSON.stringify({ ok: status < 300, msg }), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, "use POST");
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (!(await assinaturaOk(corpo, req.headers.get("x-shopify-hmac-sha256")))) {
    return resp(401, "assinatura inválida");
  }
  const topico = req.headers.get("x-shopify-topic") ?? "";
  let pedido: any;
  try {
    pedido = JSON.parse(new TextDecoder().decode(corpo));
  } catch {
    return resp(400, "JSON inválido");
  }
  const extId = "shopify:" + pedido.id; // usado nos pedidos

  try {
    if (topico === "orders/paid") {
      const { data: existe, error: e1 } = await sb
        .from("vendas").select("id").eq("ext_id", extId).maybeSingle();
      if (e1) throw e1;
      if (existe) return resp(200, "já importada");
      const venda = pedidoParaVenda(pedido);
      await separarFreteOMG(pedido, venda);
      const { error } = await sb.from("vendas").insert(venda);
      if (error) {
        if (error.code === "23505") return resp(200, "já importada");
        throw error;
      }
      return resp(200, "venda criada");
    }

    if (topico === "orders/cancelled") {
      const { error } = await sb.from("vendas")
        .update({ cancelada: true, atualizado_em: new Date().toISOString() })
        .eq("ext_id", extId);
      if (error) throw error;
      return resp(200, "venda cancelada");
    }

    if (topico === "products/create" || topico === "products/update") {
      // Responde na hora e grava em segundo plano: quando o Shopify manda centenas de avisos de uma vez
      // (troca de fotos, ativação em massa), esperar a gravação estourava o tempo e o aviso contava como falha.
      // Se algo falhar aqui, o botão "Sincronizar catálogo" do ERP acerta tudo.
      const tarefa = gravarProdutos(sb, produtoParaLinhas(pedido)).catch((e) => console.error(topico, pedido?.handle, e));
      // @ts-ignore EdgeRuntime existe no Supabase
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(tarefa); else await tarefa;
      return resp(200, "catálogo: recebido");
    }

    if (topico === "products/delete") {
      await marcarExcluido(sb, pedido.id);
      return resp(200, "produto marcado como excluído");
    }

    return resp(200, "tópico ignorado: " + topico);
  } catch (e) {
    console.error(topico, pedido?.name, e);
    // 500 faz o Shopify tentar de novo (até 8 vezes em 4 horas)
    return resp(500, "erro ao gravar");
  }
});

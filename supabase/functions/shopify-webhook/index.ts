// Recebe os avisos (webhooks) do Shopify e grava as vendas no ERP.
// Tópicos usados: orders/paid (cria a venda), orders/cancelled (marca como cancelada),
// products/create e products/update (atualiza o Catálogo), products/delete (marca como excluído do site).
// Segredo necessário (Supabase → Edge Functions → Secrets): SHOPIFY_WEBHOOK_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";
import { pedidoParaVenda } from "./map.js";
import { gravarProdutos, marcarExcluido, produtoParaLinhas } from "../_shared/produtos.js";

const SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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
      const { error } = await sb.from("vendas").insert(pedidoParaVenda(pedido));
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
      const r = await gravarProdutos(sb, produtoParaLinhas(pedido));
      return resp(200, `catálogo: ${r.novos} novos, ${r.atualizados} atualizados`);
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

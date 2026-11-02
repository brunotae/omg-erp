// Frete OMG: frete + seguro + impostos (Remessa Conforme) num valor só, calculado por nós.
// Dois usos:
//  1) Shopify (Carrier Service): POST { rate: { destination: { postal_code, province, country }, items: [{ grams, price (centavos), quantity }] } }
//     → { rates: [{ service_name, service_code, total_price (centavos), currency, description }] }
//  2) Simulação (ERP, calculadora do site, comparação com a Shipsmart): POST { simular: { cep, uf?, itens: [{ grams, price (centavos), quantity }] } }
//     → { ok, detalhe } com cada parte da conta.
// Regra (Tae · 30/10/2026):
//  peso = soma dos produtos + 100 g de embalagem
//  frete internacional = US$ 10 por kg (proporcional)
//  frete nacional = tabela da Mile (faixa do CEP: entrega própria; senão redespacho do estado) + seguro 1% do valor declarado
//  valor aduaneiro (VA) = mercadoria + frete + seguro
//  imposto de importação: mercadoria até US$ 50 → 0; acima → 60% × VA − US$ 30
//  ICMS por dentro sobre (VA + II), alíquota do estado
//  câmbio fixo R$ 5,40 (config 'frete_omg' no ERP). Sem IBS/CBS.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

import { calcular, usarBanco } from "../_shared/frete_calc.ts";
usarBanco(sb);

const fmt = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (st: number, b: unknown) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });
  let b: any; try { b = await req.json(); } catch { return json(400, { erro: "JSON inválido" }); }

  if (b?.simular) {
    try { return json(200, { ok: true, detalhe: await calcular(b.simular.cep, b.simular.uf || null, b.simular.itens || []) }); }
    catch (e) { return json(200, { ok: false, erro: String((e as Error).message || e) }); }
  }

  // 3) Vários produtos de uma vez (preço final estimado nas vitrines do site): { lote: { cep, itens: [{ k, grams, price }] } } → { ok, totais: { k: total } }
  if (b?.lote) {
    const its = (Array.isArray(b.lote.itens) ? b.lote.itens : []).slice(0, 60);
    const totais: Record<string, number> = {};
    await Promise.all(its.map(async (i: any) => {
      try { const x = await calcular(b.lote.cep, null, [{ grams: Number(i.grams) || 300, price: Number(i.price) || 0, quantity: 1 }]); totais[String(i.k)] = x.brl.total_pedido; } catch { /* sem preço para este */ }
    }));
    return json(200, { ok: true, totais });
  }

  if (b?.rate) {
    const d = b.rate.destination || {};
    if (String(d.country || "BR").toUpperCase() !== "BR") return json(200, { rates: [] });
    try {
      const itens = (b.rate.items || []).filter((i: any) => i.requires_shipping !== false);
      const x = await calcular(d.postal_code, d.province || null, itens);
      // Nome da linha = o que aparece no checkout, no e-mail do pedido e na página do pedido:
      // deixa claro que não é só frete — tem tributo pago (Tae · 31/10/2026).
      // Checkout só aceita texto corrido (sem quebra de linha nem negrito): nome curto + descrição em blocos curtos.
      // Nome deixa claro que inclui tributos (Tae · 31/10/2026); layout simplificado (Tae · 02/11/2026).
      const trib = x.brl.ii + x.brl.icms;
      const prazo = String(x.cfg.prazo || "").replace(/^De /, "");
      const fr = x.frete_gratis ? "Frete grátis" : `Frete ${fmt(x.brl.frete_seguro)}`;
      if (x.cfg.icms_shopify) {
        // ICMS sai na linha "Impostos" do Shopify; aqui só frete + seguro (+ imposto de importação, quando houver).
        const linha = x.brl.frete_seguro + x.brl.ii;
        const nm = (x.frete_gratis ? "Frete grátis" : "Entrega") + (x.brl.ii > 0 ? " + imposto de importação" : "") + ` · ${prazo}`;
        const ds = x.brl.ii > 0 ? `${fr} · Imposto de importação ${fmt(x.brl.ii)}` : `${fr} · ICMS na linha de impostos`;
        return json(200, { rates: [{ service_name: nm, service_code: "OMG_INTL", total_price: String(Math.round(linha * 100)), currency: "BRL", description: ds }] });
      }
      const nome = `${x.frete_gratis ? "Frete grátis" : "Entrega"} + impostos · ${prazo}`;
      const desc = trib > 0 ? `${fr} · Impostos ${fmt(trib)} (detalhes no carrinho)` : `${fr} · sem impostos`;
      return json(200, { rates: [{ service_name: nome, service_code: "OMG_INTL", total_price: String(Math.round(x.brl.total_linha * 100)), currency: "BRL", description: desc }] });
    } catch (e) {
      console.error("frete-omg", String((e as Error).message || e));
      return json(200, { rates: [] });
    }
  }
  return json(400, { erro: "envie rate (Shopify) ou simular" });
});

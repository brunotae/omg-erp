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

  if (b?.rate) {
    const d = b.rate.destination || {};
    if (String(d.country || "BR").toUpperCase() !== "BR") return json(200, { rates: [] });
    try {
      const itens = (b.rate.items || []).filter((i: any) => i.requires_shipping !== false);
      const x = await calcular(d.postal_code, d.province || null, itens);
      const desc = x.cfg.detalhar
        ? `${x.cfg.prazo} para capitais · Frete e seguro: ${fmt(x.brl.frete_seguro)} · Imposto de importação: ${fmt(x.brl.ii)} · ICMS ${x.aliquota_icms}% ${x.uf}: ${fmt(x.brl.icms)}`
        : `${x.cfg.prazo} · Frete, seguro e impostos inclusos (Remessa Conforme)`;
      return json(200, { rates: [{ service_name: x.cfg.nome, service_code: "OMG_INTL", total_price: String(Math.round(x.brl.total_linha * 100)), currency: "BRL", description: desc }] });
    } catch (e) {
      console.error("frete-omg", String((e as Error).message || e));
      return json(200, { rates: [] });
    }
  }
  return json(400, { erro: "envie rate (Shopify) ou simular" });
});

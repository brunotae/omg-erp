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

const CFG0 = {
  usd: 5.40, intl_usd_kg: 10, embalagem_g: 100, seguro_pct: 1,
  ii_isencao_usd: 50, ii_pct: 60, ii_deducao_usd: 30,
  icms: { AC: 20, AL: 20, BA: 20, CE: 20, MG: 20, PB: 20, PI: 20, RN: 20, RR: 20, SE: 20,
    AP: 17, AM: 17, DF: 17, ES: 17, GO: 17, MA: 17, MT: 17, MS: 17, PA: 17, PR: 17, PE: 17, RJ: 17, RS: 17, RO: 17, SC: 17, SP: 17, TO: 17 } as Record<string, number>,
  nome: "Entrega internacional OMG",
  prazo: "Até 15 dias úteis",
  detalhar: true,
};
let CACHE: { t: number; cfg: typeof CFG0; mile: any } | null = null;

async function dados() {
  if (CACHE && Date.now() - CACHE.t < 5 * 60 * 1000) return CACHE;
  const { data } = await sb.from("config").select("chave,valor").in("chave", ["frete_omg", "frete_mile"]);
  const m = new Map((data || []).map((r: any) => [r.chave, r.valor]));
  const c = m.get("frete_omg") || {};
  const cfg = { ...CFG0, ...c, icms: { ...CFG0.icms, ...(c.icms || {}) } };
  CACHE = { t: Date.now(), cfg, mile: m.get("frete_mile") };
  return CACHE;
}

// Preço da faixa de peso: primeira faixa ≥ peso; acima da última, soma o kg adicional.
function faixa(tab: Record<string, number>, add: number | undefined, g: number) {
  const fs = Object.keys(tab).map(Number).sort((a, b) => a - b);
  for (const f of fs) if (g <= f) return tab[String(f)];
  const ult = fs[fs.length - 1];
  return tab[String(ult)] + Math.ceil((g - ult) / 1000) * (add || 0);
}

async function regiao(cep: number) {
  for (const tipo of ["proprio", "redespacho"]) {
    const { data } = await sb.from("frete_cep").select("ini,fim,regiao,uf,prazo").eq("tipo", tipo).lte("ini", cep).order("ini", { ascending: false }).limit(1);
    const r = data?.[0];
    if (r && r.fim >= cep) return { tipo, ...r };
  }
  return null;
}

// UF pelo CEP (faixas dos Correios). Usado quando o CEP não está na tabela da Mile: vai pelo redespacho do estado.
const UF_CEP: [number, number, string][] = [
  [1000000, 19999999, "SP"], [20000000, 28999999, "RJ"], [29000000, 29999999, "ES"], [30000000, 39999999, "MG"],
  [40000000, 48999999, "BA"], [49000000, 49999999, "SE"], [50000000, 56999999, "PE"], [57000000, 57999999, "AL"],
  [58000000, 58999999, "PB"], [59000000, 59999999, "RN"], [60000000, 63999999, "CE"], [64000000, 64999999, "PI"],
  [65000000, 65999999, "MA"], [66000000, 68899999, "PA"], [68900000, 68999999, "AP"], [69000000, 69299999, "AM"],
  [69300000, 69399999, "RR"], [69400000, 69899999, "AM"], [69900000, 69999999, "AC"], [70000000, 72799999, "DF"],
  [72800000, 72999999, "GO"], [73000000, 73699999, "DF"], [73700000, 76799999, "GO"], [76800000, 76999999, "RO"],
  [77000000, 77999999, "TO"], [78000000, 78899999, "MT"], [79000000, 79999999, "MS"], [80000000, 87999999, "PR"],
  [88000000, 89999999, "SC"], [90000000, 99999999, "RS"],
];
const ufDoCep = (cep: number) => (UF_CEP.find(([a, z]) => cep >= a && cep <= z) || [0, 0, ""])[2];

const r2 = (x: number) => Math.round(x * 100) / 100;

export async function calcular(cepTxt: string, ufInf: string | null, itens: { grams: number; price: number; quantity: number }[]) {
  const { cfg, mile } = await dados();
  if (!mile) throw new Error("tabela da Mile não carregada");
  const cep = parseInt(String(cepTxt || "").replace(/\D/g, ""), 10);
  if (!(cep > 0)) throw new Error("CEP inválido");
  let reg: any = await regiao(cep);
  if (!reg) {
    const u = ufDoCep(cep) || String(ufInf || "").toUpperCase();
    if (!u) throw new Error("CEP inválido");
    reg = { tipo: "redespacho", regiao: "RD " + u, uf: u, prazo: null };
  }
  const uf = String(reg.uf || ufInf || "").toUpperCase();
  const aliq = Number(cfg.icms[uf]);
  if (!(aliq > 0)) throw new Error("sem alíquota de ICMS para " + uf);
  const pesoProd = itens.reduce((s, i) => s + Math.max(0, Number(i.grams) || 0) * (Number(i.quantity) || 1), 0);
  const peso = pesoProd + Number(cfg.embalagem_g);
  const mercBRL = itens.reduce((s, i) => s + (Number(i.price) || 0) / 100 * (Number(i.quantity) || 1), 0);
  const usd = Number(cfg.usd);
  const merc = mercBRL / usd;
  const intl = Number(cfg.intl_usd_kg) * peso / 1000;
  let nacional: number, origemNac: string;
  if (reg.tipo === "proprio" && mile.lm[reg.regiao]) { nacional = faixa(mile.lm[reg.regiao], mile.lm_add?.[reg.regiao], peso); origemNac = "Mile " + reg.regiao; }
  else if (mile.rd[uf]) { nacional = faixa(mile.rd[uf], mile.rd_add?.[uf], peso); origemNac = "Mile redespacho " + uf; }
  else throw new Error("sem preço da Mile para " + reg.regiao);
  const seguro = merc * Number(cfg.seguro_pct) / 100;
  const frete = intl + nacional + seguro;
  const va = merc + frete;
  const ii = merc <= Number(cfg.ii_isencao_usd) ? 0 : Math.max(0, va * Number(cfg.ii_pct) / 100 - Number(cfg.ii_deducao_usd));
  const icms = (va + ii) * aliq / (100 - aliq);
  const linhaUSD = frete + ii + icms;
  const B = (x: number) => r2(x * usd);
  return {
    cep: String(cep).padStart(8, "0"), uf, regiao: reg.regiao, entrega: reg.tipo, prazo_mile: reg.prazo,
    peso_g: peso, cambio: usd, aliquota_icms: aliq,
    usd: { mercadoria: r2(merc), frete_internacional: r2(intl), frete_nacional: r2(nacional), seguro: r2(seguro), frete_seguro: r2(frete), valor_aduaneiro: r2(va), ii: r2(ii), icms: r2(icms), total_linha: r2(linhaUSD) },
    brl: { mercadoria: r2(mercBRL), frete_seguro: B(frete), ii: B(ii), icms: B(icms), total_linha: B(linhaUSD), total_pedido: r2(mercBRL + B(linhaUSD)) },
    origem_nacional: origemNac,
    cfg: { nome: cfg.nome, prazo: cfg.prazo, detalhar: cfg.detalhar },
  };
}

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

// alerta-precos · v1 (19/11/2026)
// Compara o "Cliente SP paga" do preço ATUAL do site (mesma conta do Pricing do ERP) com o menor preço Pix do concorrente válido (KS, Jini, Sephora BR).
// Se a OMG ficar mais cara, grava a lista em config.alerta_precos (o ERP mostra no Painel e no Pricing) e manda e-mail aos editores do ERP (Resend).
// Chamado no fim da leitura semanal (GitHub Actions precos-ler) ou pelo ERP. Pedido: { enviar?: boolean } (padrão true). No máximo 1 e-mail a cada 12 h.
import { createClient } from "npm:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const pr90 = (v: number) => Math.round((Math.floor(v + 0.10) - 0.10) * 100) / 100;
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LOJA: Record<string, string> = { ks: "KS", jini: "Jini", sephora: "Sephora BR" };
const CFG0 = { desc: 5, frete: 35, icms: 20, icmsRef: 17, seguro: 1, usd: null, cambio: null, fretes: {} as Record<string, number> };

async function tudo(t: string, sel = "*") { let a: any[] = [], de = 0; for (;;) { const { data, error } = await admin.from(t).select(sel).range(de, de + 999); if (error) throw error; a = a.concat(data || []); if (!data || data.length < 1000) break; de += 1000; } return a; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  const b: any = await req.json().catch(() => ({}));
  const enviar = b?.enviar !== false;
  try {
    const [prods, refs, cat, itens, cfgR] = await Promise.all([
      tudo("produtos", "id,sku,nome,marca,preco,peso_g,ativo,shopify_variant_id"),
      tudo("precos_ref"), tudo("conc_catalogo"), tudo("pricing_itens"),
      admin.from("config").select("chave,valor").in("chave", ["pricing", "alerta_precos"]),
    ]);
    const cfgs = Object.fromEntries((cfgR.data || []).map((r: any) => [r.chave, r.valor]));
    const C: any = { ...CFG0, ...(cfgs.pricing || {}) };
    const cam = num(C.usd) && num(C.usd)! > 0 ? num(C.usd)! : num(C.cambio) && num(C.cambio)! > 0 ? num(C.cambio)! : null;
    const catUrl = new Map(cat.map((c: any) => [c.url, c]));
    const itemBy = new Map(itens.map((i: any) => [i.produto_id, i]));
    const refsBy = new Map<string, any[]>(); refs.forEach((r: any) => { const L = refsBy.get(r.produto_id) || []; L.push(r); refsBy.set(r.produto_id, L); });
    const fp = Math.min(100, Math.max(0, Number(C.frete) || 0)) / 100, seg = (Number(C.seguro) || 0) / 100, icms = (Number(C.icms) || 0) / 100, icmsRef = (Number(C.icmsRef) || 0) / 100;
    const caros: any[] = [];
    for (const p of prods) {
      if (!p.ativo || !p.shopify_variant_id) continue;
      const atual = num(p.preco); const peso = Number(p.peso_g) > 0 ? Math.round(Number(p.peso_g)) : null;
      if (!atual || atual <= 0 || !peso) continue;
      const val = (refsBy.get(p.id) || []).filter((r) => r.status === "ok" && r.loja !== "exterior" && r.url && r.quem !== "automático").map((r) => {
        const c: any = catUrl.get(r.url) || {}; const preco = num(c.preco); const pix = num(c.preco_pix) || preco;
        return { loja: r.loja, url: r.url, preco, pix, ativo: c.ativo !== false, esgotado: !!c.esgotado };
      }).filter((r) => r.ativo && !r.esgotado && (r.preco || 0) > 0).sort((a, b) => (a.pix || 0) - (b.pix || 0));
      if (!val.length) continue;
      const ref = val[0]; const baseCheio = num((C.fretes || {})[String(peso)]); if (baseCheio == null) continue;
      const base = baseCheio * fp; const frete = base + seg * atual;
      const ii = cam && atual / cam > 50 ? Math.max(0, 0.6 * (atual + frete) / cam - 30) * cam : 0;
      const final = (atual + frete + ii) / (1 - icmsRef);
      if (final <= (ref.pix || 0) + 0.005) continue;
      const it: any = itemBy.get(p.id) || {}; const d = num(it.desc_pct) ?? Number(C.desc) ?? 0;
      const alvo = (ref.pix || 0) * (1 - d / 100); const s = (alvo * (1 - icms) - base) / (1 + seg); const sug = s >= 5 ? pr90(s) : null;
      caros.push({ id: p.id, sku: p.sku, nome: p.nome, marca: p.marca, atual, final: Math.round(final * 100) / 100, loja: ref.loja, ref: ref.pix, url: ref.url, dif: Math.round((final / (ref.pix || 1) - 1) * 1000) / 10, sug });
    }
    caros.sort((a, b) => b.dif - a.dif);
    const ant: any = cfgs.alerta_precos || {};
    const agora = new Date().toISOString();
    const podeEnviar = enviar && caros.length > 0 && RESEND && (!ant.enviado_em || Date.now() - Date.parse(ant.enviado_em) > 12 * 3600e3);
    let enviado_em = ant.enviado_em || null, para: string[] = [];
    if (podeEnviar) {
      const { data: m } = await admin.from("membros").select("email,papel"); para = (m || []).filter((x: any) => x.papel === "editor").map((x: any) => x.email);
      if (para.length) {
        const linhas = caros.slice(0, 60).map((x) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${x.sku}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${(x.marca || "")} · ${String(x.nome || "").slice(0, 70)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${brl(x.final)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${brl(x.ref)} <small>${LOJA[x.loja] || x.loja}</small></td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#B5303B">+${x.dif}%</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${x.sug ? brl(x.sug) : "—"}</td></tr>`).join("");
        const html = `<div style="font-family:Arial,sans-serif;color:#222"><h2 style="margin:0 0 6px">${caros.length} produto(s) mais caros que o concorrente</h2><p style="margin:0 0 12px;color:#555">Preço entregue em São Paulo (produto + frete + impostos, mesma conta do checkout) maior que o menor preço Pix da KS, Jini ou Sephora BR.</p><table style="border-collapse:collapse;font-size:13px"><tr style="background:#f6f6f6"><th style="padding:4px 8px;text-align:left">SKU</th><th style="padding:4px 8px;text-align:left">Produto</th><th style="padding:4px 8px">Cliente SP paga</th><th style="padding:4px 8px">Concorrente</th><th style="padding:4px 8px">Diferença</th><th style="padding:4px 8px">Preço sugerido</th></tr>${linhas}</table><p style="margin:14px 0 0"><a href="https://brunotae.github.io/omg-erp/index.html?tela=pricing">Abrir o Pricing no ERP</a> · filtro "Mais caros que o concorrente". O preço só muda depois do seu OK no Pricing.</p></div>`;
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + RESEND, "content-type": "application/json" }, body: JSON.stringify({ from: "OMG Alertas <relatorio@mintess.com>", to: para, subject: `⚠️ OMG: ${caros.length} produto(s) mais caros que o concorrente`, html }) });
        if (r.ok) enviado_em = agora;
      }
    }
    await admin.from("config").upsert({ chave: "alerta_precos", valor: { em: agora, total: caros.length, itens: caros.slice(0, 300), enviado_em } });
    return resp(200, { ok: true, total: caros.length, enviado: enviado_em === agora, para });
  } catch (e) { return resp(500, { erro: String((e as Error).message || e) }); }
});

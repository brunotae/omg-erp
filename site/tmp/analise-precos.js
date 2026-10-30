// Análise de preços por marca (roda na aba do ERP, que já tem login). Uso:
//   const m = await import('/omg-erp/site/tmp/analise-precos.js?'+Date.now()); await m.analisar('medicube')
const SB = 'https://nzsiuniabovvptuqmkmi.supabase.co/rest/v1/';
const KEY = 'sb_publishable_9Nl_ZRXEmLMhDMBP8oKP_w_FuDXaYMq';
const CAMBIO = 5.4, ACRESC = 0.2;

async function rest(q) {
  const a = JSON.parse(localStorage.getItem('omg-erp-auth'));
  const out = []; let off = 0;
  for (;;) {
    const r = await fetch(SB + q + `&offset=${off}&limit=1000`, { headers: { apikey: KEY, authorization: 'Bearer ' + a.access_token } });
    const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
    out.push(...j); if (j.length < 1000) return out; off += 1000;
  }
}
const STOP = new Set('de da do das dos com e para a o em the and with of for by facial face mascara máscara serum sérum creme cream gel ml g un unidades kit medicube'.split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const toks = s => new Set(norm(s).replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)));
function vol(s) {
  const m = norm(s).match(/(\d+(?:[.,]\d+)?)\s*(ml|g|un|unidades|pads?|ea|pcs)\b/);
  return m ? { n: parseFloat(m[1].replace(',', '.')), u: m[2].startsWith('pad') || m[2] === 'un' || m[2] === 'unidades' || m[2] === 'ea' || m[2] === 'pcs' ? 'un' : m[2] } : null;
}
const jac = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1); };

export async function analisar(marca) {
  const prods = await rest(`produtos?select=sku,nome,preco,site_status,shopify_product_id&marca=ilike.${encodeURIComponent(marca + '*')}`);
  const conc = await rest(`conc_catalogo?select=loja,nome,preco,esgotado,url&ativo=eq.true&or=(nome.ilike.*${marca}*,marca.ilike.*${marca}*)`);
  const ofic = await (await fetch(`/omg-erp/site/tmp/${marca.slice(0, 3)}-oficial.json?` + Date.now())).json();
  const offBy = Object.fromEntries(ofic.map(o => [o.sku, o]));
  const concT = conc.map(c => ({ ...c, t: toks(c.nome), v: vol(c.nome) }));
  const linhas = [];
  for (const p of prods.filter(p => p.site_status === 'active')) {
    const o = offBy[p.sku] || null;
    const v = vol(p.nome), t = toks(p.nome.split(' · ')[0]);
    const regraAtual = o?.usd ? o.usd * CAMBIO * (1 + ACRESC) : null;
    const regraCheio = o?.usd_cheio ? o.usd_cheio * CAMBIO * (1 + ACRESC) : regraAtual;
    let best = null;
    for (const c of concT) {
      if (v && c.v && (v.u !== c.v.u || Math.abs(v.n - c.v.n) / v.n > 0.15)) continue;
      const s = jac(t, c.t); if (!best || s > best.s) best = { s, c };
    }
    const cc = best && best.s >= 0.34 ? best.c : null;
    const f = [];
    const preco = Number(p.preco);
    if (regraAtual && preco < 0.8 * regraAtual) f.push(`BAIXO: R$${preco} < regra c/ promo R$${regraAtual.toFixed(0)}`);
    if (regraCheio && preco > 1.3 * regraCheio) f.push(`ALTO: R$${preco} > 130% regra cheia R$${regraCheio.toFixed(0)}`);
    if (cc && !cc.esgotado && preco > Number(cc.preco) * 1.02) f.push(`CONC: ${cc.loja.toUpperCase()} R$${cc.preco} (${cc.nome.slice(0, 60)})`);
    if (o && o.disp === 'Esgotado') f.push('ESGOTADO no site oficial');
    if (!o || o.sit === 'Sem par') f.push('SEM PAR no site oficial (pode ter saído de linha)');
    else if (/Provável|Fraco|Conferir/.test(o.sit)) f.push(`PAR DUVIDOSO: ${o.sit} → ${o.oficial} / ${o.var}`);
    linhas.push({ sku: p.sku, nome: p.nome.slice(0, 90), preco, usd: o?.usd ?? null, usd_cheio: o?.usd_cheio ?? null, regra: regraCheio ? Math.round(regraCheio) : null, conc: cc ? `${cc.loja}:${cc.preco}` : null, f });
  }
  // coerência interna: mesmo produto base com tamanhos diferentes
  const grupos = {};
  for (const l of linhas) { const b = norm(l.nome.split(':')[0].replace(/mini|refil|refill/gi, '')).trim(); (grupos[b] ||= []).push(l); }
  for (const g of Object.values(grupos)) {
    if (g.length < 2) continue;
    const comV = g.map(l => ({ l, v: vol(l.nome) })).filter(x => x.v);
    for (const a of comV) for (const b of comV) {
      if (a === b || a.v.u !== b.v.u) continue;
      if (a.v.n < b.v.n && a.l.preco > b.l.preco) a.l.f.push(`INCOERENTE: ${a.v.n}${a.v.u} custa mais que ${b.v.n}${b.v.u} (${b.l.sku} R$${b.l.preco})`);
    }
  }
  const prec = linhas.filter(l => l.regra);
  const razao = prec.map(l => l.preco / l.regra).sort((a, b) => a - b);
  return {
    total: linhas.length, rascunho: prods.filter(p => p.site_status !== 'active').length,
    com_oficial: prec.length, com_conc: linhas.filter(l => l.conc).length,
    mediana_preco_sobre_regra: razao.length ? +razao[Math.floor(razao.length / 2)].toFixed(2) : null,
    sinalizados: linhas.filter(l => l.f.length),
  };
}

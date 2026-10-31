// Relatório diário do site (visitas, funil, origem, cidades, checkouts, vendas).
// Roda todo dia às 8h (Brasília) pelo GitHub Actions: monta o relatório de ONTEM, grava em "relatorios"
// e manda por e-mail (Resend) para os endereços de config.relatorios.para.
//   POST {}                                → ontem; se já foi enviado, não faz nada (chamada pública é segura)
//   POST { dia, forcar: true, enviar }     → só editores do ERP (login): refaz um dia e, se enviar, manda de novo
// Segredos: SHOPIFY_* (mesmos do shopify-admin) e RESEND_API_KEY. App precisa de read_reports.
import { createClient } from "npm:@supabase/supabase-js@2";
import { tx, diaTxt } from "../_shared/relatorio_i18n.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const ERP_URL = "https://brunotae.github.io/omg-erp/";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const resp = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "content-type": "application/json" } });

let tk = { v: "", exp: 0 };
async function token() {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (tk.v && Date.now() < tk.exp) return tk.v;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Shopify recusou o token: " + r.status);
  tk = { v: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 };
  return tk.v;
}
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status).slice(0, 300));
  return j.data;
}
async function ql(q: string): Promise<any[]> {
  const d: any = await gql(`query($q: String!) { shopifyqlQuery(query: $q) { tableData { rows } parseErrors } }`, { q });
  const s = d.shopifyqlQuery;
  if (s.parseErrors?.length) throw new Error("ShopifyQL: " + s.parseErrors.join("; "));
  return s.tableData?.rows ?? [];
}
const n = (x: any) => Number(x) || 0;
const diaMais = (dia: string, k: number) => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const ontemBR = () => diaMais(new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), -1);

async function montar(dia: string) {
  const W = ` SINCE ${dia} UNTIL ${dia}`;
  const ini = `${dia}T03:00:00Z`, fim = `${diaMais(dia, 1)}T03:00:00Z`;
  const [fun, ant, hr, ref, utm, dev, reg, cid, land] = await Promise.all([
    ql("FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, bounce_rate, average_session_duration" + W),
    ql(`FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout SINCE ${diaMais(dia, -1)} UNTIL ${diaMais(dia, -1)}`),
    ql("FROM sessions SHOW sessions GROUP BY hour" + W + " ORDER BY hour"),
    ql("FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout GROUP BY referrer_source, referrer_name" + W + " ORDER BY sessions DESC"),
    ql("FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY utm_source, utm_campaign" + W + " ORDER BY sessions DESC LIMIT 10"),
    ql("FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY session_device_type" + W),
    ql("FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout GROUP BY session_country, session_region" + W + " ORDER BY sessions DESC"),
    ql("FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY session_country, session_region, session_city" + W + " ORDER BY sessions DESC LIMIT 40"),
    ql("FROM sessions SHOW sessions GROUP BY landing_page_path" + W + " ORDER BY sessions DESC LIMIT 8"),
  ]);
  const ck: any = await gql(`query($q: String!) { abandonedCheckouts(first: 100, query: $q) { nodes { createdAt completedAt
      totalPriceSet { shopMoney { amount } } discountCodes shippingAddress { provinceCode city } lineItems(first: 30) { nodes { title quantity } } } } }`,
    { q: `created_at:>=${ini} created_at:<${fim}` });
  const od: any = await gql(`query($q: String!) { orders(first: 250, query: $q) { nodes { name createdAt cancelledAt test
      currentTotalPriceSet { shopMoney { amount } } discountCodes shippingAddress { provinceCode city }
      lineItems(first: 50) { nodes { title quantity originalTotalSet { shopMoney { amount } } } }
      customerJourneySummary { firstVisit { source utmParameters { source campaign } } } } } }`,
    { q: `created_at:>=${ini} created_at:<${fim}` });
  const pedidos = od.orders.nodes.filter((o: any) => !o.test && !o.cancelledAt);
  const horas = Array(24).fill(0);
  for (const h of hr) { const d = new Date(h.hour); const bh = (d.getUTCHours() + 21) % 24; horas[bh] += n(h.sessions); }
  const f = fun[0] || {};
  const prod: Record<string, { q: number; v: number }> = {};
  for (const o of pedidos) for (const l of o.lineItems.nodes) {
    const p = prod[l.title] ||= { q: 0, v: 0 }; p.q += n(l.quantity); p.v += n(l.originalTotalSet?.shopMoney?.amount);
  }
  const cupons: Record<string, number> = {};
  for (const o of pedidos) for (const c of o.discountCodes || []) cupons[c] = (cupons[c] || 0) + 1;
  return {
    dia, gerado: new Date().toISOString(),
    visitas: n(f.sessions), pessoas: n(f.online_store_visitors), carrinho: n(f.sessions_with_cart_additions),
    checkout: n(f.sessions_that_reached_checkout), rejeicao: n(f.bounce_rate), duracao_s: n(f.average_session_duration),
    anterior: { visitas: n(ant[0]?.sessions), carrinho: n(ant[0]?.sessions_with_cart_additions), checkout: n(ant[0]?.sessions_that_reached_checkout) },
    horas,
    origem: ref.map((r: any) => ({ fonte: r.referrer_source, nome: r.referrer_name, visitas: n(r.sessions), carrinho: n(r.sessions_with_cart_additions), checkout: n(r.sessions_that_reached_checkout) })),
    utm: utm.filter((u: any) => u.utm_source || u.utm_campaign).map((u: any) => ({ fonte: u.utm_source, campanha: u.utm_campaign, visitas: n(u.sessions), carrinho: n(u.sessions_with_cart_additions) })),
    aparelho: dev.map((d: any) => ({ tipo: d.session_device_type, visitas: n(d.sessions), carrinho: n(d.sessions_with_cart_additions) })),
    regioes: reg.map((r: any) => ({ pais: r.session_country, regiao: r.session_region, visitas: n(r.sessions), carrinho: n(r.sessions_with_cart_additions), checkout: n(r.sessions_that_reached_checkout) })),
    cidades: cid.filter((c: any) => c.session_country === "Brazil").map((c: any) => ({ regiao: c.session_region, cidade: c.session_city, visitas: n(c.sessions), carrinho: n(c.sessions_with_cart_additions) })),
    entradas: land.map((l: any) => ({ pagina: l.landing_page_path, visitas: n(l.sessions) })),
    checkouts: ck.abandonedCheckouts.nodes.filter((c: any) => !c.completedAt).map((c: any) => ({ hora: c.createdAt, total: n(c.totalPriceSet?.shopMoney?.amount),
      cupom: (c.discountCodes || []).join(", "), uf: c.shippingAddress?.provinceCode || "", cidade: c.shippingAddress?.city || "",
      itens: c.lineItems.nodes.map((l: any) => (l.quantity > 1 ? l.quantity + "× " : "") + l.title) })),
    compras: pedidos.length, faturamento: pedidos.reduce((a: number, o: any) => a + n(o.currentTotalPriceSet?.shopMoney?.amount), 0),
    pedidos: pedidos.map((o: any) => ({ nome: o.name, hora: o.createdAt, total: n(o.currentTotalPriceSet?.shopMoney?.amount), uf: o.shippingAddress?.provinceCode || "",
      cidade: o.shippingAddress?.city || "", cupons: o.discountCodes || [], origem: o.customerJourneySummary?.firstVisit?.utmParameters?.source || o.customerJourneySummary?.firstVisit?.source || "" })),
    produtos: Object.entries(prod).map(([t, p]) => ({ titulo: t, qtd: p.q, valor: p.v })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    cupons: Object.entries(cupons).map(([c, q]) => ({ cupom: c, usos: q })),
  };
}

// ---------- leitura (fato → leitura → ação): guarda o código e os números; o texto sai no idioma de quem lê ----------
export function leituras(d: any) {
  const L: { cor: string; id: string; v: Record<string, unknown> }[] = [];
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const br = d.regioes.filter((r: any) => r.pais === "Brazil").reduce((a: number, r: any) => a + r.visitas, 0);
  const fora = d.visitas - br;
  const direto = d.origem.filter((o: any) => o.fonte === "direct" || !o.fonte).reduce((a: number, o: any) => a + o.visitas, 0);
  if (d.compras > 0) L.push({ cor: "ok", id: "compras", v: { n: d.compras, v: fmt(d.faturamento) } });
  if (d.checkout > 0 && d.compras === 0) L.push({ cor: "bad", id: "ck0", v: { n: d.checkout } });
  else if (d.checkout > d.compras * 2 && d.compras > 0) L.push({ cor: "bad", id: "ckdes", v: { p: pct(d.checkout - d.compras, d.checkout) } });
  if (d.visitas >= 20 && pct(d.carrinho, d.visitas) < 3) L.push({ cor: "warn", id: "carr", v: { p: pct(d.carrinho, d.visitas) } });
  if (d.visitas >= 20 && d.rejeicao >= 0.6) L.push({ cor: "warn", id: "rej", v: { p: Math.round(d.rejeicao * 100) } });
  if (d.visitas > 0 && pct(direto, d.visitas) >= 80) L.push({ cor: "warn", id: "dir", v: { p: pct(direto, d.visitas) } });
  if (d.visitas > 0 && pct(fora, d.visitas) >= 15) L.push({ cor: "warn", id: "fora", v: { p: pct(fora, d.visitas), br } });
  const va = d.anterior.visitas;
  if (va >= 10 && d.visitas >= va * 1.3) L.push({ cor: "ok", id: "sobe", v: { p: pct(d.visitas - va, va) } });
  if (va >= 10 && d.visitas <= va * 0.7) L.push({ cor: "warn", id: "cai", v: { p: pct(va - d.visitas, va) } });
  if (!L.length) L.push({ cor: "ok", id: "nada", v: {} });
  return L.slice(0, 4);
}
function fmt(v: number, dec = 2) { return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ---------- e-mail (HTML de tabelas, funciona em Gmail/Outlook) ----------
const pagNome = (p: string, L: string) => p === "/" ? tx(L, "home") : p.startsWith("/products/") ? tx(L, "prodp") + " · " + p.slice(10, 60).replace(/-/g, " ") : p.startsWith("/collections/") ? tx(L, "coll") + " · " + p.slice(13).replace(/-/g, " ") : p;
const nomeOrigem = (o: any, L: string) => o.fonte === "direct" ? tx(L, "direct") : o.fonte === "search" ? tx(L, "search") + " · " + (o.nome || "") : o.fonte === "social" ? tx(L, "social") + " · " + (o.nome || "") : o.nome ? tx(L, "link") + " · " + o.nome : tx(L, "others");
const leitTxt = (l: any, L: string) => l.id ? { t: tx(L, "L_" + l.id + "_t", l.v), x: tx(L, "L_" + l.id + "_x", l.v) } : { t: l.titulo, x: l.texto };

function email(d: any, L: string) {
  const F = "#B83D66", FL = "#FBE7EE", FM = "#E7A3B9", MUT = "#7A6A70";
  const T = (k: string) => tx(L, k);
  const delta = (a: number, b: number) => !b ? "" : a >= b ? `<span style="color:#2E8B57">▲ ${Math.round((a - b) / b * 100)}%</span>` : `<span style="color:#C0392B">▼ ${Math.round((b - a) / b * 100)}%</span>`;
  const tile = (l: string, v: string, s: string) => `<td width="20%" style="background:${FL};border-radius:8px;padding:10px 8px;vertical-align:top"><div style="font-size:10px;color:${MUT};font-weight:700;text-transform:uppercase">${l}</div><div style="font-size:24px;font-weight:800;color:${F};line-height:1.2">${v}</div><div style="font-size:11px;font-weight:700;color:${MUT}">${s}</div></td>`;
  const mx = Math.max(1, ...d.horas);
  const barras = d.horas.map((v: number, i: number) => `<td valign="bottom" align="center" style="padding:0 1px"><div style="font-size:8px;color:${MUT}">${v || ""}</div><div style="height:${Math.round(v / mx * 70)}px;background:${v === mx ? F : FM};border-radius:2px 2px 0 0"></div><div style="font-size:8px;color:${MUT}">${i % 3 === 0 ? i + "h" : "&nbsp;"}</div></td>`).join("");
  const fun = [[T("f1"), d.visitas], [T("f2"), d.carrinho], [T("f3"), d.checkout], [T("f4"), d.compras]].map(([l, v]: any, i: number) =>
    `<tr><td style="font-size:12px;padding:3px 6px 3px 0;width:90px">${l}</td><td><div style="height:14px;width:${Math.max(1, Math.round(v / Math.max(1, d.visitas) * 100))}%;background:${i === 3 ? F : FM};border-radius:3px"></div></td><td style="font-size:12px;font-weight:700;text-align:right;white-space:nowrap;padding-left:6px">${v} · ${d.visitas ? fmt(v / d.visitas * 100, 1) : 0}%</td></tr>`).join("");
  const linhas = (rows: string[][], cab: string[]) => `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px"><tr>${cab.map((c, i) => `<th style="font-size:10px;color:${MUT};text-align:${i ? "right" : "left"};border-bottom:1px solid #EEDDE3;padding:3px">${c}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:4px 3px;border-bottom:1px solid #F6ECEF;text-align:${i ? "right" : "left"}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
  const br = d.regioes.filter((r: any) => r.pais === "Brazil");
  const paises: Record<string, number> = {};
  for (const r of d.regioes) { const k = ["Brazil", "South Korea", "China", "United States"].includes(r.pais) ? T(r.pais) : T("Other"); paises[k] = (paises[k] || 0) + r.visitas; }
  const cel = d.aparelho.find((a: any) => a.tipo === "mobile")?.visitas || 0;
  const cor: any = { ok: "#2E8B57", warn: "#D98E04", bad: "#C0392B" };
  const sec = (t: string, c: string) => `<tr><td style="padding:14px 0 4px;font-size:12px;font-weight:800;color:${F};text-transform:uppercase">${t}</td></tr><tr><td>${c}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#F7F2F4;font-family:Helvetica,Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#2A1F24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:12px;padding:18px">
<tr><td style="border-bottom:3px solid ${F};padding-bottom:6px"><span style="font-size:22px;font-weight:800">OMG! <span style="color:${F}">${T("title")}</span></span><br><span style="font-size:12px;color:${MUT}">${diaTxt(d.dia, L, true)} · ${T("cmp")}</span></td></tr>
<tr><td style="padding-top:10px"><table width="100%" cellspacing="6" cellpadding="0"><tr>
${tile(T("visits"), String(d.visitas), delta(d.visitas, d.anterior.visitas) || d.pessoas + " " + T("people"))}
${tile(T("cart"), String(d.carrinho), delta(d.carrinho, d.anterior.carrinho) || "")}
${tile(T("checkout"), String(d.checkout), delta(d.checkout, d.anterior.checkout) || "")}
${tile(T("orders"), String(d.compras), d.compras ? "R$ " + fmt(d.faturamento, 0) : T("none"))}
${tile(T("mobile"), d.visitas ? Math.round(cel / d.visitas * 100) + "%" : "–", Math.round(d.duracao_s / 60) + " " + T("minvisit"))}
</tr></table></td></tr>
${sec(T("hourly") + " · " + T("brt"), `<table width="100%" cellpadding="0" cellspacing="0" style="height:100px"><tr>${barras}</tr></table>`)}
${sec(T("funnel"), `<table width="100%" cellpadding="0" cellspacing="0">${fun}</table>`)}
${sec(T("todo"), d.leituras.map((l: any) => { const x = leitTxt(l, L); return `<div style="border-left:4px solid ${cor[l.cor]};background:#FDF5F7;padding:7px 10px;margin:5px 0;border-radius:0 6px 6px 0"><b style="font-size:13px">${esc(x.t)}</b><div style="font-size:12px;margin-top:2px">${esc(x.x)}</div></div>`; }).join(""))}
${d.pedidos.length ? sec(T("purchases"), linhas(d.pedidos.map((p: any) => [esc(p.nome) + " · " + esc(p.cidade) + "/" + esc(p.uf), esc(p.cupons.join(", ") || "–"), esc(p.origem || "–"), "R$ " + fmt(p.total)]), [T("order"), T("coupon"), T("origin"), T("total")])) : ""}
${d.checkouts.length ? sec(T("abandoned"), linhas(d.checkouts.map((c: any) => [esc(c.itens.join(" + ")), esc(c.cidade) + "/" + esc(c.uf), esc(c.cupom || "–"), "R$ " + fmt(c.total)]), [T("prodp"), T("city"), T("coupon"), T("total")])) : ""}
${sec(T("src"), linhas(d.origem.slice(0, 6).map((o: any) => [esc(nomeOrigem(o, L)), String(o.visitas), String(o.carrinho), String(o.checkout)]), [T("origin"), T("visits"), T("cart"), T("checkout")]))}
${sec(T("entry"), linhas((d.entradas || []).slice(0, 5).map((e: any) => [esc(pagNome(e.pagina, L)), String(e.visitas)]), [T("page"), T("visits")]))}
${sec(T("where"), `<div style="font-size:12px;line-height:1.6">${Object.entries(paises).map(([p, v]) => `<b>${p}</b> ${v}`).join(" · ")}<br>${T("Brazil")}: ${br.slice(0, 6).map((r: any) => `${esc(r.regiao || "?")} <b>${r.visitas}</b>${r.carrinho ? ` (${r.carrinho} ${T("cart").toLowerCase()})` : ""}`).join(" · ")}<br>${T("cities")}: ${d.cidades.slice(0, 6).map((c: any) => `${esc(c.cidade)} <b>${c.visitas}</b>`).join(" · ")}</div>`)}
<tr><td style="padding-top:16px" align="center"><a href="${ERP_URL}?lang=${L}#relatorios" style="background:${F};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:13px">${T("openerp")}</a></td></tr>
<tr><td style="padding-top:12px;font-size:10px;color:${MUT}" align="center">${T("source")} · ${T("auto")}</td></tr>
</table></td></tr></table></body></html>`;
}

// config.relatorios.para: ["email"] (português) ou [{ email, idioma: "pt"|"en"|"ko" }]
async function enviar(d: any) {
  if (!RESEND) return "sem RESEND_API_KEY";
  const { data: c } = await admin.from("config").select("valor").eq("chave", "relatorios").maybeSingle();
  const cfg: any = c?.valor || {};
  const lista = (cfg.para || []).map((x: any) => typeof x === "string" ? { email: x, idioma: "pt" } : x).filter((x: any) => /@/.test(x?.email || ""));
  if (!lista.length) return "sem destinatário";
  const grupos: Record<string, string[]> = {};
  for (const x of lista) { const L = ["pt", "en", "ko"].includes(x.idioma) ? x.idioma : "pt"; (grupos[L] ||= []).push(x.email); }
  const ids: string[] = [];
  for (const [L, para] of Object.entries(grupos)) {
    const subj = `OMG · ${diaTxt(d.dia, L)} · ${d.visitas} ${tx(L, "subjv")} · ${d.compras} ${d.compras === 1 ? tx(L, "subj1") : tx(L, "subjc")}${d.compras ? " · R$ " + fmt(d.faturamento, 0) : ""}`;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + RESEND, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.de || "OMG Relatórios <relatorio@mintess.com>", to: para, subject: subj, html: email(d, L) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Resend " + r.status + " (" + L + "): " + JSON.stringify(j).slice(0, 200));
    ids.push(L + ":" + (j.id || ""));
  }
  return "ok " + ids.join(" ");
}

async function editor(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase(); if (!email) return false;
  const { data: m } = await admin.from("membros").select("papel").eq("email", email).maybeSingle();
  return m?.papel === "editor";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  let b: any = {}; try { b = await req.json(); } catch { /* vazio */ }
  try {
    const ed = b.forcar || b.dia ? await editor(req) : false;
    if ((b.forcar || b.dia) && !ed) return resp(403, { erro: "Só editores do ERP podem refazer relatórios" });
    const dia = ed && /^\d{4}-\d\d-\d\d$/.test(b.dia || "") ? b.dia : ontemBR();
    const { data: ja } = await admin.from("relatorios").select("enviado_em").eq("dia", dia).maybeSingle();
    if (ja?.enviado_em && !ed) return resp(200, { ok: true, dia, ja_enviado: true });
    const d: any = await montar(dia);
    d.leituras = leituras(d);
    let info = "não enviado";
    const mandar = ed ? b.enviar === true : true;
    if (mandar) { try { info = await enviar(d); } catch (e) { info = "erro: " + String((e as Error).message) } }
    const ok = info.startsWith("ok");
    await admin.from("relatorios").upsert({ dia, dados: d, gerado_em: new Date().toISOString(), envio_info: info,
      ...(ok ? { enviado_em: new Date().toISOString() } : {}) });
    return resp(200, { ok: true, dia, envio: info });
  } catch (e) {
    return resp(500, { erro: String((e as Error).message || e) });
  }
});

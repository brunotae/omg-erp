// Visitas agora: visitas e pessoas do site nas últimas 24 h, 2 dias, 7 dias e desde o início, por país, estado e origem.
// Chamado pelo ERP (tela "Visitas agora"), só para membros do ERP. Lê ShopifyQL (read_reports) com os mesmos
// segredos do relatorio-diario. Só leitura: não grava nada.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
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
// ShopifyQL tem limite de "custo" por minuto: as leituras vão uma de cada vez e, se o Shopify pedir pausa (THROTTLED),
// espera a janela liberar e tenta de novo.
async function ql(q: string, tent = 0): Promise<any[]> {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token() },
    body: JSON.stringify({ query: `query($q: String!) { shopifyqlQuery(query: $q) { tableData { rows } parseErrors } }`, variables: { q } }) });
  const j = await r.json().catch(() => ({}));
  const thr = r.status === 429 || (j.errors ?? []).some((e: any) => e?.extensions?.code === "THROTTLED");
  if (thr && tent < 4) {
    const reset = Date.parse((j.errors ?? [])[0]?.extensions?.cost?.windowResetAt ?? "");
    const ms = isFinite(reset) ? Math.min(25000, Math.max(1500, reset - Date.now() + 500)) : 4000 * (tent + 1);
    await new Promise((res) => setTimeout(res, ms));
    return ql(q, tent + 1);
  }
  if (!r.ok || j.errors) throw new Error(thr ? "O Shopify pediu uma pausa nas leituras; tente de novo em 1 minuto." : "Shopify: " + JSON.stringify(j.errors ?? r.status).slice(0, 300));
  const s = j.data.shopifyqlQuery;
  if (s.parseErrors?.length) throw new Error("ShopifyQL: " + s.parseErrors.join("; ") + " · " + q);
  return s.tableData?.rows ?? [];
}
// uma leitura por vez
async function emFila(qs: string[]) { const out: any[][] = []; for (const q of qs) out.push(await ql(q)); return out; }
// guarda o resultado por um tempo para não gastar o limite do Shopify a cada clique
let cache: { t: number; v: any } = { t: 0, v: null };
let cacheTudo: { t: number; v: any } = { t: 0, v: null };
const n = (x: any) => Number(x) || 0;

async function membro(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase(); if (!email) return false;
  const { data: m } = await admin.from("membros").select("papel").eq("email", email).maybeSingle();
  return !!m;
}

const lista = (rows: any[], chave: (r: any) => string) => {
  const m: Record<string, number> = {};
  for (const r of rows) { const c = chave(r); m[c] = (m[c] || 0) + n(r.sessions); }
  return Object.entries(m).map(([nome, v]) => ({ nome, visitas: v })).filter((x) => x.visitas > 0).sort((a, b) => b.visitas - a.visitas);
};

// Desde o início: o último ano inteiro, por dia (a loja é mais nova que isso, então pega tudo).
async function desdeInicio() {
  const T = " SINCE -365d UNTIL today";
  const [dias, pais, est, ori, pes] = await emFila([
    "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_completed_checkout GROUP BY day" + T + " ORDER BY day",
    "FROM sessions SHOW sessions GROUP BY session_country" + T,
    "FROM sessions SHOW sessions GROUP BY session_country, session_region" + T,
    "FROM sessions SHOW sessions GROUP BY referrer_source, referrer_name" + T,
    "FROM sessions SHOW online_store_visitors" + T,
  ]);
  const comVisita = dias.filter((r: any) => n(r.sessions) > 0);
  return {
    inicio: comVisita[0]?.day ?? null,
    pessoas: n(pes[0]?.online_store_visitors),
    janela: {
      visitas: dias.reduce((a: number, r: any) => a + n(r.sessions), 0),
      carrinho: dias.reduce((a: number, r: any) => a + n(r.sessions_with_cart_additions), 0),
      compras: dias.reduce((a: number, r: any) => a + n(r.sessions_that_completed_checkout), 0),
      paises: lista(pais, (r) => r.session_country || "Desconhecido"),
      estados: lista(est.filter((r: any) => r.session_country === "Brazil"), (r) => r.session_region || "Desconhecido").slice(0, 10),
      origem: lista(ori, (r) => (r.referrer_source || "direct") + "|" + (r.referrer_name || "")).slice(0, 8),
    },
    dias: comVisita.length ? dias.slice(dias.indexOf(comVisita[0])).map((r: any) => ({ dia: r.day, visitas: n(r.sessions) })) : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  try {
    if (!(await membro(req))) return resp(403, { erro: "Só membros do ERP" });
    const W = " SINCE -7d UNTIL today";
    if (cache.v && Date.now() - cache.t < 60e3) return resp(200, { ...cache.v, cache: true });
    const [hrs, pais, est, ori, p1, p2, p7] = await emFila([
      "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_completed_checkout GROUP BY hour" + W + " ORDER BY hour",
      "FROM sessions SHOW sessions GROUP BY hour, session_country" + W,
      "FROM sessions SHOW sessions GROUP BY hour, session_country, session_region" + W,
      "FROM sessions SHOW sessions GROUP BY hour, referrer_source, referrer_name" + W,
      "FROM sessions SHOW online_store_visitors SINCE today UNTIL today",
      "FROM sessions SHOW online_store_visitors SINCE -1d UNTIL today",
      "FROM sessions SHOW online_store_visitors SINCE -6d UNTIL today",
    ]);
    // desde o início muda devagar: lê de novo a cada 30 min
    let tudo: any = cacheTudo.v;
    if (!tudo || Date.now() - cacheTudo.t > 30 * 60e3) {
      try { tudo = await desdeInicio(); cacheTudo = { t: Date.now(), v: tudo }; }
      catch (e) { tudo = cacheTudo.v ?? { erro: String((e as Error).message || e) }; }
    }
    const agora = Date.now();
    const JAN: Record<string, number> = { h24: 24, h48: 48, d7: 168 };
    const dentro = (h: string, k: string) => { const t = Date.parse(h); return isFinite(t) && t > agora - JAN[k] * 3600e3 - 3600e3 && t <= agora; };
    const out: any = { gerado: new Date().toISOString(), janelas: {} };
    for (const k of Object.keys(JAN)) {
      const H = hrs.filter((r: any) => dentro(r.hour, k));
      out.janelas[k] = {
        visitas: H.reduce((a: number, r: any) => a + n(r.sessions), 0),
        carrinho: H.reduce((a: number, r: any) => a + n(r.sessions_with_cart_additions), 0),
        compras: H.reduce((a: number, r: any) => a + n(r.sessions_that_completed_checkout), 0),
        paises: lista(pais.filter((r: any) => dentro(r.hour, k)), (r) => r.session_country || "Desconhecido"),
        estados: lista(est.filter((r: any) => dentro(r.hour, k) && r.session_country === "Brazil"), (r) => r.session_region || "Desconhecido").slice(0, 10),
        origem: lista(ori.filter((r: any) => dentro(r.hour, k)), (r) => (r.referrer_source || "direct") + "|" + (r.referrer_name || "")).slice(0, 8),
      };
    }
    out.pessoas = { hoje: n(p1[0]?.online_store_visitors), d2: n(p2[0]?.online_store_visitors), d7: n(p7[0]?.online_store_visitors) };
    out.horas = hrs.filter((r: any) => dentro(r.hour, "h48")).map((r: any) => ({ hora: r.hour, visitas: n(r.sessions) }));
    const t: any = tudo;
    if (t && !t.erro) { out.janelas.tudo = t.janela; out.pessoas.tudo = t.pessoas; out.inicio = t.inicio; out.dias = t.dias; }
    else out.erro_tudo = t?.erro ?? "sem dados";
    cache = { t: Date.now(), v: out };
    return resp(200, out);
  } catch (e) {
    if (cache.v) return resp(200, { ...cache.v, antigo: true, aviso: String((e as Error).message || e) });
    return resp(500, { erro: String((e as Error).message || e) });
  }
});

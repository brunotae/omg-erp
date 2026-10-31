// Leitura do catálogo para o Raio-X do ERP, chamada pelo GitHub Actions:
//   { modo: "incremental" } a cada hora · { modo: "completa" } de madrugada.
// Só lê o Shopify e grava catalogo_produtos / catalogo_mudancas; não muda nada no site.
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncIncremental, syncCompleta, lerSync } from "../_shared/catalogo.ts";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "", VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "", CID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "", CSEC = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const resp = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { "content-type": "application/json" } });
let tk = { v: "", exp: 0 };
async function token() {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (tk.v && Date.now() < tk.exp) return tk.v;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CID, client_secret: CSEC }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error("token " + r.status);
  tk = { v: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 }; return tk.v;
}
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": await token() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status).slice(0, 300)); return j.data;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  const b: any = await req.json().catch(() => ({}));
  try {
    if (b.modo === "completa") {
      // chamada pública: no máximo uma leitura completa a cada 6 horas
      const cfg = await lerSync(admin);
      if (cfg.ultima_completa && Date.now() - new Date(cfg.ultima_completa).getTime() < 6 * 3600e3) return resp(200, { ok: true, pulou: "leitura completa recente" });
      return resp(200, { ok: true, ...(await syncCompleta(admin, gql, "leitura de madrugada")) });
    }
    return resp(200, { ok: true, ...(await syncIncremental(admin, gql, "leitura de hora em hora")) });
  } catch (e) { return resp(500, { erro: String((e as Error).message || e).slice(0, 300) }); }
});

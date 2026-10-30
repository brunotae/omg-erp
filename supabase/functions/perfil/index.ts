// "Meu perfil de beleza" (página /pages/meu-perfil do site). Pública, mas só aceita pedidos assinados pelo tema:
// o Liquid gera sig = HMAC-SHA256(segredo, cid:email:ts) para a cliente logada (segredo em config 'perfil_hmac').
// Ações: ler | salvar | apagar. Grava em public.clientes_perfil (só leitura para a equipe no ERP).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = /^https:\/\/((www\.)?ohmygirl\.com\.br|[a-z0-9-]+\.myshopify\.com)$/;
let SEGREDO: string | null = null;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "access-control-allow-origin": ORIGENS.test(o) ? o : "https://www.ohmygirl.com.br", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
}
const resp = (req: Request, st: number, b: unknown) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json", ...cors(req) } });

async function segredo() {
  if (SEGREDO) return SEGREDO;
  const { data } = await sb.from("config").select("valor").eq("chave", "perfil_hmac").single();
  SEGREDO = String(data?.valor || "");
  return SEGREDO;
}
async function hmac(chave: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const txt = (v: unknown, n = 120) => (v == null ? null : String(v).trim().slice(0, n) || null);
const lista = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, n) : null);
const int = (v: unknown, a: number, b: number) => { const x = parseInt(String(v ?? ""), 10); return x >= a && x <= b ? x : null; };


// ---- Shopify: etiquetas na ficha da cliente (precisa write_customers) ----
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
let tok = { v: "", exp: 0 };
async function tokenShopify() {
  const fixo = Deno.env.get("SHOPIFY_ADMIN_TOKEN"); if (fixo) return fixo;
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: Deno.env.get("SHOPIFY_CLIENT_ID") ?? "", client_secret: Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "" }) });
  const j = await r.json(); tok = { v: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 }; return tok.v;
}
async function gql(q: string, v: unknown) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": await tokenShopify() }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 200)); return j.data;
}
const PREFIXOS = ["perfil de beleza", "pele: ", "sensível: ", "foco: ", "rotina: ", "gosta: ", "aniversário: "];
const MESES = ["", "01-jan", "02-fev", "03-mar", "04-abr", "05-mai", "06-jun", "07-jul", "08-ago", "09-set", "10-out", "11-nov", "12-dez"];
async function etiquetar(cid: string, l: any | null) {
  if (!SHOP) return "sem loja";
  const id = "gid://shopify/Customer/" + cid;
  const d: any = await gql(`query($id: ID!) { customer(id: $id) { tags } }`, { id });
  const velhas = (d.customer?.tags || []).filter((t: string) => PREFIXOS.some((p) => t.toLowerCase().startsWith(p)));
  if (velhas.length) await gql(`mutation($id: ID!, $t: [String!]!) { tagsRemove(id: $id, tags: $t) { userErrors { message } } }`, { id, t: velhas });
  if (!l) return "removidas";
  const novas: string[] = ["perfil de beleza"];
  if (l.tipo_pele) novas.push("pele: " + l.tipo_pele.toLowerCase());
  if (l.sensibilidade) novas.push("sensível: " + l.sensibilidade.toLowerCase());
  for (const x of l.preocupacoes || []) novas.push("foco: " + x.toLowerCase());
  if (l.rotina) novas.push("rotina: " + l.rotina.split(" (")[0].toLowerCase());
  for (const x of l.interesses || []) novas.push("gosta: " + x.toLowerCase());
  if (l.aniversario_mes) novas.push("aniversário: " + MESES[l.aniversario_mes]);
  const r: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsAdd(id: $id, tags: $t) { userErrors { message } } }`, { id, t: novas });
  return r.tagsAdd.userErrors[0]?.message || "ok";
}

const CAMPOS = "nome,telefone,cep,endereco,numero,complemento,bairro,cidade,uf,aniversario_dia,aniversario_mes,tipo_pele,preocupacoes,sensibilidade,rotina,marcas,como_conheceu,interesses,consentimento,atualizado_em";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resp(req, 405, { erro: "método" });
  let b: any;
  try { b = await req.json(); } catch { return resp(req, 400, { erro: "json" }); }
  const cid = String(b.cid || "").replace(/\D/g, ""), email = String(b.email || "").trim().toLowerCase(), ts = parseInt(String(b.ts || 0), 10);
  if (!cid || !email || !ts) return resp(req, 400, { erro: "faltam dados" });
  if (Math.abs(Date.now() / 1000 - ts) > 2 * 86400) return resp(req, 401, { erro: "sessão expirada, recarregue a página" });
  const esperado = await hmac(await segredo(), `${cid}:${email}:${ts}`);
  if (esperado !== String(b.sig || "")) return resp(req, 401, { erro: "assinatura inválida" });

  if (b.acao === "ler") {
    const { data } = await sb.from("clientes_perfil").select(CAMPOS).eq("shopify_customer_id", cid).maybeSingle();
    return resp(req, 200, { ok: true, perfil: data });
  }
  if (b.acao === "apagar") {
    await sb.from("clientes_perfil").delete().eq("shopify_customer_id", cid);
    try { await etiquetar(cid, null); } catch (_) { /* etiquetas são extra */ }
    return resp(req, 200, { ok: true });
  }
  if (b.acao === "salvar") {
    const d = b.dados || {};
    if (d.consentimento !== true) return resp(req, 400, { erro: "É preciso aceitar o uso dos dados para salvar." });
    const linha = {
      shopify_customer_id: cid, email,
      nome: txt(d.nome, 80), telefone: txt(d.telefone, 20),
      cep: txt(d.cep, 9), endereco: txt(d.endereco), numero: txt(d.numero, 12), complemento: txt(d.complemento, 60),
      bairro: txt(d.bairro, 60), cidade: txt(d.cidade, 60), uf: txt(d.uf, 2)?.toUpperCase() ?? null,
      aniversario_dia: int(d.aniversario_dia, 1, 31), aniversario_mes: int(d.aniversario_mes, 1, 12),
      tipo_pele: txt(d.tipo_pele, 30), preocupacoes: lista(d.preocupacoes), sensibilidade: txt(d.sensibilidade, 30),
      rotina: txt(d.rotina, 30), marcas: lista(d.marcas, 20), como_conheceu: txt(d.como_conheceu, 40), interesses: lista(d.interesses),
      consentimento: true, consentido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    };
    const { error } = await sb.from("clientes_perfil").upsert(linha, { onConflict: "shopify_customer_id" });
    if (error) return resp(req, 500, { erro: "não foi possível salvar" });
    let tags = "";
    try { tags = await etiquetar(cid, linha); } catch (e) { tags = "erro: " + String((e as Error).message).slice(0, 120); }
    return resp(req, 200, { ok: true, tags });
  }
  return resp(req, 400, { erro: "ação" });
});

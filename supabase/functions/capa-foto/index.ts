// Troca só a foto de capa (1ª foto) de um produto, sem mexer nas outras fotos da galeria.
// Chamada pelo ERP com o login (só editores).
//   { produto: "gid://shopify/Product/123", url: "https://...jpg", alt?: string, apagar?: "gid://shopify/MediaImage/..." | null }
//   1) adiciona a foto nova  2) espera ficar pronta  3) põe em 1º lugar
//   4) se "apagar" vier: as versões que usavam essa foto passam a usar a nova, e ela é apagada
//   { status: true, produto } → só lê as fotos (id, url, status) e as versões com foto
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (s: number, c: Record<string, unknown>) => new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "content-type": "application/json" } });

let cache = { v: "", exp: 0 };
async function token() {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (cache.v && Date.now() < cache.exp) return cache.v;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Shopify recusou o token do app: " + r.status);
  cache = { v: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 };
  return cache.v;
}
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status));
  return j.data;
}
async function editor(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: m } = await admin.from("membros").select("papel").eq("email", email).maybeSingle();
  return m?.papel === "editor" ? email : null;
}
const Q = `query($id: ID!) { product(id: $id) { id title media(first: 60) { nodes { id status alt ... on MediaImage { image { url } } } }
  variants(first: 60) { nodes { id title media(first: 1) { nodes { id } } } } } }`;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!(await editor(req))) return resp(403, { erro: "Só editores do ERP podem fazer isso" });
  const b: any = await req.json().catch(() => ({}));
  try {
    const pid = String(b.produto || "");
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(pid)) return resp(400, { erro: "produto inválido" });
    const p0: any = (await gql(Q, { id: pid })).product;
    if (!p0) return resp(404, { erro: "produto não encontrado" });
    const fotos = (p: any) => p.media.nodes.map((m: any) => ({ id: m.id, status: m.status, url: m.image?.url || "" }));
    const versoes = (p: any) => p.variants.nodes.map((v: any) => ({ id: v.id, nome: v.title, foto: v.media.nodes[0]?.id || null }));
    if (b.status) return resp(200, { ok: true, fotos: fotos(p0), versoes: versoes(p0) });
    if (Array.isArray(b.limpar)) {
      // Limpeza: apaga fotos repetidas (ids da lista que existem no produto e não estão ligadas a uma versão); { primeira?: id } põe essa em 1º lugar
      const ligadas = new Set(versoes(p0).map((v: any) => v.foto).filter(Boolean));
      const ids = b.limpar.map(String).filter((id: string) => p0.media.nodes.some((m: any) => m.id === id) && !ligadas.has(id));
      if (b.primeira) await gql(`mutation($id: ID!, $m: [MoveInput!]!) { productReorderMedia(id: $id, moves: $m) { mediaUserErrors { message } } }`, { id: pid, m: [{ id: String(b.primeira), newPosition: "0" }] });
      if (ids.length) await gql(`mutation($id: ID!, $ids: [ID!]!) { productDeleteMedia(productId: $id, mediaIds: $ids) { mediaUserErrors { message } } }`, { id: pid, ids });
      return resp(200, { ok: true, apagadas: ids.length });
    }

    const url = String(b.url || "");
    if (!/^https:\/\//.test(url)) return resp(400, { erro: "url inválida" });
    const antes = new Set(p0.media.nodes.map((m: any) => m.id));
    const add: any = await gql(`mutation($id: ID!, $m: [CreateMediaInput!]!) { productCreateMedia(productId: $id, media: $m) { media { id } mediaUserErrors { message } } }`,
      { id: pid, m: [{ originalSource: url, alt: String(b.alt || p0.title), mediaContentType: "IMAGE" }] });
    const e1 = add.productCreateMedia.mediaUserErrors; if (e1.length) throw new Error(e1[0].message);
    const nova = add.productCreateMedia.media[0]?.id;
    if (!nova) throw new Error("o Shopify não devolveu a foto nova");
    let pronta = false;
    for (let i = 0; i < 30; i++) {
      const st: any = await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { status } } }`, { id: nova });
      if (st.node?.status === "READY") { pronta = true; break; }
      if (st.node?.status === "FAILED") throw new Error("a foto nova não carregou no Shopify");
      await espera(2500);
    }
    if (!pronta) return resp(202, { ok: false, erro: "foto nova ainda processando", nova });
    const ro: any = await gql(`mutation($id: ID!, $m: [MoveInput!]!) { productReorderMedia(id: $id, moves: $m) { job { id } mediaUserErrors { message } } }`,
      { id: pid, m: [{ id: nova, newPosition: "0" }] });
    const e2 = ro.productReorderMedia.mediaUserErrors; if (e2.length) throw new Error("foto nova entrou, mas não foi para o 1º lugar: " + e2[0].message);
    let religadas = 0, apagada = false;
    const apagar = b.apagar ? String(b.apagar) : "";
    if (apagar && antes.has(apagar)) {
      const vs = versoes(p0).filter((v: any) => v.foto === apagar);
      if (vs.length) {
        await gql(`mutation($p: ID!, $vm: [ProductVariantDetachMediaInput!]!) { productVariantDetachMedia(productId: $p, variantMedia: $vm) { userErrors { message } } }`,
          { p: pid, vm: vs.map((v: any) => ({ variantId: v.id, mediaIds: [apagar] })) });
        const ap: any = await gql(`mutation($p: ID!, $vm: [ProductVariantAppendMediaInput!]!) { productVariantAppendMedia(productId: $p, variantMedia: $vm) { userErrors { message } } }`,
          { p: pid, vm: vs.map((v: any) => ({ variantId: v.id, mediaIds: [nova] })) });
        if (ap.productVariantAppendMedia.userErrors.length) throw new Error("versões: " + ap.productVariantAppendMedia.userErrors[0].message);
        religadas = vs.length;
      }
      const del: any = await gql(`mutation($id: ID!, $ids: [ID!]!) { productDeleteMedia(productId: $id, mediaIds: $ids) { deletedMediaIds mediaUserErrors { message } } }`, { id: pid, ids: [apagar] });
      const e3 = del.productDeleteMedia.mediaUserErrors; if (e3.length) throw new Error("foto nova entrou, mas a antiga não saiu: " + e3[0].message);
      apagada = true;
    }
    return resp(200, { ok: true, nova, religadas, apagada });
  } catch (e) {
    return resp(502, { erro: String((e as Error).message || e).slice(0, 300) });
  }
});

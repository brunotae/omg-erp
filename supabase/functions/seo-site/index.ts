// SEO do site (títulos e descrições que aparecem no Google). Chamada pelo ERP com o login (só editores).
//   { acao: "loja_ler" }                                   → título/descrição da página inicial
//   { acao: "loja_gravar", titulo?, descricao? }           → grava título/descrição da página inicial
//   { acao: "ler", tipo: "produto"|"colecao"|"pagina", depois?: cursor } → lista 100 com o SEO atual
//   { acao: "gravar", itens: [{ id: gid, titulo?, descricao? }] }  → grava SEO (até 50 por chamada; vazio = apaga)
//   { acao: "colecao_desc", itens: [{ id: gid Collection, html }] } → texto visível da coleção (só esse campo)
//   { acao: "ocultar", itens: [{ id: gid, ocultar: true|false }] } → esconde/mostra no Google (seo.hidden)
//   { acao: "menus" } → lista menus com itens; { acao: "menu_gravar", id, titulo, handle, itens: MenuItemUpdateInput[] } → regrava; { acao: "menu_apagar", id }
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
const GTIT = { namespace: "global", key: "title_tag", type: "single_line_text_field" };
const GDES = { namespace: "global", key: "description_tag", type: "multi_line_text_field" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!(await editor(req))) return resp(403, { erro: "Só editores do ERP podem fazer isso" });
  const b: any = await req.json().catch(() => ({}));
  try {
    if (b.acao === "loja_ler") {
      const r: any = await gql(`{ shop { id name t: metafield(namespace:"global", key:"title_tag"){value} d: metafield(namespace:"global", key:"description_tag"){value} } }`);
      return resp(200, { ok: true, id: r.shop.id, nome: r.shop.name, titulo: r.shop.t?.value ?? null, descricao: r.shop.d?.value ?? null });
    }
    if (b.acao === "loja_gravar") {
      const s: any = await gql(`{ shop { id } }`);
      const mf: any[] = [];
      if (typeof b.titulo === "string") mf.push({ ...GTIT, ownerId: s.shop.id, value: b.titulo });
      if (typeof b.descricao === "string") mf.push({ ...GDES, ownerId: s.shop.id, value: b.descricao });
      if (!mf.length) return resp(400, { erro: "nada para gravar" });
      const r: any = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`, { m: mf });
      const ue = r.metafieldsSet.userErrors; if (ue.length) return resp(422, { erro: ue.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true });
    }
    if (b.acao === "ler") {
      const t = b.tipo;
      const raiz = t === "produto" ? "products" : t === "colecao" ? "collections" : t === "pagina" ? "pages" : "";
      if (!raiz) return resp(400, { erro: "tipo inválido" });
      const campos = raiz === "pages"
        ? `id title handle t: metafield(namespace:"global", key:"title_tag"){value} d: metafield(namespace:"global", key:"description_tag"){value}`
        : `id title handle seo { title description }` + (raiz === "products" ? " vendor productType status" : "");
      const r: any = await gql(`query($c:String){ ${raiz}(first:100, after:$c){ nodes { ${campos} } pageInfo { hasNextPage endCursor } } }`, { c: b.depois ?? null });
      const nodes = r[raiz].nodes.map((n: any) => raiz === "pages" ? { id: n.id, nome: n.title, handle: n.handle, titulo: n.t?.value ?? null, descricao: n.d?.value ?? null }
        : { id: n.id, nome: n.title, handle: n.handle, titulo: n.seo?.title ?? null, descricao: n.seo?.description ?? null, marca: n.vendor, tipo: n.productType, status: n.status });
      return resp(200, { ok: true, itens: nodes, mais: r[raiz].pageInfo.hasNextPage, depois: r[raiz].pageInfo.endCursor });
    }
    if (b.acao === "gravar") {
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 50) : [];
      const res: any[] = [];
      for (const it of itens) {
        const id = String(it.id || "");
        const seo: any = {};
        if (typeof it.titulo === "string") seo.title = it.titulo;
        if (typeof it.descricao === "string") seo.description = it.descricao;
        let ue: any[] = [];
        if (/Product\//.test(id)) {
          const r: any = await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{ message } } }`, { p: { id, seo } });
          ue = r.productUpdate.userErrors;
        } else if (/Collection\//.test(id)) {
          const r: any = await gql(`mutation($i:CollectionInput!){ collectionUpdate(input:$i){ userErrors{ message } } }`, { i: { id, seo } });
          ue = r.collectionUpdate.userErrors;
        } else if (/(Page|OnlineStorePage)\//.test(id)) {
          const mf: any[] = [];
          if (seo.title !== undefined) mf.push({ ...GTIT, ownerId: id, value: seo.title });
          if (seo.description !== undefined) mf.push({ ...GDES, ownerId: id, value: seo.description });
          const r: any = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`, { m: mf });
          ue = r.metafieldsSet.userErrors;
        } else { res.push({ id, erro: "id inválido" }); continue; }
        res.push(ue.length ? { id, erro: ue.map((x: any) => x.message).join("; ") } : { id, ok: true });
      }
      return resp(200, { ok: true, res });
    }
    if (b.acao === "colecao_desc") {
      // Texto visível da coleção (descriptionHtml). Só esse campo: não toca em regras, título ou SEO.
      // { itens: [{ id: gid Collection, html }] } até 50. Devolve o texto anterior para poder desfazer.
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 50) : [];
      const res: any[] = [];
      for (const it of itens) {
        const id = String(it.id || "");
        if (!/Collection\//.test(id) || typeof it.html !== "string") { res.push({ id, erro: "id ou html inválido" }); continue; }
        const a: any = await gql(`query($id: ID!) { collection(id: $id) { descriptionHtml } }`, { id });
        const r: any = await gql(`mutation($i:CollectionInput!){ collectionUpdate(input:$i){ collection { descriptionHtml } userErrors{ message } } }`, { i: { id, descriptionHtml: it.html } });
        const ue = r.collectionUpdate.userErrors;
        res.push(ue.length ? { id, erro: ue.map((x: any) => x.message).join("; ") } : { id, ok: true, antes: a.collection?.descriptionHtml ?? "", depois: r.collectionUpdate.collection?.descriptionHtml ?? "" });
      }
      return resp(200, { ok: true, res });
    }
    if (b.acao === "ocultar") {
      // Esconde/mostra no Google (metafield seo.hidden = 1: sai do sitemap e ganha noindex). Não apaga nada.
      // { itens: [{ id: gid, ocultar: true|false }] } até 50.
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 50) : [];
      const res: any[] = [];
      const lig = itens.filter((it: any) => it.ocultar !== false);
      const des = itens.filter((it: any) => it.ocultar === false);
      for (let i = 0; i < lig.length; i += 25) {
        const lote = lig.slice(i, i + 25);
        const r: any = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ field message } } }`,
          { m: lote.map((it: any) => ({ ownerId: String(it.id), namespace: "seo", key: "hidden", type: "number_integer", value: "1" })) });
        const ue = r.metafieldsSet.userErrors;
        lote.forEach((it: any) => res.push(ue.length ? { id: it.id, erro: ue.map((x: any) => x.message).join("; ") } : { id: it.id, ok: true, oculto: true }));
      }
      for (let i = 0; i < des.length; i += 25) {
        const lote = des.slice(i, i + 25);
        const r: any = await gql(`mutation($m:[MetafieldIdentifierInput!]!){ metafieldsDelete(metafields:$m){ userErrors{ message } } }`,
          { m: lote.map((it: any) => ({ ownerId: String(it.id), namespace: "seo", key: "hidden" })) });
        const ue = r.metafieldsDelete.userErrors;
        lote.forEach((it: any) => res.push(ue.length ? { id: it.id, erro: ue.map((x: any) => x.message).join("; ") } : { id: it.id, ok: true, oculto: false }));
      }
      return resp(200, { ok: true, res });
    }
    if (b.acao === "menus") {
      const it = `id title type url resourceId`;
      const r: any = await gql(`{ menus(first: 50) { nodes { id handle title items { ${it} items { ${it} items { ${it} } } } } } }`);
      return resp(200, { ok: true, menus: r.menus.nodes });
    }
    if (b.acao === "menu_gravar") {
      const r: any = await gql(`mutation($id: ID!, $t: String!, $h: String, $i: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $t, handle: $h, items: $i) { menu { id handle } userErrors { message } } }`, { id: String(b.id), t: String(b.titulo), h: b.handle, i: b.itens });
      const ue = r.menuUpdate.userErrors; if (ue.length) return resp(422, { erro: ue.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true });
    }
    if (b.acao === "menu_apagar") {
      const r: any = await gql(`mutation($id: ID!) { menuDelete(id: $id) { deletedMenuId userErrors { message } } }`, { id: String(b.id) });
      const ue = r.menuDelete.userErrors; if (ue.length) return resp(422, { erro: ue.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, apagado: r.menuDelete.deletedMenuId });
    }
    return resp(400, { erro: "ação desconhecida" });
  } catch (e) {
    return resp(502, { erro: String((e as Error).message || e).slice(0, 300) });
  }
});

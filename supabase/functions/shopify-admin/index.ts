// Ações do ERP no Shopify. Chamada pelo ERP com o login do usuário (só editores).
//   { acao: "sincronizar" }                              → traz todos os produtos (inclui rascunhos)
//   { acao: "status", produtoId, ativo: true|false }     → ativa ou pausa (rascunho) no site
//   { acao: "preco", produtoId, varianteId, preco }      → muda o preço da variante no site
//   { acao: "fotos", itens: [{ handle, fotos, peso_g }] } → troca as fotos pelas oficiais e corrige o peso
// Segredos: SHOPIFY_SHOP (ex.: mundo-beleza-9571.myshopify.com), SHOPIFY_API_VERSION (opcional) e
//   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (app do Dev Dashboard; token pedido a cada 24 h por client credentials)
//   ou, alternativa, SHOPIFY_ADMIN_TOKEN fixo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { gravarProdutos, produtoParaLinhas } from "../_shared/produtos.js";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const configurado = () => !!SHOP && (!!TOKEN_FIXO || (!!CLIENT_ID && !!CLIENT_SECRET));

// Token do app (client credentials): vale ~24 h; guardamos em memória e renovamos 5 min antes.
let cacheToken = { valor: "", expira: 0 };
async function tokenShopify(): Promise<string> {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (cacheToken.valor && Date.now() < cacheToken.expira) return cacheToken.valor;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Shopify recusou o token do app: " + r.status);
  cacheToken = { valor: j.access_token, expira: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 };
  return cacheToken.valor;
}
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await tokenShopify() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status));
  return j.data;
}

const Q_PRODUTOS = `query($after: String) {
  products(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle vendor productType status
      variants(first: 100) { nodes { id sku price title inventoryItem { measurement { weight { value unit } } } } } }
  }
}`;

// Troca as fotos de um produto: primeiro adiciona as oficiais, depois apaga as antigas
// (assim o produto nunca fica sem foto se algo falhar no meio).
async function trocarFotos(it: { handle: string; fotos: string[]; peso_g?: number | null }) {
  const fotos = (it.fotos || []).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  if (!it.handle || !fotos.length) throw new Error("sem handle ou sem fotos");
  const d: any = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes {
      id title media(first: 50) { nodes { id } } variants(first: 100) { nodes { id } } } } }`, { q: "handle:" + it.handle });
  const p = d.products.nodes[0];
  if (!p) throw new Error("produto não encontrado no Shopify");
  const antigas: string[] = p.media.nodes.map((m: any) => m.id);
  const media = fotos.map((u) => ({ originalSource: u, alt: p.title, mediaContentType: "IMAGE" }));
  const add: any = await gql(`mutation($p: ProductUpdateInput!, $m: [CreateMediaInput!]) {
      productUpdate(product: $p, media: $m) { product { id } userErrors { message } } }`, { p: { id: p.id }, m: media });
  if (add.productUpdate.userErrors.length) throw new Error(add.productUpdate.userErrors[0].message);
  if (antigas.length) {
    const del: any = await gql(`mutation($id: ID!, $ids: [ID!]!) {
        productDeleteMedia(productId: $id, mediaIds: $ids) { deletedMediaIds mediaUserErrors { message } } }`, { id: p.id, ids: antigas });
    const e = del.productDeleteMedia.mediaUserErrors; if (e.length) throw new Error("fotos novas entraram, mas as antigas não saíram: " + e[0].message);
  }
  const g = Number(it.peso_g);
  if (g > 0 && p.variants.nodes.length) {
    const w: any = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
      { pid: p.id, v: p.variants.nodes.map((v: any) => ({ id: v.id, inventoryItem: { measurement: { weight: { value: g, unit: "GRAMS" } } } })) });
    if (!w.productVariantsBulkUpdate.userErrors.length) {
      await admin.from("produtos").update({ peso_g: g }).eq("shopify_product_id", p.id.split("/").pop());
    }
  }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!configurado()) return resp(503, { erro: "Ligação com o Shopify ainda não configurada" });
  if (!(await editor(req))) return resp(403, { erro: "Só editores do ERP podem fazer isso" });

  let b: any;
  try { b = await req.json(); } catch { return resp(400, { erro: "pedido inválido" }); }

  try {
    if (b.acao === "sincronizar") {
      let after: string | null = null, total = 0, novos = 0, atualizados = 0;
      do {
        const d: any = await gql(Q_PRODUTOS, { after });
        for (const p of d.products.nodes) {
          const r = await gravarProdutos(admin, produtoParaLinhas(p));
          novos += r.novos; atualizados += r.atualizados; total++;
        }
        after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
      } while (after);
      return resp(200, { ok: true, produtos: total, novos, atualizados });
    }

    if (b.acao === "status") {
      const d: any = await gql(
        `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id status } userErrors { message } } }`,
        { p: { id: "gid://shopify/Product/" + b.produtoId, status: b.ativo ? "ACTIVE" : "DRAFT" } },
      );
      const e = d.productUpdate.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      const st = b.ativo ? "active" : "draft";
      await admin.from("produtos").update({ ativo: !!b.ativo, site_status: st }).eq("shopify_product_id", String(b.produtoId));
      return resp(200, { ok: true, status: st });
    }

    if (b.acao === "preco") {
      const preco = Number(b.preco);
      if (!(preco > 0)) return resp(400, { erro: "preço inválido" });
      const d: any = await gql(
        `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
        { pid: "gid://shopify/Product/" + b.produtoId, v: [{ id: "gid://shopify/ProductVariant/" + b.varianteId, price: preco.toFixed(2) }] },
      );
      const e = d.productVariantsBulkUpdate.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      await admin.from("produtos").update({ preco }).eq("shopify_variant_id", String(b.varianteId));
      return resp(200, { ok: true, preco });
    }

    if (b.acao === "fotos") {
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 25) : [];
      const resultados = [];
      for (const it of itens) {
        try { await trocarFotos(it); resultados.push({ handle: it.handle, ok: true }); }
        catch (e) { resultados.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 200) }); }
      }
      return resp(200, { ok: true, resultados });
    }

    return resp(400, { erro: "ação desconhecida" });
  } catch (e) {
    console.error(b?.acao, e);
    return resp(502, { erro: "O Shopify não respondeu como esperado. Tente de novo em instantes." });
  }
});

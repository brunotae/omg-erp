// Ações do ERP no Shopify. Chamada pelo ERP com o login do usuário (só editores).
//   { acao: "sincronizar" }                              → traz todos os produtos (inclui rascunhos)
//   { acao: "status", produtoId, ativo: true|false }     → ativa ou pausa (rascunho) no site
//   { acao: "preco", produtoId, varianteId, preco }      → muda o preço da variante no site
// Segredos: SHOPIFY_SHOP (ex.: mundo-beleza-9571.myshopify.com), SHOPIFY_ADMIN_TOKEN, SHOPIFY_API_VERSION (opcional)
import { createClient } from "npm:@supabase/supabase-js@2";
import { gravarProdutos, produtoParaLinhas } from "../_shared/produtos.js";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
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
    headers: { "content-type": "application/json", "x-shopify-access-token": TOKEN },
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
  if (!SHOP || !TOKEN) return resp(503, { erro: "Ligação com o Shopify ainda não configurada" });
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

    return resp(400, { erro: "ação desconhecida" });
  } catch (e) {
    console.error(b?.acao, e);
    return resp(502, { erro: "O Shopify não respondeu como esperado. Tente de novo em instantes." });
  }
});

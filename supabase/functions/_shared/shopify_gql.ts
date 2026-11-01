// Acesso ao Admin GraphQL do Shopify (token do app por client credentials, guardado em memória).
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
let cache = { valor: "", expira: 0 };
async function token() {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (cache.valor && Date.now() < cache.expira) return cache.valor;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("token Shopify " + r.status);
  cache = { valor: j.access_token, expira: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 };
  return cache.valor;
}
export async function shopGql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, { method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status));
  return j.data;
}
// CPF/CNPJ que o checkout do Brasil guarda em "localizationExtensions" (não vem no aviso REST do pedido).
export async function cpfDoPedido(orderId: string | number): Promise<string> {
  const d: any = await shopGql(`query($id: ID!) { order(id: $id) { localizationExtensions(first: 10) { nodes { key purpose value } } } }`, { id: "gid://shopify/Order/" + orderId });
  for (const n of d?.order?.localizationExtensions?.nodes || []) {
    const v = String(n.value || "").replace(/\D/g, "");
    if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (v.length === 14) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return "";
}

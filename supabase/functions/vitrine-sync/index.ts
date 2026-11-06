// Vitrine "Até R$ 50" + ajustes pontuais de produto (Tae · 31/10/2026).
//   { modo: "ate50" }  (público, idempotente; de hora em hora pelo GitHub Actions)
//      → etiqueta "ate-50" em todo produto ATIVO cujo preço do card (1ª variante) é até R$ 50 e tira de quem passou;
//        a coleção "Até R$ 50" usa só essa etiqueta. Assim o sachê barato não "puxa" o frasco caro para a vitrine.
//   { modo: "ate100" } (público, idempotente; de hora em hora) → etiqueta "ate-100-final" em todo produto ATIVO cujo
//      VALOR FINAL ESTIMADO (variante mais barata disponível + frete + impostos, São Paulo capital) é até R$ 100 (Dani · 04/11/2026).
//      Usada pela vitrine "Até R$ 100 para começar" (coleção ate-100) e pelo "Aproveite e leve junto" do carrinho.
//   { modo: "variante_vender", itens: [{ sku, vender: false|true }] } → zera (ou volta a 9999) o estoque da variante: some da venda sem apagar.
//   { modo: "titulos", itens: [{ handle, titulo }] }            ┐ exigem o cabeçalho x-chave =
//   { modo: "peso_variante", itens: [{ sku, peso_g }] }         ┘ config.chave_robo (só o banco conhece)
import { createClient } from "npm:@supabase/supabase-js@2";
import { calcular, usarBanco } from "../_shared/frete_calc.ts";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
usarBanco(admin);
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "", VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "", CID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "", CSEC = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const resp = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { "content-type": "application/json" } });
const TAG = "ate-50", LIMITE = 50, TITULO_COLECAO = "Até R$ 50";

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

async function ate50() {
  // 1) todos os produtos ativos com o preço da 1ª variante (é o que o card mostra)
  const prods: { id: string; handle: string; preco: number; tem: boolean }[] = [];
  let after: string | null = null;
  do {
    const d: any = await gql(`query($a: String) { products(first: 250, after: $a, query: "status:active") {
      pageInfo { hasNextPage endCursor } nodes { id handle tags variants(first: 1) { nodes { price } } } } }`, { a: after });
    for (const p of d.products.nodes) prods.push({ id: p.id, handle: p.handle, preco: Number(p.variants.nodes[0]?.price ?? 1e9), tem: (p.tags || []).includes(TAG) });
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  // produtos que saíram do ar e ainda têm a etiqueta
  const velhos: any = await gql(`{ products(first: 250, query: "tag:${TAG} -status:active") { nodes { id handle } } }`);

  const por = prods.filter((p) => p.preco <= LIMITE && !p.tem);
  const tirar = [...prods.filter((p) => p.preco > LIMITE && p.tem), ...velhos.products.nodes];
  const erros: string[] = [];
  for (const p of por) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsAdd(id: $id, tags: $t) { userErrors { message } } }`, { id: p.id, t: [TAG] }); if (d.tagsAdd.userErrors.length) erros.push(p.handle + ": " + d.tagsAdd.userErrors[0].message); }
  for (const p of tirar) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsRemove(id: $id, tags: $t) { userErrors { message } } }`, { id: p.id, t: [TAG] }); if (d.tagsRemove.userErrors.length) erros.push(p.handle + ": " + d.tagsRemove.userErrors[0].message); }

  // 2) coleção "Até R$ 50" passa a usar só a etiqueta
  let colecao: any = null;
  const c: any = await gql(`{ collections(first: 10, query: "title:'${TITULO_COLECAO}'") { nodes { id handle title ruleSet { appliedDisjunctively rules { column relation condition } } } } }`);
  const col = c.collections.nodes.find((x: any) => x.title.trim() === TITULO_COLECAO);
  if (col) {
    const regraOk = col.ruleSet?.rules?.length === 1 && col.ruleSet.rules[0].column === "TAG" && col.ruleSet.rules[0].condition === TAG;
    if (!regraOk && col.ruleSet) {
      const u: any = await gql(`mutation($i: CollectionInput!) { collectionUpdate(input: $i) { userErrors { message } } }`,
        { i: { id: col.id, ruleSet: { appliedDisjunctively: false, rules: [{ column: "TAG", relation: "EQUALS", condition: TAG }] } } });
      if (u.collectionUpdate.userErrors.length) erros.push("coleção: " + u.collectionUpdate.userErrors[0].message);
    }
    colecao = { handle: col.handle, regra_antes: col.ruleSet, trocou_regra: !regraOk && !!col.ruleSet, manual: !col.ruleSet };
  }
  return { ativos: prods.length, no_limite: prods.filter((p) => p.preco <= LIMITE).length, colocou: por.map((p) => p.handle), tirou: tirar.map((p: any) => p.handle), colecao, erros };
}

async function titulos(itens: any[]) {
  const out: any[] = [];
  for (const it of itens.slice(0, 50)) {
    try {
      const q: any = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id title } }`, { h: String(it.handle) });
      const p = q.productByIdentifier; if (!p) throw new Error("não está no Shopify");
      const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: p.id, title: String(it.titulo) } });
      if (d.productUpdate.userErrors.length) throw new Error(d.productUpdate.userErrors[0].message);
      out.push({ handle: it.handle, ok: true, antes: p.title, depois: it.titulo });
    } catch (e) { out.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e) }); }
  }
  return out;
}

async function pesoVariante(itens: any[]) {
  const out: any[] = [];
  for (const it of itens.slice(0, 50)) {
    try {
      const q: any = await gql(`query($q: String!) { productVariants(first: 2, query: $q) { nodes { id sku product { id } } } }`, { q: "sku:" + String(it.sku) });
      const v = q.productVariants.nodes.find((x: any) => x.sku === String(it.sku)); if (!v) throw new Error("SKU não está no Shopify");
      const d: any = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
        { pid: v.product.id, v: [{ id: v.id, inventoryItem: { measurement: { weight: { value: Number(it.peso_g), unit: "GRAMS" } } } }] });
      if (d.productVariantsBulkUpdate.userErrors.length) throw new Error(d.productVariantsBulkUpdate.userErrors[0].message);
      await admin.from("produtos").update({ peso_g: Number(it.peso_g) }).eq("sku", String(it.sku));
      out.push({ sku: it.sku, ok: true, peso_g: Number(it.peso_g) });
    } catch (e) { out.push({ sku: it.sku, ok: false, erro: String((e as Error).message || e) }); }
  }
  return out;
}

const TAG100 = "ate-100-final", LIM100 = 100, CEP_SP = "01532001";
async function ate100() {
  const prods: { id: string; handle: string; price: number; grams: number; tem: boolean }[] = [];
  let after: string | null = null;
  do {
    const d: any = await gql(`query($a: String) { products(first: 250, after: $a, query: "status:active") {
      pageInfo { hasNextPage endCursor } nodes { id handle tags variants(first: 50) { nodes { price availableForSale inventoryItem { measurement { weight { value unit } } } } } } } }`, { a: after });
    for (const p of d.products.nodes) {
      const vs = p.variants.nodes; const disp = vs.filter((v: any) => v.availableForSale);
      const v = (disp.length ? disp : vs).slice().sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
      if (!v) continue;
      const w = v.inventoryItem?.measurement?.weight; const k: any = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.3495, POUNDS: 453.592 };
      const g = w ? Math.round(Number(w.value) * (k[w.unit] || 1)) : 0;
      prods.push({ id: p.id, handle: p.handle, price: Math.round(Number(v.price) * 100), grams: g || 300, tem: (p.tags || []).includes(TAG100) });
    }
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  const final: Record<string, number> = {};
  for (const p of prods) {
    if (p.price > LIM100 * 100) { final[p.handle] = 1e9; continue; }
    try { const x = await calcular(CEP_SP, "SP", [{ grams: p.grams, price: p.price, quantity: 1 }]); final[p.handle] = x.brl.total_pedido; } catch { final[p.handle] = 1e9; }
  }
  const velhos: any = await gql(`{ products(first: 250, query: "tag:${TAG100} -status:active") { nodes { id handle } } }`);
  const por = prods.filter((p) => final[p.handle] <= LIM100 && !p.tem);
  const tirar = [...prods.filter((p) => final[p.handle] > LIM100 && p.tem), ...velhos.products.nodes];
  const erros: string[] = [];
  for (const p of por) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsAdd(id: $id, tags: $t) { userErrors { message } } }`, { id: p.id, t: [TAG100] }); if (d.tagsAdd.userErrors.length) erros.push(p.handle + ": " + d.tagsAdd.userErrors[0].message); }
  for (const p of tirar) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsRemove(id: $id, tags: $t) { userErrors { message } } }`, { id: p.id, t: [TAG100] }); if (d.tagsRemove.userErrors.length) erros.push(p.handle + ": " + d.tagsRemove.userErrors[0].message); }
  return { ativos: prods.length, no_limite: prods.filter((p) => final[p.handle] <= LIM100).length, colocou: por.map((p) => p.handle), tirou: tirar.map((p: any) => p.handle), erros };
}

async function varianteVender(itens: any[]) {
  const out: any[] = [];
  for (const it of itens.slice(0, 20)) {
    try {
      const q: any = await gql(`query($q: String!) { productVariants(first: 2, query: $q) { nodes { id sku inventoryItem { id tracked inventoryLevels(first: 5) { nodes { location { id } } } } } } }`, { q: "sku:" + String(it.sku) });
      const v = q.productVariants.nodes.find((x: any) => x.sku === String(it.sku)); if (!v) throw new Error("SKU não está no Shopify");
      const qtd = it.vender ? 9999 : 0;
      const locs = (v.inventoryItem.inventoryLevels.nodes || []).map((n: any) => n.location.id);
      if (!locs.length) throw new Error("variante sem local de estoque");
      const d: any = await gql(`mutation($i: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $i) { userErrors { message } } }`,
        { i: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: locs.map((l: string) => ({ inventoryItemId: v.inventoryItem.id, locationId: l, quantity: qtd })) } });
      if (d.inventorySetQuantities.userErrors.length) throw new Error(d.inventorySetQuantities.userErrors[0].message);
      out.push({ sku: it.sku, ok: true, estoque: qtd, rastreado: v.inventoryItem.tracked });
    } catch (e) { out.push({ sku: it.sku, ok: false, erro: String((e as Error).message || e).slice(0, 300) }); }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  const b: any = await req.json().catch(() => ({}));
  try {
    if (b.modo === "ate50") return resp(200, { ok: true, ...(await ate50()) });
    if (b.modo === "ate100") return resp(200, { ok: true, ...(await ate100()) });
    const { data } = await admin.from("config").select("valor").eq("chave", "chave_robo").maybeSingle();
    const chave = String((data as any)?.valor?.chave || "");
    if (!chave || req.headers.get("x-chave") !== chave) return resp(403, { erro: "sem permissão" });
    if (b.modo === "titulos") return resp(200, { ok: true, resultados: await titulos(b.itens || []) });
    if (b.modo === "variante_vender") return resp(200, { ok: true, resultados: await varianteVender(b.itens || []) });
    if (b.modo === "peso_variante") return resp(200, { ok: true, resultados: await pesoVariante(b.itens || []) });
    return resp(400, { erro: "modo desconhecido" });
  } catch (e) { return resp(500, { erro: String((e as Error).message || e).slice(0, 300) }); }
});

// Robô de catálogo (ajustes em lote aprovados pelo Tae no chat). Só funciona com o cabeçalho x-chave = config.chave_robo,
// que é criada para a tarefa e apagada no fim. Nada aqui ativa produto: criar sempre cria em RASCUNHO.
//   { modo: "fonte", handles: [..], loja?: "numbuzinus.com" } → lê a ficha oficial (Shopify da marca): título, texto, fotos, peso
//   { modo: "arquivar", ids: [productId] }                     → status ARCHIVED
//   { modo: "atualizar", itens: [{ id, titulo?, tipo?, tags?, preco?, peso_g? }] } → 1ª variante para preço/peso; tags substitui a lista
//   { modo: "criar", itens: [{ titulo, handle, vendor, tipo, tags, html | desc, fotos: [url] | fonte (handle na loja oficial), sku, preco, peso_g }] } → cria em DRAFT
//   { modo: "ler", ids: [productId] }                          → título, tipo, tags, status, preço, peso, nº de fotos
import { createClient } from "npm:@supabase/supabase-js@2";
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

// Mesmo padrão de descrição de tools/descricoes/montar.py (padrão TIRTIR Mask Fit Red Cushion).
const E = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CSS = '<style>.omg-sec>summary{list-style:none;display:flex;justify-content:space-between;align-items:center}.omg-sec>summary::-webkit-details-marker{display:none}.omg-sec>summary::after{content:"+";font-size:1.4em;font-weight:400;line-height:1}.omg-sec[open]>summary::after{content:"\\2212"}</style>';
const sec = (t: string, c: string) => `<details class="omg-sec" style="border-top:1px solid rgba(0,0,0,.12)"><summary style="cursor:pointer;font-weight:600;padding:14px 0;">${t}</summary><div style="padding:0 0 14px">${c}</div></details>`;
const ul = (L: any[] | undefined, tag = "ul") => { const l = (L || []).filter((x) => String(x).trim()); return l.length ? `<${tag}>\n` + l.map((x) => `<li>${E(x)}</li>`).join("\n") + `\n</${tag}>` : ""; };
function montar(d: any, sku = "", marca = "") {
  const h = [CSS, '<div class="omg-desc">', `<p class="omg-nota"><strong>Descrição</strong><br>${E(d.descricao)}</p>`];
  if (d.tamanho) h.push(`<p><strong>Tamanho:</strong> ${E(d.tamanho)}</p>`);
  if (d.beneficios?.length) h.push(sec("Benefícios", ul(d.beneficios)));
  if (d.indicado) h.push(sec("Indicado para", `<p>${E(d.indicado)}</p>`));
  if (d.opcoes) h.push(sec("Opções", `<p>${E(d.opcoes)}</p>`));
  if (d.como_usar?.length) h.push(sec("Como usar", ul(d.como_usar, "ol")));
  let ing = ul(d.ingredientes);
  if (d.inci) ing += `\n<p class="omg-inci"><small>${E(d.inci)}</small></p>\n<p><small>A composição pode mudar entre lotes. Vale sempre a lista impressa na embalagem.</small></p>`;
  if (ing) h.push(sec("Ingredientes", ing));
  h.push(sec("Detalhes", ul([marca ? `Marca: ${marca}` : "", "Fabricado em: Coreia do Sul", sku ? `SKU: ${sku}` : ""])));
  if (d.sobre_marca) h.push(sec("Sobre a marca", `<p>${E(d.sobre_marca)}</p>`));
  h.push('<p style="border-top:1px solid rgba(0,0,0,.12);padding-top:14px"><small>Produto importado da Coreia do Sul. Será registrada uma Declaração de Importação e o pedido está sujeito aos tributos federais e estaduais, calculados no checkout.</small></p>');
  h.push("</div>");
  return h.join("\n");
}
const gid = (id: any) => String(id).startsWith("gid://") ? String(id) : "gid://shopify/Product/" + id;
const erro = (e: unknown) => String((e as Error).message || e).slice(0, 300);

async function variante1(pid: string) {
  const d: any = await gql(`query($id: ID!) { product(id: $id) { variants(first: 2) { nodes { id } } } }`, { id: pid });
  return d.product.variants.nodes[0]?.id;
}
async function precoPeso(pid: string, vid: string, preco?: number, peso?: number, sku?: string) {
  const v: any = { id: vid };
  if (preco != null) v.price = String(preco);
  const ii: any = {};
  if (peso != null) ii.measurement = { weight: { value: Number(peso), unit: "GRAMS" } };
  if (sku) ii.sku = sku;
  if (Object.keys(ii).length) v.inventoryItem = ii;
  const d: any = await gql(`mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } } }`, { p: pid, v: [v] });
  if (d.productVariantsBulkUpdate.userErrors.length) throw new Error(d.productVariantsBulkUpdate.userErrors[0].message);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  const { data } = await admin.from("config").select("valor").eq("chave", "chave_robo").maybeSingle();
  const chave = String((data as any)?.valor?.chave || "");
  if (!chave || req.headers.get("x-chave") !== chave) return resp(403, { erro: "sem permissão" });
  const b: any = await req.json().catch(() => ({}));
  const out: any[] = [];
  try {
    if (b.modo === "fonte") {
      const loja = String(b.loja || "numbuzinus.com").replace(/[^a-z0-9.-]/gi, "");
      for (const h of (b.handles || []).slice(0, 30)) {
        try {
          const r = await fetch(`https://${loja}/products/${encodeURIComponent(h)}.json`, { headers: { "user-agent": "Mozilla/5.0" } });
          const p = (await r.json()).product;
          const txt = String(p.body_html || "").replace(/<(br|\/p|\/li|\/h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
          out.push({ handle: h, ok: true, titulo: p.title, tipo: p.product_type, tags: p.tags, texto: txt.slice(0, 6000),
            fotos: (p.images || []).map((i: any) => i.src), variantes: (p.variants || []).map((v: any) => ({ titulo: v.title, preco: v.price, cheio: v.compare_at_price, gramas: v.grams, sku: v.sku })) });
        } catch (e) { out.push({ handle: h, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "arquivar") {
      for (const id of (b.ids || []).slice(0, 50)) {
        try {
          const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { status } userErrors { message } } }`, { p: { id: gid(id), status: "ARCHIVED" } });
          if (d.productUpdate.userErrors.length) throw new Error(d.productUpdate.userErrors[0].message);
          await admin.from("produtos").update({ ativo: false, site_status: "archived" }).eq("shopify_product_id", String(id));
          out.push({ id, ok: true });
        } catch (e) { out.push({ id, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "atualizar") {
      for (const it of (b.itens || []).slice(0, 40)) {
        try {
          const pid = gid(it.id); const p: any = { id: pid };
          if (it.titulo) p.title = String(it.titulo);
          if (it.tipo) p.productType = String(it.tipo);
          if (Array.isArray(it.tags)) p.tags = it.tags.map(String);
          if (Object.keys(p).length > 1) {
            const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p });
            if (d.productUpdate.userErrors.length) throw new Error(d.productUpdate.userErrors[0].message);
          }
          if (it.preco != null || it.peso_g != null) {
            await precoPeso(pid, await variante1(pid), it.preco, it.peso_g);
            const up: any = {}; if (it.preco != null) up.preco = Number(it.preco); if (it.peso_g != null) up.peso_g = Number(it.peso_g);
            await admin.from("produtos").update(up).eq("shopify_product_id", String(it.id));
          }
          out.push({ id: it.id, ok: true });
        } catch (e) { out.push({ id: it.id, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "criar") {
      for (const it of (b.itens || []).slice(0, 15)) {
        try {
          if (!it.fotos?.length && it.fonte) {
            const r = await fetch(`https://${String(it.fonte_loja || "numbuzinus.com")}/products/${encodeURIComponent(it.fonte)}.json`, { headers: { "user-agent": "Mozilla/5.0" } });
            it.fotos = ((await r.json()).product?.images || []).map((i: any) => i.src);
          }
          const media = (it.fotos || []).slice(0, 20).map((u: string) => ({ originalSource: u, alt: it.titulo, mediaContentType: "IMAGE" }));
          const d: any = await gql(`mutation($p: ProductCreateInput!, $m: [CreateMediaInput!]) { productCreate(product: $p, media: $m) { product { id variants(first: 1) { nodes { id } } } userErrors { message } } }`,
            { p: { title: it.titulo, handle: it.handle, vendor: it.vendor, productType: it.tipo, tags: it.tags, descriptionHtml: it.html || (it.desc ? montar(it.desc, it.sku, it.vendor) : undefined), status: "DRAFT" }, m: media });
          if (d.productCreate.userErrors.length) throw new Error(d.productCreate.userErrors[0].message);
          const pid = d.productCreate.product.id;
          await precoPeso(pid, d.productCreate.product.variants.nodes[0].id, it.preco, it.peso_g, it.sku);
          out.push({ handle: it.handle, ok: true, id: pid.split("/").pop() });
        } catch (e) { out.push({ handle: it.handle, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "ler") {
      for (const id of (b.ids || []).slice(0, 80)) {
        try {
          const d: any = await gql(`query($id: ID!) { product(id: $id) { handle title productType tags status mediaCount { count }
            media(first: 20) { nodes { ... on MediaImage { image { url width height } } } }
            variants(first: 1) { nodes { price sku inventoryItem { measurement { weight { value unit } } } } } } }`, { id: gid(id) });
          const p = d.product; const v = p.variants.nodes[0] || {};
          out.push({ id, handle: p.handle, titulo: p.title, tipo: p.productType, tags: p.tags, status: p.status, fotos: p.mediaCount?.count,
            imagens: p.media.nodes.map((m: any) => m.image && [m.image.url, m.image.width, m.image.height]).filter(Boolean),
            preco: v.price, sku: v.sku, peso: v.inventoryItem?.measurement?.weight?.value });
        } catch (e) { out.push({ id, ok: false, erro: erro(e) }); }
      }
    } else return resp(400, { erro: "modo desconhecido" });
    return resp(200, { ok: true, resultados: out });
  } catch (e) { return resp(500, { erro: erro(e) }); }
});

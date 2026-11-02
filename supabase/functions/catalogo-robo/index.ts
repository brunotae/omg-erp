// Robô de catálogo (ajustes em lote aprovados pelo Tae no chat). Só funciona com o cabeçalho x-chave = config.chave_robo,
// que é criada para a tarefa e apagada no fim. "criar" sempre cria em RASCUNHO; só o modo "status" ativa, e só com OK explícito do Tae no chat.
//   { modo: "fonte", handles: [..], loja?: "numbuzinus.com" } → lê a ficha oficial (Shopify da marca): título, texto, fotos, peso
//   { modo: "arquivar", ids: [productId] }                     → status ARCHIVED
//   { modo: "atualizar", itens: [{ id, titulo?, tipo?, tags?, preco?, peso_g? }] } → 1ª variante para preço/peso; tags substitui a lista
//   { modo: "criar", itens: [{ titulo, handle, vendor, tipo, tags, html | desc, fotos: [url] | fonte (handle na loja oficial), sku, preco, peso_g }] } → cria em DRAFT
//   { modo: "ler", ids: [productId] }                          → título, tipo, tags, status, preço, peso, nº de fotos
//   { modo: "completar", itens: [{ sku, preco?, peso_g?, hs?, dim?: [c,l,a], nome_en?, nome_kr? }] } → Shopify (por SKU) + ERP
//   { modo: "versoes", base, titulo?, opcao?, variantes: [{ sku, nome, preco, peso_g, de?, foto? }] } → junta versões num produto só
//   { modo: "capa", fase: "por" | "fim", itens } → troca a capa (mesmo fluxo da função capa-foto)
//   { modo: "status", ids, status: "ACTIVE" | "DRAFT" } → ativa (e publica nos canais de um produto ativo) — só com OK explícito do Tae
//   { modo: "ler2", ids } → conferência completa por versão
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
async function porSku(sku: string) {
  const d: any = await gql(`query($q: String!) { productVariants(first: 5, query: $q) { nodes { id sku product { id } } } }`, { q: "sku:" + sku });
  const v = d.productVariants.nodes.find((x: any) => x.sku === sku); if (!v) throw new Error("SKU não está no Shopify");
  return v;
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
    } else if (b.modo === "completar") {
      // por SKU: preço, peso, HS, origem KR, medidas (metafield) no Shopify + mesmos dados e nomes EN/KR no ERP
      for (const it of (b.itens || []).slice(0, 40)) {
        try {
          const v = await porSku(String(it.sku));
          const ii: any = { countryCodeOfOrigin: "KR" };
          if (it.peso_g != null) ii.measurement = { weight: { value: Number(it.peso_g), unit: "GRAMS" } };
          if (it.hs) ii.harmonizedSystemCode = String(it.hs).replace(/\D/g, "");
          const vv: any = { id: v.id, inventoryItem: ii };
          if (it.preco != null) vv.price = String(it.preco);
          if (Array.isArray(it.dim) && it.dim.every((x: any) => x != null)) vv.metafields = [{ namespace: "custom", key: "dimensoes_cm", type: "single_line_text_field", value: it.dim.map((x: any) => String(x).replace(".", ",")).join(" × ") + " cm" }];
          const d: any = await gql(`mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } } }`, { p: v.product.id, v: [vv] });
          if (d.productVariantsBulkUpdate.userErrors.length) throw new Error(d.productVariantsBulkUpdate.userErrors[0].message);
          const up: any = { shopify_product_id: v.product.id.split("/").pop(), shopify_variant_id: v.id.split("/").pop() };
          if (it.preco != null) up.preco = Number(it.preco);
          if (it.peso_g != null) up.peso_g = Number(it.peso_g);
          if (it.hs) up.hs = String(it.hs);
          if (Array.isArray(it.dim)) { up.comp_cm = it.dim[0]; up.larg_cm = it.dim[1]; up.alt_cm = it.dim[2]; }
          if (it.nome_en) up.nome_en = String(it.nome_en);
          if (it.nome_kr) up.nome_kr = String(it.nome_kr);
          const { error } = await admin.from("produtos").update(up).eq("sku", String(it.sku));
          if (error) throw new Error("ERP: " + error.message);
          out.push({ sku: it.sku, ok: true });
        } catch (e) { out.push({ sku: it.sku, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "versoes") {
      // { base: productId, titulo?, opcao: "Versão", variantes: [{ sku, nome, preco, peso_g, de?: productId (arquivado depois), foto?: url }] }
      // a 1ª variante é a que o produto-base já tem; as outras são criadas nele
      const pid = gid(b.base); const opcao = String(b.opcao || "Versão"); const vs = b.variantes || [];
      const p0: any = (await gql(`query($id: ID!) { product(id: $id) { title options { id name } media(first: 1) { nodes { id } }
        variants(first: 10) { nodes { id sku inventoryPolicy inventoryItem { tracked } } } } }`, { id: pid })).product;
      const v0 = p0.variants.nodes[0];
      if (v0.sku !== vs[0].sku) throw new Error(`a 1ª versão do produto-base é ${v0.sku}, não ${vs[0].sku}`);
      if (p0.options.length === 1 && p0.options[0].name === "Title") {
        const o: any = await gql(`mutation($p: ID!, $o: [OptionCreateInput!]!) { productOptionsCreate(productId: $p, options: $o, variantStrategy: LEAVE_AS_IS) { userErrors { message } } }`,
          { p: pid, o: [{ name: opcao, values: [{ name: vs[0].nome }] }] });
        if (o.productOptionsCreate.userErrors.length) throw new Error("opção: " + o.productOptionsCreate.userErrors[0].message);
      }
      const novos = vs.slice(1).filter((v: any) => !p0.variants.nodes.some((x: any) => x.sku === v.sku));
      let criadas: any[] = [];
      if (novos.length) {
        const c: any = await gql(`mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkCreate(productId: $p, variants: $v) { productVariants { id sku } userErrors { message } } }`,
          { p: pid, v: novos.map((v: any) => ({ optionValues: [{ optionName: opcao, name: v.nome }], price: String(v.preco), inventoryPolicy: v0.inventoryPolicy,
            inventoryItem: { sku: v.sku, tracked: v0.inventoryItem.tracked, countryCodeOfOrigin: "KR", measurement: { weight: { value: Number(v.peso_g), unit: "GRAMS" } } } })) });
        if (c.productVariantsBulkCreate.userErrors.length) throw new Error("versões: " + c.productVariantsBulkCreate.userErrors[0].message);
        criadas = c.productVariantsBulkCreate.productVariants;
      }
      if (b.titulo) {
        const t: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: pid, title: String(b.titulo) } });
        if (t.productUpdate.userErrors.length) throw new Error("título: " + t.productUpdate.userErrors[0].message);
      }
      // fotos das versões
      const todas: any = (await gql(`query($id: ID!) { product(id: $id) { variants(first: 20) { nodes { id sku } } } }`, { id: pid })).product.variants.nodes;
      const ligar: any[] = [];
      if (p0.media.nodes[0]) ligar.push({ variantId: v0.id, mediaIds: [p0.media.nodes[0].id] });
      for (const v of vs.slice(1)) {
        if (!v.foto) continue;
        const vid = todas.find((x: any) => x.sku === v.sku)?.id; if (!vid) continue;
        const a: any = await gql(`mutation($id: ID!, $m: [CreateMediaInput!]!) { productCreateMedia(productId: $id, media: $m) { media { id } mediaUserErrors { message } } }`,
          { id: pid, m: [{ originalSource: String(v.foto), alt: `${p0.title} - ${v.nome}`, mediaContentType: "IMAGE" }] });
        const mid = a.productCreateMedia.media[0]?.id; if (!mid) continue;
        for (let i = 0; i < 20; i++) { const st: any = await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { status } } }`, { id: mid }); if (st.node?.status === "READY") break; await new Promise((r) => setTimeout(r, 2000)); }
        ligar.push({ variantId: vid, mediaIds: [mid] });
      }
      if (ligar.length) {
        const l: any = await gql(`mutation($p: ID!, $vm: [ProductVariantAppendMediaInput!]!) { productVariantAppendMedia(productId: $p, variantMedia: $vm) { userErrors { message } } }`, { p: pid, vm: ligar });
        if (l.productVariantAppendMedia.userErrors.length) out.push({ aviso: "fotos das versões: " + l.productVariantAppendMedia.userErrors[0].message });
      }
      // ERP: cada SKU aponta para o produto-base e sua variante; produtos absorvidos são arquivados
      for (const v of vs) {
        const vid = todas.find((x: any) => x.sku === v.sku)?.id;
        await admin.from("produtos").update({ shopify_product_id: pid.split("/").pop(), shopify_variant_id: vid ? vid.split("/").pop() : null }).eq("sku", String(v.sku));
      }
      for (const v of vs) {
        if (!v.de) continue;
        const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: gid(v.de), status: "ARCHIVED" } });
        out.push({ arquivado: v.de, ok: !d.productUpdate.userErrors.length });
      }
      out.push({ base: b.base, ok: true, versoes: todas.map((x: any) => x.sku), criadas: criadas.map((x: any) => x.sku) });
    } else if (b.modo === "capa") {
      // fase "por": adiciona a capa nova (não espera) · fase "fim": põe a nova em 1º, religa versões que usavam a antiga e apaga a antiga
      if (b.fase === "por") {
        for (const it of (b.itens || []).slice(0, 25)) {
          try {
            const p: any = (await gql(`query($id: ID!) { product(id: $id) { title media(first: 1) { nodes { id } } } }`, { id: gid(it.id) })).product;
            const a: any = await gql(`mutation($id: ID!, $m: [CreateMediaInput!]!) { productCreateMedia(productId: $id, media: $m) { media { id } mediaUserErrors { message } } }`,
              { id: gid(it.id), m: [{ originalSource: String(it.url), alt: p.title, mediaContentType: "IMAGE" }] });
            if (a.productCreateMedia.mediaUserErrors.length) throw new Error(a.productCreateMedia.mediaUserErrors[0].message);
            out.push({ id: it.id, ok: true, nova: a.productCreateMedia.media[0]?.id, antiga: p.media.nodes[0]?.id || null });
          } catch (e) { out.push({ id: it.id, ok: false, erro: erro(e) }); }
        }
      } else if (b.fase === "fim") {
        for (const it of (b.itens || []).slice(0, 25)) {
          try {
            const pid = gid(it.id);
            const st: any = await gql(`query($id: ID!) { node(id: $id) { ... on MediaImage { status } } }`, { id: it.nova });
            if (st.node?.status !== "READY") throw new Error("capa nova ainda não está pronta: " + st.node?.status);
            const ro: any = await gql(`mutation($id: ID!, $m: [MoveInput!]!) { productReorderMedia(id: $id, moves: $m) { mediaUserErrors { message } } }`, { id: pid, m: [{ id: it.nova, newPosition: "0" }] });
            if (ro.productReorderMedia.mediaUserErrors.length) throw new Error(ro.productReorderMedia.mediaUserErrors[0].message);
            if (it.antiga) {
              const vs: any = (await gql(`query($id: ID!) { product(id: $id) { variants(first: 20) { nodes { id media(first: 1) { nodes { id } } } } } }`, { id: pid })).product.variants.nodes.filter((v: any) => v.media.nodes[0]?.id === it.antiga);
              if (vs.length) {
                await gql(`mutation($p: ID!, $vm: [ProductVariantDetachMediaInput!]!) { productVariantDetachMedia(productId: $p, variantMedia: $vm) { userErrors { message } } }`, { p: pid, vm: vs.map((v: any) => ({ variantId: v.id, mediaIds: [it.antiga] })) });
                await gql(`mutation($p: ID!, $vm: [ProductVariantAppendMediaInput!]!) { productVariantAppendMedia(productId: $p, variantMedia: $vm) { userErrors { message } } }`, { p: pid, vm: vs.map((v: any) => ({ variantId: v.id, mediaIds: [it.nova] })) });
              }
              const del: any = await gql(`mutation($id: ID!, $ids: [ID!]!) { productDeleteMedia(productId: $id, mediaIds: $ids) { mediaUserErrors { message } } }`, { id: pid, ids: [it.antiga] });
              if (del.productDeleteMedia.mediaUserErrors.length) throw new Error("antiga: " + del.productDeleteMedia.mediaUserErrors[0].message);
            }
            out.push({ id: it.id, ok: true });
          } catch (e) { out.push({ id: it.id, ok: false, erro: erro(e) }); }
        }
      } else return resp(400, { erro: "fase: por | fim" });
    } else if (b.modo === "status") {
      // { ids, status: "ACTIVE" | "DRAFT" } — ACTIVE também publica nos mesmos canais de um produto já ativo
      const status = b.status === "ACTIVE" ? "ACTIVE" : "DRAFT";
      let pubs: string[] = [];
      if (status === "ACTIVE") {
        const r: any = await gql(`{ products(first: 1, query: "status:active") { nodes { resourcePublicationsV2(first: 20) { nodes { publication { id } } } } } }`);
        pubs = (r.products.nodes[0]?.resourcePublicationsV2.nodes || []).map((x: any) => x.publication.id);
      }
      for (const id of (b.ids || []).slice(0, 50)) {
        try {
          const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: gid(id), status } });
          if (d.productUpdate.userErrors.length) throw new Error(d.productUpdate.userErrors[0].message);
          if (pubs.length) {
            const pb: any = await gql(`mutation($id: ID!, $i: [PublicationInput!]!) { publishablePublish(id: $id, input: $i) { userErrors { message } } }`, { id: gid(id), i: pubs.map((p) => ({ publicationId: p })) });
            if (pb.publishablePublish.userErrors.length) throw new Error("publicar: " + pb.publishablePublish.userErrors[0].message);
          }
          await admin.from("produtos").update({ ativo: status === "ACTIVE", site_status: status.toLowerCase() }).eq("shopify_product_id", String(id));
          out.push({ id, ok: true, canais: pubs.length });
        } catch (e) { out.push({ id, ok: false, erro: erro(e) }); }
      }
    } else if (b.modo === "ler2") {
      // conferência completa: todas as versões (sku, preço, peso, HS, origem, medidas), status, nº de fotos, canais
      for (const id of (b.ids || []).slice(0, 40)) {
        try {
          const d: any = await gql(`query($id: ID!) { product(id: $id) { title status mediaCount { count } options { name values } resourcePublicationsV2(first: 10) { nodes { isPublished } }
            variants(first: 10) { nodes { sku title price media(first: 1) { nodes { id } } metafield(namespace: "custom", key: "dimensoes_cm") { value }
              inventoryItem { harmonizedSystemCode countryCodeOfOrigin measurement { weight { value } } } } } } }`, { id: gid(id) });
          const p = d.product;
          out.push({ id, titulo: p.title, status: p.status, fotos: p.mediaCount?.count, canais: p.resourcePublicationsV2.nodes.filter((x: any) => x.isPublished).length, opcoes: p.options,
            versoes: p.variants.nodes.map((v: any) => ({ sku: v.sku, nome: v.title, preco: v.price, foto: !!v.media.nodes[0], dim: v.metafield?.value, hs: v.inventoryItem.harmonizedSystemCode, origem: v.inventoryItem.countryCodeOfOrigin, peso: v.inventoryItem.measurement?.weight?.value })) });
        } catch (e) { out.push({ id, ok: false, erro: erro(e) }); }
      }
    } else return resp(400, { erro: "modo desconhecido" });
    return resp(200, { ok: true, resultados: out });
  } catch (e) { return resp(500, { erro: erro(e) }); }
});

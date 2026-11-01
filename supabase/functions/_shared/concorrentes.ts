// Leitura de páginas de produto dos concorrentes válidos (KS · UpZero, Jini · Nuvemshop, Sephora Brasil · Salesforce).
export const LOJAS: Record<string, { sitemap: string; padrao: RegExp }> = {
  ks: { sitemap: "https://kscosmeticos.com.br/sitemap.xml", padrao: /https:\/\/kscosmeticos\.com\.br\/(?:produtos|kits)\/[^<\s"']+/g },
  jini: { sitemap: "https://jinicosmeticos.com.br/sitemap.xml", padrao: /https:\/\/jinicosmeticos\.com\.br\/produtos\/[^<\s"']+/g },
  // Sephora tem ~8 mil produtos: só lemos os das marcas que a OMG vende (o nome da marca vem no link)
  sephora: { sitemap: "https://www.sephora.com.br/sitemap_0-product.xml", padrao: /https:\/\/www\.sephora\.com\.br\/[^<\s"']+\.html/g },
};
// Promoção da Sephora só vale como referência depois de 14 dias no ar (promoção relâmpago não conta)
export const PROMO_DIAS = 14;
export const lojaDaUrl = (u: string) => /kscosmeticos/i.test(u) ? "ks" : /jinicosmeticos/i.test(u) ? "jini" : /sephora\.com\.br/i.test(u) ? "sephora" : "";
const slug = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36", "accept-language": "pt-BR" };
const norm = (u: string) => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const num = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return x > 0 ? x : null; };
const desc = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

export async function urlsDaLoja(loja: string, marcas: string[] = []): Promise<string[]> {
  const r = await fetch(LOJAS[loja].sitemap, { headers: UA });
  const t = await r.text();
  let L = [...new Set((t.match(LOJAS[loja].padrao) || []).map(desc))].filter((u) => !/\/(produtos|kits)\/?$/.test(u));
  if (loja === "sephora") {
    const S = [...new Set(marcas.map(slug).filter((x) => x.length >= 3))];
    L = L.filter((u) => { const n = "-" + u.split("/").pop()!.replace(/\.html$/, "") + "-"; return S.some((m) => n.includes("-" + m + "-")); });
  }
  return L.sort();
}

export async function lerPagina(url: string) {
  const loja = lojaDaUrl(url) || "jini";
  if (loja === "sephora") return lerSephora(url);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("página respondeu " + r.status);
  const t = await r.text();
  const prods: any[] = [];
  for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: any; try { j = JSON.parse(m[1].trim().replace(/[\u0000-\u001F]+/g, " ")); } catch { continue; }
    const pilha = Array.isArray(j) ? [...j] : [j];
    while (pilha.length) { const o = pilha.pop(); if (o && typeof o === "object") { if (o["@type"] === "Product") prods.push(o); if (Array.isArray(o["@graph"])) pilha.push(...o["@graph"]); } }
  }
  const ofr = (o: any) => Array.isArray(o?.offers) ? o.offers[0] || {} : o?.offers || {};
  let p = prods.find((o) => [ofr(o).url, o?.mainEntityOfPage?.["@id"], o?.url].some((x) => x && norm(x) === norm(url)));
  if (!p && loja === "ks") p = prods[0];
  let nome: string | null = p?.name ?? null;
  let marca: string | null = typeof p?.brand === "object" ? p?.brand?.name : p?.brand ?? null;
  let preco = num(ofr(p).price ?? ofr(p).lowPrice), de: number | null = null, peso: number | null = null;
  let esgotado = /OutOfStock/.test(String(ofr(p).availability ?? ""));
  const w = p?.weight; if (w && num(w.value)) peso = Math.round(num(w.value)! * (String(w.unitCode || "KGM").toUpperCase() === "KGM" ? 1000 : 1));
  if (loja === "jini") {
    const mp = t.match(/<meta property="nuvemshop:price" content="([\d.,]+)"/); if (!preco && mp) preco = num(mp[1]);
    const mc = t.match(/"compare_at_price_number":\s*([\d.]+)/); if (mc) de = num(mc[1]);
    if (!nome) { const mt = t.match(/<meta property="og:title" content="([^"]+)"/); nome = mt ? desc(mt[1]) : null; }
    if (!marca && nome && nome.includes(" - ")) marca = nome.split(" - ")[0].trim();
    if (/"available":false/.test((t.split("LS.variants")[1] || "").slice(0, 3000))) esgotado = true;
  } else {
    const ml = t.match(/line-through[^>]*>\s*R\$\s*([\d.]+,\d{2})/); if (ml) de = num(ml[1].replace(/\./g, "").replace(",", "."));
  }
  if (de && preco && de <= preco) de = null;
  // Desconto do Pix: KS guarda em pixConditions.discountPercent; Jini no bloco "info-payment-method-pix".
  let pix_pct: number | null = null;
  if (loja === "ks") {
    const m = t.replace(/&quot;/g, '"').match(/"pixConditions":\[0,\{"discountPercent":\[0,([\d.]+)\]/);
    if (m) pix_pct = parseFloat(m[1]);
    if (/"showPixDiscount":\[0,false\]/.test(t.replace(/&quot;/g, '"'))) pix_pct = 0;
  } else {
    const bloco = (t.split("info-payment-method-pix")[1] || "").slice(0, 2500);
    const m = bloco.match(/<strong>\s*([\d.,]+)\s*% de desconto\s*<\/strong>/);
    if (m) pix_pct = num(m[1]) ?? 0;
  }
  const preco_pix = preco ? Math.round(preco * (1 - (pix_pct || 0) / 100) * 100) / 100 : null;
  return { url, loja, nome, marca, sku: p?.sku ?? null, preco, preco_de: de, esgotado, peso_g: peso, pix_pct, preco_pix };
}

// Sephora Brasil: nome e marca no ld+json; preço de/por no HTML; estoque em data-available; tamanho na variação; EAN no link da foto.
async function lerSephora(url: string) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("página respondeu " + r.status);
  const t = await r.text();
  let p: any = null;
  for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim().replace(/[\u0000-\u001F]+/g, " ")); if (j && j["@type"] === "Product") { p = j; break; } } catch { /* segue */ }
  }
  const brl = (s?: string | null) => s ? num(s.replace(/\./g, "").replace(",", ".")) : null;
  const venda = brl((t.match(/class="price-sales[^"]*"[^>]*>\s*R\$\s*([\d.]+,\d{2})/) || [])[1]);
  const cheio = brl((t.match(/class="price-standard"[^>]*>\s*R\$\s*([\d.]+,\d{2})/) || [])[1]);
  const preco = venda || cheio;
  const de = cheio && preco && cheio > preco ? cheio : null;
  const disp = t.match(/data-available="(\d+)"/);
  const esgotado = disp ? Number(disp[1]) <= 0 : !/add-to-cart/.test(t);
  const tam = (t.match(/&quot;displayValue&quot;:&quot;([^&]+)&quot;/) || [])[1] || null;
  let nome: string | null = p?.name ? desc(String(p.name)) : null;
  if (nome && tam && !new RegExp(tam.replace(/\s/g, "\\s?"), "i").test(nome)) nome = nome + " " + tam.toLowerCase().replace(/(\d)(ml|g)\b/, "$1 $2");
  const marca = typeof p?.brand === "object" ? p?.brand?.name : p?.brand ?? null;
  const ean = (String(p?.image || "").match(/\/(\d{12,14})\//) || [])[1] || null;
  return { url, loja: "sephora", nome, marca, sku: ean, preco, preco_de: de, esgotado, peso_g: null, pix_pct: 0, preco_pix: preco };
}

// Grava uma leitura em conc_catalogo, guardando o preço anterior quando muda.
export async function gravarLeitura(admin: any, x: Awaited<ReturnType<typeof lerPagina>>) {
  if (!x.preco) throw new Error("preço não encontrado na página");
  const { data: ant } = await admin.from("conc_catalogo").select("preco,peso_g,promo_desde").eq("url", x.url).maybeSingle();
  const agora = new Date().toISOString();
  const row: Record<string, unknown> = { ...x, peso_g: x.peso_g ?? ant?.peso_g ?? null, ativo: true, lido_em: agora };
  if (x.loja === "sephora") {
    // preco_pix = "preço que vale": promoção só depois de PROMO_DIAS no ar; antes disso, o preço cheio
    const desde = x.preco_de ? (ant?.promo_desde || agora) : null;
    row.promo_desde = desde;
    const firme = desde && Date.now() - new Date(desde).getTime() >= PROMO_DIAS * 864e5;
    row.preco_pix = x.preco_de && !firme ? x.preco_de : x.preco;
  }
  if (ant && Number(ant.preco) !== x.preco) { row.preco_ant = Number(ant.preco); row.mudou_em = agora; }
  const { error } = await admin.from("conc_catalogo").upsert(row, { onConflict: "url" });
  if (error) throw new Error(error.message);
}

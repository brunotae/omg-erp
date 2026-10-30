// Leitura de páginas de produto dos concorrentes válidos (KS · UpZero, Jini · Nuvemshop).
export const LOJAS: Record<string, { sitemap: string; padrao: RegExp }> = {
  ks: { sitemap: "https://kscosmeticos.com.br/sitemap.xml", padrao: /https:\/\/kscosmeticos\.com\.br\/(?:produtos|kits)\/[^<\s]+/g },
  jini: { sitemap: "https://jinicosmeticos.com.br/sitemap.xml", padrao: /https:\/\/jinicosmeticos\.com\.br\/produtos\/[^<\s]+/g },
};
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36", "accept-language": "pt-BR" };
const norm = (u: string) => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const num = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return x > 0 ? x : null; };
const desc = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

export async function urlsDaLoja(loja: string): Promise<string[]> {
  const r = await fetch(LOJAS[loja].sitemap, { headers: UA });
  const t = await r.text();
  return [...new Set((t.match(LOJAS[loja].padrao) || []).map(desc))].sort();
}

export async function lerPagina(url: string) {
  const loja = /kscosmeticos/i.test(url) ? "ks" : "jini";
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("página respondeu " + r.status);
  const t = await r.text();
  const prods: any[] = [];
  for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: any; try { j = JSON.parse(m[1].trim()); } catch { continue; }
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
  return { url, loja, nome, marca, sku: p?.sku ?? null, preco, preco_de: de, esgotado, peso_g: peso };
}

// Grava uma leitura em conc_catalogo, guardando o preço anterior quando muda.
export async function gravarLeitura(admin: any, x: Awaited<ReturnType<typeof lerPagina>>) {
  if (!x.preco) throw new Error("preço não encontrado na página");
  const { data: ant } = await admin.from("conc_catalogo").select("preco,peso_g").eq("url", x.url).maybeSingle();
  const agora = new Date().toISOString();
  const row: Record<string, unknown> = { ...x, peso_g: x.peso_g ?? ant?.peso_g ?? null, ativo: true, lido_em: agora };
  if (ant && Number(ant.preco) !== x.preco) { row.preco_ant = Number(ant.preco); row.mudou_em = agora; }
  const { error } = await admin.from("conc_catalogo").upsert(row, { onConflict: "url" });
  if (error) throw new Error(error.message);
}

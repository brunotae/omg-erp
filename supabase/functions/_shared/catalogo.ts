// Raio-X do catálogo no servidor: uma ficha por produto (catalogo_produtos) igual para todo mundo,
// e o histórico do que mudou (catalogo_mudancas). Alimentado por:
//   - shopify-admin: depois de cada ação que mexe em produto (atualização na hora)
//   - shopify-webhook: aviso do Shopify products/create|update|delete
//   - catalogo-sync: leitura do que mudou (botão "Atualizar agora") e leitura completa de madrugada
type Item = { id: string; handle: string; titulo: string; marca: string; status: string; tipo: string; tags: string[];
  fotos: number; skus: number; preco_min: number; preco_max: number; atualizado_shopify: string | null };

export const Q_CATALOGO = `query($a: String, $q: String) { products(first: 250, after: $a, query: $q) { nodes { legacyResourceId handle title vendor status productType tags updatedAt
  mediaCount { count } variantsCount { count } priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } } } pageInfo { hasNextPage endCursor } } }`;

export function deGraphql(p: any): Item {
  return { id: String(p.legacyResourceId), handle: p.handle, titulo: p.title, marca: p.vendor || "", status: p.status, tipo: p.productType || "",
    tags: p.tags || [], fotos: p.mediaCount?.count ?? 0, skus: p.variantsCount?.count ?? 0,
    preco_min: Number(p.priceRangeV2?.minVariantPrice?.amount ?? 0), preco_max: Number(p.priceRangeV2?.maxVariantPrice?.amount ?? 0),
    atualizado_shopify: p.updatedAt || null };
}
export function deWebhook(p: any): Item {
  const precos = (p.variants || []).map((v: any) => Number(v.price) || 0);
  return { id: String(p.id), handle: p.handle, titulo: p.title, marca: p.vendor || "", status: String(p.status || "").toUpperCase(), tipo: p.product_type || "",
    tags: String(p.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean), fotos: (p.media || p.images || []).length, skus: (p.variants || []).length,
    preco_min: precos.length ? Math.min(...precos) : 0, preco_max: precos.length ? Math.max(...precos) : 0, atualizado_shopify: p.updated_at || null };
}

const CAMPOS: [keyof Item, string][] = [["status", "status"], ["titulo", "título"], ["preco_min", "preço"], ["preco_max", "preço máx."], ["fotos", "fotos"], ["marca", "marca"]];

export async function gravarCatalogo(sb: any, itens: Item[], origem: string, por = "") {
  if (!itens.length) return { gravados: 0, mudancas: 0 };
  const agora = new Date().toISOString();
  let mud = 0;
  for (let i = 0; i < itens.length; i += 300) {
    const parte = itens.slice(i, i + 300);
    const { data: velhos } = await sb.from("catalogo_produtos").select("id,status,titulo,preco_min,preco_max,fotos,marca").in("id", parte.map((x) => x.id));
    const V = new Map((velhos || []).map((v: any) => [v.id, v]));
    const reg: any[] = [];
    for (const n of parte) {
      const v: any = V.get(n.id);
      if (!v) { reg.push({ produto_id: n.id, handle: n.handle, titulo: n.titulo, marca: n.marca, campo: "novo", de: null, para: n.status, origem, por }); continue; }
      for (const [k, nome] of CAMPOS) {
        const a = v[k], b = (n as any)[k];
        const igual = typeof b === "number" ? Math.abs(Number(a) - b) < 0.005 : String(a ?? "") === String(b ?? "");
        if (!igual) reg.push({ produto_id: n.id, handle: n.handle, titulo: n.titulo, marca: n.marca, campo: nome, de: a == null ? null : String(a), para: String(b), origem, por });
      }
    }
    const { error } = await sb.from("catalogo_produtos").upsert(parte.map((x) => ({ ...x, lido_em: agora })), { onConflict: "id" });
    if (error) throw error;
    // a primeira leitura (tabela vazia) não vira histórico: seriam milhares de "novo"
    if (reg.length && (velhos || []).length) { await sb.from("catalogo_mudancas").insert(reg); mud += reg.length; }
  }
  return { gravados: itens.length, mudancas: mud };
}

async function marcarSync(sb: any, campo: string, quando: string) {
  const { data } = await sb.from("config").select("valor").eq("chave", "catalogo_sync").maybeSingle();
  await sb.from("config").upsert({ chave: "catalogo_sync", valor: { ...(data?.valor || {}), [campo]: quando } }, { onConflict: "chave" });
}
export async function lerSync(sb: any) {
  const { data } = await sb.from("config").select("valor").eq("chave", "catalogo_sync").maybeSingle();
  return data?.valor || {};
}

// Lê do Shopify só o que mudou desde a última leitura (com 10 min de folga) e grava.
export async function syncIncremental(sb: any, gql: (q: string, v?: any) => Promise<any>, origem: string, por = "") {
  const ini = new Date().toISOString();
  const cfg = await lerSync(sb);
  const desde = new Date(new Date(cfg.ultima || cfg.ultima_completa || Date.now() - 864e5).getTime() - 10 * 60e3).toISOString();
  const itens: Item[] = []; let a: string | null = null;
  do {
    const d = await gql(Q_CATALOGO, { a, q: `updated_at:>='${desde}'` });
    itens.push(...d.products.nodes.map(deGraphql)); a = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (a && itens.length < 3000);
  const r = await gravarCatalogo(sb, itens, origem, por);
  await marcarSync(sb, "ultima", ini);
  return { ...r, lidos: itens.length, desde };
}

// Lê tudo; o que não veio mais do Shopify vira "EXCLUIDO".
export async function syncCompleta(sb: any, gql: (q: string, v?: any) => Promise<any>, origem: string, por = "") {
  const ini = new Date().toISOString();
  const itens: Item[] = []; let a: string | null = null;
  do {
    const d = await gql(Q_CATALOGO, { a, q: null });
    itens.push(...d.products.nodes.map(deGraphql)); a = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (a);
  const r = await gravarCatalogo(sb, itens, origem, por);
  const vistos = new Set(itens.map((x) => x.id));
  const { data: todos } = await sb.from("catalogo_produtos").select("id,handle,titulo,marca,status").neq("status", "EXCLUIDO");
  const sumiu = (todos || []).filter((x: any) => !vistos.has(x.id));
  if (sumiu.length) {
    await sb.from("catalogo_produtos").update({ status: "EXCLUIDO", lido_em: ini }).in("id", sumiu.map((x: any) => x.id));
    await sb.from("catalogo_mudancas").insert(sumiu.map((x: any) => ({ produto_id: x.id, handle: x.handle, titulo: x.titulo, marca: x.marca, campo: "status", de: x.status, para: "EXCLUIDO", origem, por })));
  }
  await marcarSync(sb, "ultima", ini); await marcarSync(sb, "ultima_completa", ini);
  return { ...r, lidos: itens.length, excluidos: sumiu.length };
}

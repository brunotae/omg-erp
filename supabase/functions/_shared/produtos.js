// Converte produto do Shopify (webhook REST ou GraphQL) em linhas da tabela "produtos" (uma por variante).
// Custos (₩ fábrica, ₩ La Belle), estoque Skyroad e DG NÃO vêm do Shopify e nunca são sobrescritos.

const gid = (x) => String(x ?? "").split("/").pop();
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const gramas = (w) => {
  if (!w) return null;
  const v = num(w.value), u = String(w.unit || "").toUpperCase();
  if (v == null) return null;
  return Math.round(u === "KILOGRAMS" ? v * 1000 : u === "POUNDS" ? v * 453.592 : u === "OUNCES" ? v * 28.3495 : v);
};

export function produtoParaLinhas(p) {
  const status = String(p.status || "").toLowerCase(); // active | draft | archived
  const variantes = Array.isArray(p.variants) ? p.variants : (p.variants?.nodes || []);
  const unica = variantes.length <= 1;
  return variantes.map((v) => {
    const opc = v.title && v.title !== "Default Title" ? v.title : "";
    return {
      sku: String(v.sku || "").trim() || (p.handle || gid(p.id)) + (unica ? "" : "-" + gid(v.id)),
      nome: (p.title || "") + (opc && !unica ? " · " + opc : ""),
      marca: p.vendor || "",
      categoria: p.product_type ?? p.productType ?? "",
      preco: num(v.price),
      peso_g: v.grams != null ? num(v.grams) : gramas(v.inventoryItem?.measurement?.weight),
      ativo: status === "active",
      site_status: status || "active",
      shopify_product_id: gid(p.id),
      shopify_variant_id: gid(v.id),
    };
  });
}

// Grava as linhas: acha pelo id da variante; senão pelo SKU (ex.: veio do CSV); senão cria.
// A coluna sku é única. Quando o Shopify tem o mesmo SKU em duas variantes, a segunda fica no ERP
// como "SKU-idDaVariante" (ver gravarProdutosLote). Aqui nunca devolvemos o SKU repetido:
// isso dava erro de duplicidade e o Shopify marcava o aviso products/update como falha.
export async function gravarProdutos(sb, linhas) {
  let novos = 0, atualizados = 0;
  for (const l0 of linhas) {
    let l = { ...l0 };
    let { data: ex } = await sb.from("produtos").select("id,sku").eq("shopify_variant_id", l.shopify_variant_id).maybeSingle();
    if (!ex && l.sku) {
      const { data: s } = await sb.from("produtos").select("id,sku,shopify_variant_id").eq("sku", l.sku).limit(1).maybeSingle();
      if (s && !s.shopify_variant_id) ex = s; // linha do CSV ainda sem variante: é esta
      else if (s) l.sku = l.sku + "-" + l.shopify_variant_id; // SKU já é de outra variante
    }
    if (ex) {
      if (ex.sku && ex.sku !== l.sku && ex.sku.startsWith(l.sku + "-")) l.sku = ex.sku; // mantém o SKU com sufixo
      let { error } = await sb.from("produtos").update({ ...l, atualizado_em: new Date().toISOString() }).eq("id", ex.id);
      if (error && error.code === "23505") {
        const { sku: _s, ...semSku } = l;
        ({ error } = await sb.from("produtos").update({ ...semSku, atualizado_em: new Date().toISOString() }).eq("id", ex.id));
      }
      if (error) throw error; atualizados++;
    } else {
      let { error } = await sb.from("produtos").insert(l);
      if (error && error.code === "23505") ({ error } = await sb.from("produtos").insert({ ...l, sku: l.sku + "-" + l.shopify_variant_id }));
      if (error) throw error; novos++;
    }
  }
  return { novos, atualizados };
}

export async function marcarExcluido(sb, productId) {
  const { error } = await sb.from("produtos")
    .update({ ativo: false, site_status: "excluido", atualizado_em: new Date().toISOString() })
    .eq("shopify_product_id", gid(productId));
  if (error) throw error;
}

// Versão em lote (sincronização do catálogo): 2 consultas para achar o que já existe,
// 1 inserção em bloco para os novos e atualizações em paralelo (10 por vez).
export async function gravarProdutosLote(sb, linhas) {
  if (!linhas.length) return { novos: 0, atualizados: 0 };
  const vids = linhas.map((l) => l.shopify_variant_id);
  const skus = linhas.map((l) => l.sku).filter(Boolean);
  const porVid = new Map(), porSku = new Map();
  for (let i = 0; i < vids.length; i += 200) {
    const { data, error } = await sb.from("produtos").select("id,shopify_variant_id").in("shopify_variant_id", vids.slice(i, i + 200));
    if (error) throw error;
    for (const r of data || []) porVid.set(r.shopify_variant_id, r.id);
  }
  for (let i = 0; i < skus.length; i += 200) {
    const { data, error } = await sb.from("produtos").select("id,sku").in("sku", skus.slice(i, i + 200));
    if (error) throw error;
    for (const r of data || []) if (!porSku.has(r.sku)) porSku.set(r.sku, r.id);
  }
  const agora = new Date().toISOString();
  const novos = [], upd = [], usados = new Set(), skuNovo = new Set();
  for (let l of linhas) {
    let id = porVid.get(l.shopify_variant_id);
    if (!id && l.sku && !porVid.has(l.shopify_variant_id)) id = porSku.get(l.sku);
    if (id && usados.has(id)) id = undefined;
    // SKU repetido no Shopify (a coluna sku é única): o segundo ganha o id da variante no fim
    if (!id && l.sku && (porSku.has(l.sku) || skuNovo.has(l.sku))) l = { ...l, sku: l.sku + "-" + l.shopify_variant_id };
    if (id) { usados.add(id); upd.push([id, l]); } else { skuNovo.add(l.sku); novos.push(l); }
  }
  for (let i = 0; i < novos.length; i += 200) {
    const { error } = await sb.from("produtos").insert(novos.slice(i, i + 200));
    if (error) throw error;
  }
  for (let i = 0; i < upd.length; i += 10) {
    const rs = await Promise.all(upd.slice(i, i + 10).map(([id, l]) => sb.from("produtos").update({ ...l, atualizado_em: agora }).eq("id", id)));
    const e = rs.find((r) => r.error); if (e) throw e.error;
  }
  return { novos: novos.length, atualizados: upd.length };
}

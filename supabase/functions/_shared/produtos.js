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
export async function gravarProdutos(sb, linhas) {
  let novos = 0, atualizados = 0;
  for (const l of linhas) {
    let { data: ex } = await sb.from("produtos").select("id").eq("shopify_variant_id", l.shopify_variant_id).maybeSingle();
    if (!ex && l.sku) ({ data: ex } = await sb.from("produtos").select("id").eq("sku", l.sku).limit(1).maybeSingle());
    if (ex) {
      const { error } = await sb.from("produtos").update({ ...l, atualizado_em: new Date().toISOString() }).eq("id", ex.id);
      if (error) throw error; atualizados++;
    } else {
      const { error } = await sb.from("produtos").insert(l);
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

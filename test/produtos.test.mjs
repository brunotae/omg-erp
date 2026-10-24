import assert from "node:assert/strict";
import { produtoParaLinhas } from "../supabase/functions/_shared/produtos.js";
// webhook (REST)
const r = produtoParaLinhas({ id: 111, title: "Celimax Retinal", handle: "celimax-retinal", vendor: "Celimax", product_type: "Serum", status: "draft",
  variants: [{ id: 1, sku: "CLX-15", price: "139.00", grams: 80, title: "15ml" }, { id: 2, sku: "", price: "199.00", grams: 120, title: "30ml" }] });
assert.equal(r.length, 2);
assert.deepEqual([r[0].sku, r[0].nome, r[0].ativo, r[0].site_status, r[0].preco, r[0].peso_g, r[0].shopify_variant_id], ["CLX-15", "Celimax Retinal · 15ml", false, "draft", 139, 80, "1"]);
assert.equal(r[1].sku, "celimax-retinal-2");
// GraphQL
const g = produtoParaLinhas({ id: "gid://shopify/Product/222", title: "Medicube Pad", handle: "medicube-pad", vendor: "Medicube", productType: "Pad", status: "ACTIVE",
  variants: { nodes: [{ id: "gid://shopify/ProductVariant/9", sku: "MDC-PAD", price: "249.90", title: "Default Title", inventoryItem: { measurement: { weight: { value: 0.3, unit: "KILOGRAMS" } } } }] } });
assert.deepEqual([g[0].nome, g[0].ativo, g[0].peso_g, g[0].shopify_product_id, g[0].shopify_variant_id], ["Medicube Pad", true, 300, "222", "9"]);
console.log("produtos.js: todos os testes passaram");

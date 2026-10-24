import assert from "node:assert/strict";
import { pedidoParaVenda, dataSP } from "../supabase/functions/shopify-webhook/map.js";

// Pedido parecido com o do teste (SP, imposto no tax_lines)
const p1 = {
  id: 5550001, name: "#1001", order_number: 1001,
  processed_at: "2026-10-28T01:30:00Z", // 27/10 22:30 em SP
  email: "cliente@exemplo.com", phone: null, currency: "BRL",
  total_price_set: { shop_money: { amount: "269.82" } },
  total_discounts_set: { shop_money: { amount: "0.00" } },
  total_shipping_price_set: { shop_money: { amount: "22.00" } },
  discount_codes: [],
  tax_lines: [
    { title: "II", price: "0.00" },
    { title: "ICMS", price_set: { shop_money: { amount: "36.85" } }, price: "36.85" },
  ],
  note_attributes: [{ name: "CPF", value: "123.456.789-09" }],
  shipping_address: { name: "Maria Silva", city: "São Paulo", province_code: "SP", phone: "+5511999990000" },
  line_items: [{ sku: "MDC-PAD-01", title: "Medicube Zero Pore Pad", variant_title: "70 un", quantity: 1, price: "210.97" }],
};
const v1 = pedidoParaVenda(p1);
assert.equal(v1.data_compra, "2026-10-27");
assert.equal(v1.cpf, "123.456.789-09");
assert.equal(v1.icms, 36.85);
assert.equal(v1.ii, 0);
assert.equal(v1.frete, 22);
assert.equal(v1.uf, "SP");
assert.equal(v1.itens.length, 1);
assert.equal(v1.itens[0].produto, "MDC-PAD-01 · Medicube Zero Pore Pad · 70 un");
assert.equal(v1.ext_id, "shopify:5550001");
assert.equal(v1.pedido_site, "#1001");
assert.equal(v1.etapas.pago, "2026-10-27");
assert.match(v1.contato, /cliente@exemplo.com · \+5511999990000/);

// Tributos como linha de produto sem SKU (forma alternativa de app), CPF no campo empresa, cupom
const p2 = {
  id: 2, name: "#1002", created_at: "2026-10-27T12:00:00-03:00",
  total_discounts: "21.09", shipping_lines: [{ title: "Mile", price: "19.90" }],
  discount_codes: [{ code: "FIEL10" }],
  shipping_address: { first_name: "A", name: "Ana B", city: "Salvador", province_code: "BA", company: "98765432100" },
  line_items: [
    { sku: "CLX-01", title: "Celimax Retinal", quantity: 2, price: "120.00" },
    { sku: "", title: "Tributos de importação (II)", quantity: 1, price: "12.50" },
    { sku: null, title: "ICMS", quantity: 1, price: "40.10" },
  ],
};
const v2 = pedidoParaVenda(p2);
assert.equal(v2.cpf, "987.654.321-00");
assert.equal(v2.ii, 12.5);
assert.equal(v2.icms, 40.1);
assert.equal(v2.itens.length, 1);
assert.equal(v2.itens[0].qtd, 2);
assert.equal(v2.desconto, 21.09);
assert.equal(v2.frete, 19.9);
assert.equal(v2.cupom, "FIEL10");
assert.equal(v2.data_compra, "2026-10-27");

// Sem CPF e imposto sem tipo → vai para obs
const v3 = pedidoParaVenda({ id: 3, name: "#1003", customer: { first_name: "Zé", last_name: "Lima" }, tax_lines: [{ title: "Tributos", price: "9.99" }], line_items: [] });
assert.equal(v3.cpf, "");
assert.equal(v3.cliente, "Zé Lima");
assert.match(v3.obs, /sem tipo identificado: R\$ 9.99/);
assert.equal(dataSP("2026-10-30T02:59:00Z"), "2026-10-29");
console.log("map.js: todos os testes passaram");

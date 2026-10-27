import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buscarBase, buscarProdutos, confereDono, etapaCliente, fichaProduto, indexarBase, indexarFichas, simularImposto, nomeItem } from "../supabase/functions/bomi/busca.js";

const BASE = JSON.parse(fs.readFileSync(new URL("../supabase/functions/bomi/dados/base.json", import.meta.url)));
const FICHAS = JSON.parse(fs.readFileSync(new URL("../supabase/functions/bomi/dados/fichas.json", import.meta.url)));

test("base: acha pix e prazo", () => {
  const ib = indexarBase(BASE);
  assert.ok(buscarBase(ib, "aceita pix?").some((x) => /pix|pagamento/i.test(x.e.pergunta + x.e.categoria)));
  assert.ok(buscarBase(ib, "quanto tempo demora pra chegar").length > 0);
});

test("catálogo: busca e ficha", () => {
  const ifc = indexarFichas(FICHAS);
  const r = buscarProdutos(ifc, "protetor solar");
  assert.ok(r.length > 0 && r[0].link.startsWith("https://ohmygirl.com.br/products/"));
  const por = Object.fromEntries(FICHAS.map((f) => [f.handle, f]));
  assert.ok(fichaProduto(por, r[0].link).nome);
  assert.equal(fichaProduto(por, "nao-existe"), null);
});

test("imposto: até US$ 50 sem II; acima com II; ICMS 20% na BA", () => {
  const a = simularImposto({ valor_reais: 200, uf: "SP", frete_reais: 0 }, 5.5, "26/10/2026");
  assert.match(a.imposto_importacao, /R\$ 0,00/);
  assert.equal(a.icms, "R$ 40,96"); // 200/0.83*0.17
  const b = simularImposto({ valor_reais: 500, uf: "ba" }, 5.5, "x");
  assert.equal(b.aliquota_icms, "20%");
  assert.match(b.imposto_importacao, /R\$ 135,00/); // 300 - 165
  assert.ok(simularImposto({ valor_reais: 10, uf: "XX" }, 5.5, "x").erro);
});

test("pedido: etapa sem bastidores e conferência do dono", () => {
  assert.equal(etapaCliente({ etapas: { pago: "2026-10-30", skyroad: "2026-10-31" } }).etapa, "Compra recebida");
  assert.equal(etapaCliente({ etapas: { pago: "x", manifesto: "y" } }).etapa, "Saiu da Coreia");
  assert.equal(etapaCliente({ etapas: { entregue: "2026-11-10" } }).detalhe, "Entregue em 10/11/2026.");
  assert.equal(etapaCliente({ cancelada: true }).etapa, "Cancelado");
  for (const k of ["pago", "awb", "manifesto", "desembaraco", "lastmile"]) {
    const t = JSON.stringify(etapaCliente({ etapas: { [k]: "2026-10-30" } }));
    assert.doesNotMatch(t, /skyroad|janice|mile|awb|manifesto|la belle|corte/i);
  }
  const v = { contato: "Ana@Email.com · +55 11 90000-0000", cpf: "123.456.789-01" };
  assert.ok(confereDono(v, "ana@email.com"));
  assert.ok(confereDono(v, "901"));
  assert.ok(!confereDono(v, "outra@email.com"));
  assert.ok(!confereDono(v, ""));
  assert.equal(nomeItem("MB001 · Anua Toner"), "Anua Toner");
});

// Converte um pedido do Shopify (webhook orders/paid) numa linha da tabela "vendas".
// Puro: sem rede, sem banco. Testado em test/map.test.mjs.

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const money = (set, fallback) => num(set?.shop_money?.amount ?? fallback);
const round2 = (x) => Math.round(x * 100) / 100;

// Data do pedido no fuso de São Paulo (AAAA-MM-DD)
export function dataSP(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtDoc(d) {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

// O CPF pode vir em lugares diferentes conforme o checkout/app. Procura em todos.
export function acharCPF(o) {
  const cands = [];
  for (const a of o.note_attributes || []) {
    if (/cpf|cnpj|document|tax|fiscal/i.test(a?.name || "")) cands.push(a.value);
  }
  for (const ad of [o.shipping_address, o.billing_address]) {
    if (!ad) continue;
    cands.push(ad.company, ad.address2, ad.tax_id, ad.taxId);
  }
  cands.push(o.customer?.tax_id, o.customer?.note);
  for (const c of cands) {
    const d = String(c ?? "").replace(/\D/g, "");
    if (d.length === 11 || d.length === 14) return fmtDoc(d);
  }
  return "";
}

const ehTributo = (t) => /icms|imposto|tribut|\bII\b|import|duty|duties|tax/i.test(t || "");
const ehICMS = (t) => /icms/i.test(t || "");
const ehII = (t) => /\bII\b|importa|duty|duties/i.test(t || "");

// Soma impostos por tipo. Fontes possíveis: tax_lines do pedido, duties do Shopify Markets,
// ou uma "linha de produto" de tributos criada pelo app (ShipSmart).
export function impostos(o) {
  let ii = 0, icms = 0, outros = 0;
  const add = (titulo, valor) => {
    const v = num(valor);
    if (!v) return;
    if (ehICMS(titulo)) icms += v;
    else if (ehII(titulo)) ii += v;
    else outros += v;
  };
  for (const t of o.tax_lines || []) add(t.title, t.price_set?.shop_money?.amount ?? t.price);
  const duties = money(o.total_duties_set, 0);
  if (duties) ii += duties;
  for (const li of o.line_items || []) {
    if (!li.sku && ehTributo(li.title)) add(li.title, num(li.price) * num(li.quantity || 1));
  }
  return { ii: round2(ii), icms: round2(icms), outros: round2(outros) };
}

export function itens(o) {
  return (o.line_items || [])
    .filter((li) => !(!li.sku && ehTributo(li.title)))
    .map((li) => ({
      produto: [li.sku, [li.title, li.variant_title].filter(Boolean).join(" · ")]
        .filter(Boolean)
        .join(" · "),
      qtd: num(li.quantity) || 1,
      preco: num(li.price),
      custo_lb: null,
      custo_fab: null,
    }));
}

export function pedidoParaVenda(o) {
  const ad = o.shipping_address || o.billing_address || {};
  const nome =
    ad.name ||
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") ||
    o.email ||
    "Cliente do site";
  const frete = o.total_shipping_price_set
    ? money(o.total_shipping_price_set)
    : (o.shipping_lines || []).reduce((s, l) => s + num(l.price), 0);
  const imp = impostos(o);
  const dia = dataSP(o.processed_at || o.created_at);
  const obs = [
    "Importado do Shopify " + (o.name || ""),
    imp.outros ? "Imposto sem tipo identificado: R$ " + imp.outros.toFixed(2) : "",
    o.note ? "Nota do cliente: " + o.note : "",
  ].filter(Boolean).join(" · ");

  return {
    data_compra: dia,
    canal: "Site",
    cliente: nome,
    cpf: acharCPF(o),
    contato: [o.email || o.contact_email, o.phone || ad.phone].filter(Boolean).join(" · "),
    cidade: ad.city || "",
    uf: ad.province_code || "",
    cupom: (o.discount_codes || []).map((d) => d.code).join(", "),
    itens: itens(o),
    desconto: round2(money(o.total_discounts_set, o.total_discounts)),
    frete: round2(frete),
    ii: imp.ii,
    icms: imp.icms,
    etapas: { pago: dia },
    origem: "shopify",
    obs,
    ext_id: "shopify:" + o.id,
    pedido_site: o.name || String(o.order_number || ""),
    dados_site: {
      total: money(o.total_price_set, o.total_price),
      moeda: o.currency,
      tax_lines: o.tax_lines || [],
      total_duties: o.total_duties_set || null,
      shipping_lines: (o.shipping_lines || []).map((l) => ({ title: l.title, price: l.price })),
      note_attributes: o.note_attributes || [],
      linhas: (o.line_items || []).map((l) => ({ sku: l.sku, title: l.title, qtd: l.quantity, price: l.price })),
    },
  };
}

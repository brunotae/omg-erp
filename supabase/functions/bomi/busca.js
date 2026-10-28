// Busca da Bomi: entradas da base de conhecimento e produtos do catálogo, imposto estimado e etapa do pedido.
// Sem dependências: roda no Supabase (Deno) e nos testes (node --test).

export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PARE = new Set("a o e de da do das dos em no na nos nas um uma uns umas para pra pro por com sem que qual quais como meu minha meus minhas seu sua vc voce voces vcs eu me te se ja nao sim oi ola oii gente ai la ta isso esse essa este esta tem ter sao the and to is of for it".split(" "));
export const toks = (s) => norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !PARE.has(w));

// ---------- base de conhecimento ----------
export function indexarBase(entradas) {
  return entradas.map((e) => ({
    e,
    gat: [e.pergunta, ...(e.gatilhos || [])].map((g) => new Set(toks(g))),
    todos: new Set(toks([e.pergunta, e.categoria, ...(e.gatilhos || [])].join(" "))),
    frases: (e.gatilhos || []).filter((g) => g.length > 5).map(norm),
  }));
}

export function buscarBase(indice, texto, anterior = "", max = 7) {
  const q = toks(texto), q2 = toks(anterior);
  if (!q.length && !q2.length) return [];
  const nq = norm(texto);
  return indice.map((b) => {
    let melhor = 0;
    for (const g of b.gat) {
      if (!g.size) continue;
      let hit = 0; for (const w of q) if (g.has(w)) hit++;
      melhor = Math.max(melhor, hit / Math.sqrt(g.size * Math.max(q.length, 1)));
    }
    let extra = 0;
    for (const w of q) if (b.todos.has(w)) extra += 0.15;
    for (const w of q2) if (b.todos.has(w)) extra += 0.05;
    if (b.frases.some((g) => nq.includes(g))) extra += 1;
    return { e: b.e, s: melhor + extra };
  }).filter((x) => x.s > 0.2).sort((a, b) => b.s - a.s).slice(0, max);
}

// ---------- catálogo ----------
const limpaTags = (t) => String(t || "").replace(/[a-z]+:/gi, " ").replace(/-/g, " ");
export function indexarFichas(fichas) {
  return fichas.map((f) => ({
    f,
    forte: new Set(toks(f.marca + " " + f.nome + " " + f.tipo)),
    meio: new Set(toks(limpaTags(f.tags) + " " + (f.secoes?.["Indicado para"] || ""))),
    fraco: new Set(toks((f.secoes?.["Benefícios"] || "") + " " + (f.secoes?.["Ingredientes"] || "").slice(0, 300))),
  }));
}
const LOJA = "https://ohmygirl.com.br/products/";
export function buscarProdutos(indice, texto, ativos = null, max = 6) {
  const q = toks(texto);
  const pref = (set, w) => { for (const x of set) if (x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x))) return true; return false; };
  return indice
    .filter((p) => !ativos || ativos.has(p.f.handle))
    .map((p) => {
      let s = 0;
      for (const w of q) { if (p.forte.has(w)) s += 2; else if (p.meio.has(w)) s += 1.2; else if (pref(p.forte, w)) s += 1; else if (p.fraco.has(w)) s += 0.4; }
      return { p, s };
    })
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max)
    .map(({ p: { f } }) => ({
      handle: f.handle, nome: f.nome, marca: f.marca,
      preco: f.preco + (f.preco_max ? " a " + f.preco_max : ""), link: LOJA + f.handle,
      indicado_para: f.secoes?.["Indicado para"] || "", resumo: (f.secoes?.["Descrição"] || "").slice(0, 260),
    }));
}
export function fichaProduto(porHandle, handle) {
  const h = String(handle || "").replace(/^.*\/products\//, "").replace(/[?#].*$/, "").trim();
  const f = porHandle[h];
  if (!f) return null;
  return { nome: f.nome, marca: f.marca, preco: f.preco + (f.preco_max ? " a " + f.preco_max : ""), link: LOJA + f.handle, ...f.secoes };
}

// ---------- imposto (Remessa Conforme) ----------
const ICMS20 = ["AC", "AL", "BA", "CE", "PB", "PI", "RN", "RR", "SE"];
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export const brl = (v) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function simularImposto({ valor_reais, uf, frete_reais }, cambio, dataCambio) {
  const v = Number(String(valor_reais).replace(",", ".")), fr = Number(String(frete_reais ?? 0).replace(",", ".")) || 0;
  const u = String(uf || "").toUpperCase().trim();
  if (!(v > 0)) return { erro: "informe o valor dos produtos em reais" };
  if (!UFS.includes(u)) return { erro: "informe a sigla do estado (ex.: SP, BA)" };
  const c = cambio, base = v + fr, usd = base / c, aliq = ICMS20.includes(u) ? 0.20 : 0.17;
  const ii = usd <= 50 ? 0 : Math.max(0, 0.60 * base - 30 * c);
  const icms = (base + ii) / (1 - aliq) * aliq;
  return {
    estimativa: true,
    cambio_usado: "R$ " + c.toFixed(4).replace(".", ",") + " por US$ (PTAX de venda de " + dataCambio + ")",
    uf: u, aliquota_icms: Math.round(aliq * 100) + "%",
    base_produtos_mais_frete: brl(base), em_dolar: "US$ " + usd.toFixed(2).replace(".", ","),
    imposto_importacao: brl(ii) + (usd <= 50 ? " (até US$ 50 é zero)" : " (60% menos US$ 30)"),
    icms: brl(icms), total_impostos: brl(ii + icms), total_estimado: brl(base + ii + icms), frete_incluido: fr > 0,
  };
}

// ---------- pedido: etapa que a cliente pode ver (sem bastidores) ----------
const ORDEM = ["pago", "docs", "skyroad", "separado", "embalado", "consolidado", "awb", "rfkr", "embarcado", "manifesto", "desembaraco", "lastmile", "entregue"];
// Etapas que a cliente vê (6). Nada de Skyroad, corte, AWB ou "enviado para a Coreia":
// o pedido sai do nosso estoque oficial na Coreia do Sul.
export const ETAPAS_CLIENTE = [
  { id: "confirmada", titulo: "Compra confirmada", chaves: ["pago"], detalhe: "Pagamento aprovado e impostos já recolhidos no checkout." },
  { id: "separacao", titulo: "Em separação no nosso estoque na Coreia", chaves: ["docs", "skyroad", "separado", "embalado", "consolidado", "awb", "rfkr"], detalhe: "Seu pedido está sendo separado, embalado e preparado para o voo." },
  { id: "enviado", titulo: "Pedido enviado: a caminho do Brasil", chaves: ["embarcado", "manifesto"], detalhe: "Em voo para o Brasil. Durante o voo e a liberação o status pode ficar alguns dias sem mudar." },
  { id: "brasil", titulo: "Chegou ao Brasil: liberação na Receita", chaves: ["desembaraco"], detalhe: "Em liberação pela Receita Federal (Remessa Conforme). O imposto já foi pago no checkout." },
  { id: "entrega", titulo: "Saiu para entrega", chaves: ["lastmile"], detalhe: "Com a transportadora para entrega no seu endereço." },
  { id: "entregue", titulo: "Entregue", chaves: ["entregue"], detalhe: "Pedido entregue. Aproveite! 💗" },
];
const fdata = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
export function linhaDoTempo(v) {
  const e = v.etapas || {};
  let atual = -1;
  ETAPAS_CLIENTE.forEach((s, i) => { if (s.chaves.some((k) => e[k])) atual = i; });
  return ETAPAS_CLIENTE.map((s, i) => {
    const datas = s.chaves.map((k) => e[k]).filter(Boolean).map(String).sort();
    return { titulo: s.titulo, feito: i <= atual, atual: i === atual, data: fdata(datas[0]) };
  });
}
export function etapaCliente(v) {
  if (v.cancelada) return { etapa: "Cancelado", detalhe: "Este pedido foi cancelado." };
  const e = v.etapas || {};
  let atual = -1;
  ETAPAS_CLIENTE.forEach((s, i) => { if (s.chaves.some((k) => e[k])) atual = i; });
  if (atual < 0) return { etapa: "Compra recebida", detalhe: "Pedido registrado; aguardando a confirmação do pagamento." };
  const s = ETAPAS_CLIENTE[atual];
  const det = s.id === "entregue" ? "Entregue em " + fdata(e.entregue) + "." : s.id === "confirmada" || s.id === "separacao" ? s.detalhe + " (Ainda dá para cancelar sem custo.)" : s.detalhe;
  return { etapa: s.titulo, detalhe: det };
}

export function confereDono(v, emailOuCpf) {
  const x = norm(emailOuCpf).replace(/\s/g, "");
  if (!x) return false;
  if (x.includes("@")) return norm(v.contato).replace(/\s/g, "").split(/[·,;]/).some((c) => c === x);
  const d = x.replace(/\D/g, "").slice(-3);
  return d.length === 3 && String(v.cpf || "").replace(/\D/g, "").slice(-3) === d;
}

export const nomeItem = (p) => String(p || "").replace(/^[^·]*·\s*/, "").trim() || String(p || "");

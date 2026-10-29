// Bomi (봄이) · assistente virtual da OMG no chat do site (e, em novembro, no WhatsApp).
// Pública (sem login): o widget do site manda { sessao, texto, pagina } e recebe { mensagens: [..] }.
//   { sessao, nota: "bom"|"ruim" }  → guarda a avaliação da cliente.
// Segredos: ANTHROPIC_API_KEY (obrigatório) e, opcionais, BOMI_MODELO (padrão claude-sonnet-5-5) e BOMI_SAL.
// Conteúdo (prompt, base, fichas): supabase/functions/bomi/dados/, gerado por bomi/publicar_dados.py.
import { createClient } from "npm:@supabase/supabase-js@2";
import PROMPT from "./dados/prompt.json" with { type: "json" };
import BASE from "./dados/base.json" with { type: "json" };
import FICHAS from "./dados/fichas.json" with { type: "json" };
import {
  buscarBase, buscarProdutos, confereDono, etapaCliente, linhaDoTempo, fichaProduto, indexarBase, indexarFichas, nomeItem, simularImposto,
} from "./busca.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CHAVE = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELO = Deno.env.get("BOMI_MODELO") ?? "claude-sonnet-5-5";
const SAL = Deno.env.get("BOMI_SAL") ?? "omg-bomi";

// Limites contra abuso (a chave da Anthropic também tem limite mensal de gasto)
const MAX_TEXTO = 800;          // caracteres por mensagem da cliente
const MAX_TURNOS = 40;          // mensagens da cliente por conversa
const MAX_CONVERSAS_IP = 8;     // conversas novas por hora, por internet (IP)
const HIST = 16;                // últimas mensagens que vão para o modelo

const IDX_BASE = indexarBase(BASE as any[]);
let IDX_FICHAS = indexarFichas(FICHAS as any[]);
let POR_HANDLE: Record<string, any> = Object.fromEntries((FICHAS as any[]).map((f) => [f.handle, f]));
// Fichas de marcas publicadas pelo ERP (botão "Publicar marca"): tabela bomi_fichas_extra, recarregada a cada 10 min.
let extrasEm = 0;
async function carregarExtras() {
  if (Date.now() - extrasEm < 600_000) return;
  extrasEm = Date.now();
  try {
    const { data, error } = await sb.from("bomi_fichas_extra").select("ficha").limit(5000);
    if (error || !data?.length) return;
    const todas: Record<string, any> = Object.fromEntries((FICHAS as any[]).map((f) => [f.handle, f]));
    for (const r of data) if (r.ficha?.handle) todas[r.ficha.handle] = r.ficha;
    const lista = Object.values(todas);
    IDX_FICHAS = indexarFichas(lista); POR_HANDLE = todas;
  } catch (_) { /* fica com as fichas fixas */ }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// ---------- hora de Brasília ----------
function agoraBR() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}
function horarioComercial() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  return !["Sat", "Sun"].includes(p.weekday) && h >= 9 && h < 18;
}
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD

// ---------- PTAX (dólar de venda do dia útil anterior, Banco Central) ----------
let ptax = { valor: 0, data: "", em: 0 };
async function cambio(): Promise<{ valor: number; data: string }> {
  if (ptax.valor && Date.now() - ptax.em < 3600_000) return ptax;
  const hoje = hojeSP();
  const ini = new Date(Date.parse(hoje) - 10 * 86400_000).toISOString().slice(0, 10);
  const mdY = (d: string) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;
  try {
    const u = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
      `?@dataInicial='${mdY(ini)}'&@dataFinalCotacao='${mdY(hoje)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
    const j = await (await fetch(u)).json();
    const ant = (j.value || []).filter((x: any) => String(x.dataHoraCotacao).slice(0, 10) < hoje);
    const u1 = ant[ant.length - 1];
    if (u1?.cotacaoVenda) {
      ptax = { valor: Number(u1.cotacaoVenda), data: String(u1.dataHoraCotacao).slice(0, 10).split("-").reverse().join("/"), em: Date.now() };
      return ptax;
    }
  } catch (e) { console.error("ptax", e); }
  return ptax.valor ? ptax : { valor: 5.5, data: "referência aproximada (Banco Central fora do ar)" };
}

// ---------- avisos do momento (tela "Avisos da Bomi" no ERP) ----------
async function avisos() {
  const hoje = hojeSP();
  const { data } = await sb.from("avisos_bomi").select("texto,inicio,fim").eq("ativo", true);
  const v = (data || []).filter((a: any) => (!a.inicio || a.inicio <= hoje) && (!a.fim || a.fim >= hoje)).map((a: any) => "- " + a.texto);
  return v.length ? v.join("\n") : "(nenhum aviso no momento)";
}

// ---------- ferramentas ----------
const FERRAMENTAS = [
  { name: "consultar_pedido", description: "Consulta status, etapa e rastreio de um pedido da OMG. Exige o número do pedido E o e-mail da compra ou os 3 últimos dígitos do CPF. Retorna {encontrado, etapa, detalhe, rastreio, itens} ou {encontrado:false}.",
    input_schema: { type: "object", properties: { numero_pedido: { type: "string" }, email_ou_cpf_final: { type: "string", description: "e-mail da compra ou os 3 últimos dígitos do CPF" } }, required: ["numero_pedido", "email_ou_cpf_final"] } },
  { name: "buscar_produto", description: "Procura produtos no catálogo do site da OMG por nome, marca, tipo, necessidade ou tipo de pele (ex.: 'tônico pele oleosa', 'Anua', 'protetor solar', 'manchas'). Retorna até 6 itens {handle, nome, marca, preco, link, indicado_para, resumo}. Para detalhes de um item, use ver_produto com o handle.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
  { name: "ver_produto", description: "Abre a ficha completa de um produto pelo handle (vindo de buscar_produto): descrição, benefícios, indicado para, como usar, ingredientes e o que vem no kit, com preço e link.",
    input_schema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
  { name: "simular_imposto", description: "Estima o Imposto de Importação e o ICMS de uma compra pelo Remessa Conforme, com a PTAX de venda do dia útil anterior. Entrada: valor dos produtos em reais, UF de entrega (sigla) e frete em reais (0 se a cliente não souber). É estimativa: o checkout mostra o valor exato.",
    input_schema: { type: "object", properties: { valor_reais: { type: "number" }, uf: { type: "string" }, frete_reais: { type: "number" } }, required: ["valor_reais", "uf"] } },
  { name: "transferir_humano", description: "Passa a conversa para a equipe humana da OMG. Use nos casos da seção 6. O resumo deve ter nome, número do pedido (se houver), o que a cliente quer, o que já foi respondido e o tom. Inclua em 'contato' o e-mail ou WhatsApp que a cliente informou para a equipe responder (no chat do site, peça antes de transferir). Retorna se é horário comercial agora.",
    input_schema: { type: "object", properties: { motivo: { type: "string" }, resumo: { type: "string" }, contato: { type: "string" } }, required: ["motivo", "resumo"] } },
  { name: "registrar_feedback", description: "Registra elogio, reclamação, sugestão de produto, pedido de reposição ou demora. Não substitui transferir_humano quando ela é necessária.",
    input_schema: { type: "object", properties: { tipo: { type: "string" }, texto: { type: "string" } }, required: ["tipo", "texto"] } },
];

async function executar(nome: string, inp: any, conversaId: string) {
  if (nome === "consultar_pedido") {
    const n = String(inp.numero_pedido || "").replace(/\D/g, "");
    if (!n) return { encontrado: false, motivo: "número do pedido vazio" };
    const { data } = await sb.from("vendas").select("pedido_site,numero,cliente,cpf,contato,etapas,cancelada,rastreio,itens,data_compra")
      .in("pedido_site", ["#" + n, n]).limit(3);
    const v = (data || []).find((x: any) => confereDono(x, inp.email_ou_cpf_final));
    if (!v) return { encontrado: false, motivo: "número e e-mail/CPF não conferem com nenhum pedido" };
    const et = etapaCliente(v);
    return { encontrado: true, numero: v.pedido_site, nome: String(v.cliente || "").split(" ")[0], ...et,
      rastreio: v.rastreio || "ainda sem código (sai quando o pedido for para a transportadora no Brasil)",
      data_compra: String(v.data_compra || "").split("-").reverse().join("/"),
      itens: (v.itens || []).map((i: any) => (i.qtd > 1 ? i.qtd + "× " : "") + nomeItem(i.produto)) };
  }
  if (nome === "buscar_produto" || nome === "ver_produto") await carregarExtras();
  if (nome === "buscar_produto") {
    const r = buscarProdutos(IDX_FICHAS, inp.texto);
    return r.length ? r : { resultados: 0, aviso: "nada encontrado no catálogo" };
  }
  if (nome === "ver_produto") return fichaProduto(POR_HANDLE, inp.handle) ?? { erro: "produto não encontrado; use buscar_produto primeiro" };
  if (nome === "simular_imposto") { const c = await cambio(); return simularImposto(inp, c.valor, c.data); }
  if (nome === "transferir_humano") {
    await sb.from("bomi_atendimentos").insert({ conversa_id: conversaId, tipo: "transferencia", motivo: String(inp.motivo || "").slice(0, 300), resumo: String(inp.resumo || "").slice(0, 3000), contato: String(inp.contato || "").slice(0, 200) });
    await sb.from("bomi_conversas").update({ transferida: true }).eq("id", conversaId);
    return { ok: true, horario_comercial_agora: horarioComercial() };
  }
  if (nome === "registrar_feedback") {
    await sb.from("bomi_atendimentos").insert({ conversa_id: conversaId, tipo: "feedback", motivo: String(inp.tipo || "").slice(0, 100), resumo: String(inp.texto || "").slice(0, 3000), status: "resolvido" });
    return { ok: true };
  }
  return { erro: "ferramenta desconhecida" };
}

// ---------- prompt ----------
// Parte fixa (vai para o cache da Anthropic) + parte que muda a cada mensagem (hora, base relevante, avisos).
const FIXO = (PROMPT as any).texto
  .replace("Data e hora agora (Brasília): {agora}", "Data e hora agora (Brasília): veja <contexto> no fim destas instruções.")
  .replace("{base_conhecimento}", "(as entradas relevantes para a mensagem atual estão em <contexto>)")
  .replace("{avisos}", "(os avisos ativos estão em <contexto>)") +
  "\n\n## Canal desta conversa\nChat do site ohmygirl.com.br. A cliente pode estar navegando um produto; a página aparece em <contexto>. " +
  "Responda SOMENTE com a mensagem da Bomi para a cliente, sem prefixo como 'Bomi:'. Escreva UMA mensagem curta (até ~30 palavras). " +
  "Não narre que vai usar ferramentas. Links de produto: escreva a URL completa. " +
  "No chat do site a equipe não consegue responder por aqui depois: antes de transferir_humano, peça um e-mail ou WhatsApp para a equipe retornar, e passe em 'contato'.";

function contexto(entradas: any[], av: string, pagina: string) {
  const base = entradas.map(({ e }) => ({ id: e.id, pergunta: e.pergunta, status: e.status, escalar_humano: e.escalar_humano, resposta_chat: e.resposta_chat, resposta_chat_alt: e.resposta_chat_alt, quando_escalar: e.quando_escalar, notas_internas: e.notas_internas, links: e.links }));
  return `<contexto>\nData e hora agora (Brasília): ${agoraBR()} (${horarioComercial() ? "horário comercial" : "fora do horário comercial"})\n` +
    (pagina ? `Página em que a cliente está: ${pagina}\n` : "") +
    `\n<base_conhecimento>\n${JSON.stringify(base, null, 1)}\n</base_conhecimento>\n\n<avisos>\n${av}\n</avisos>\n</contexto>`;
}

async function claude(system: any[], messages: any[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": CHAVE, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELO, max_tokens: 600, system, tools: FERRAMENTAS, messages }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Anthropic " + r.status + ": " + JSON.stringify(j.error ?? j).slice(0, 300));
  return j;
}

async function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SAL + ip));
  return Array.from(new Uint8Array(d)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TENT = new Map<string, number[]>();
const DESCULPA = "Ops, tive um probleminha aqui 😕 Pode tentar de novo? Se preferir, fale com a equipe: WhatsApp +55 11 99304-9122 ou info.br@ohmygirl.com.br.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  let b: any;
  try { b = await req.json(); } catch { return resp(400, { erro: "pedido inválido" }); }

  // Página "Acompanhe seu pedido": número do pedido + e-mail (ou 3 últimos dígitos do CPF)
  if (b.acao === "rastreio") {
    const ih = await ipHash(req);
    const agora = Date.now(); const t = TENT.get(ih) || []; const rec = t.filter((x) => agora - x < 600_000);
    if (rec.length >= 20) return resp(429, { erro: "Muitas consultas seguidas. Tente de novo em alguns minutos." });
    rec.push(agora); TENT.set(ih, rec);
    const n = String(b.pedido || "").replace(/\D/g, "");
    if (!n) return resp(400, { erro: "Informe o número do pedido." });
    const { data } = await sb.from("vendas").select("pedido_site,numero,cliente,cpf,contato,etapas,cancelada,rastreio,itens,data_compra")
      .or(`pedido_site.eq.#${n},pedido_site.eq.${n}` + (n.length >= 9 ? `,numero.eq.${n}` : "")).limit(3);
    const v = (data || []).find((x: any) => confereDono(x, b.email_ou_cpf));
    if (!v) return resp(404, { erro: "Não encontramos um pedido com esse número e esse e-mail (ou final do CPF). Confira os dados do e-mail de confirmação." });
    return resp(200, { ok: true, numero: v.pedido_site || String(v.numero), nome: String(v.cliente || "").split(" ")[0],
      ...etapaCliente(v), cancelado: !!v.cancelada, linha: v.cancelada ? [] : linhaDoTempo(v), rastreio: v.rastreio || "",
      data_compra: String(v.data_compra || "").split("-").reverse().join("/"),
      itens: (v.itens || []).map((i: any) => (i.qtd > 1 ? i.qtd + "× " : "") + nomeItem(i.produto)) });
  }

  const sessao = String(b.sessao || "").replace(/[^\w-]/g, "").slice(0, 64);
  if (sessao.length < 16) return resp(400, { erro: "sessão inválida" });

  // avaliação 👍/👎
  if (b.nota) {
    await sb.from("bomi_conversas").update({ nota: String(b.nota).slice(0, 300) }).eq("canal", "site").eq("sessao", sessao);
    return resp(200, { ok: true });
  }

  const texto = String(b.texto || "").trim().slice(0, MAX_TEXTO);
  if (!texto) return resp(400, { erro: "mensagem vazia" });
  if (!CHAVE) return resp(503, { mensagens: [DESCULPA] });
  const pagina = String(b.pagina || "").slice(0, 300);

  // conversa (cria na primeira mensagem)
  let { data: conv } = await sb.from("bomi_conversas").select("*").eq("canal", "site").eq("sessao", sessao).maybeSingle();
  if (!conv) {
    const ih = await ipHash(req);
    const { count } = await sb.from("bomi_conversas").select("id", { count: "exact", head: true })
      .eq("ip_hash", ih).gte("criado_em", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= MAX_CONVERSAS_IP) return resp(429, { mensagens: ["Muitas conversas seguidas daqui 😅 Tente de novo daqui a pouco ou fale com a equipe: info.br@ohmygirl.com.br."] });
    const ins = await sb.from("bomi_conversas").insert({ canal: "site", sessao, ip_hash: ih, pagina }).select("*").single();
    if (ins.error) return resp(500, { mensagens: [DESCULPA] });
    conv = ins.data;
  }
  if (conv.turnos >= MAX_TURNOS) return resp(429, { mensagens: ["Nossa conversa ficou longa! 😊 Para continuar, fale com a equipe: WhatsApp +55 11 99304-9122 ou info.br@ohmygirl.com.br."] });

  const msgs: any[] = conv.mensagens || [];
  const anterior = [...msgs].reverse().find((m) => m.papel === "cliente")?.texto || "";
  const agora = new Date().toISOString();
  msgs.push({ papel: "cliente", texto, em: agora });

  // histórico para o modelo (só textos; começa sempre pela cliente)
  const hist = msgs.filter((m) => m.papel === "cliente" || m.papel === "bomi").slice(-HIST)
    .map((m) => ({ role: m.papel === "cliente" ? "user" : "assistant", content: m.texto }));
  while (hist.length && hist[0].role !== "user") hist.shift();

  const [entradas, av] = [buscarBase(IDX_BASE, texto, anterior), await avisos()];
  const system = [
    { type: "text", text: FIXO, cache_control: { type: "ephemeral" } },
    { type: "text", text: contexto(entradas, av, pagina) },
  ];

  const usadas: any[] = conv.ferramentas || [];
  let tin = 0, tout = 0, resposta = "";
  try {
    const messages: any[] = hist;
    for (let volta = 0; volta < 6; volta++) {
      const r = await claude(system, messages);
      tin += (r.usage?.input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0) + (r.usage?.cache_creation_input_tokens ?? 0);
      tout += r.usage?.output_tokens ?? 0;
      const usos = (r.content || []).filter((c: any) => c.type === "tool_use");
      resposta = (r.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
      if (r.stop_reason !== "tool_use" || !usos.length) break;
      messages.push({ role: "assistant", content: r.content });
      const resultados = [];
      for (const u of usos) {
        let out: unknown;
        try { out = await executar(u.name, u.input, conv.id); } catch (e) { out = { erro: String((e as Error).message || e).slice(0, 200) }; }
        usadas.push({ em: new Date().toISOString(), turno: conv.turnos + 1, nome: u.name, entrada: u.input, saida: JSON.stringify(out).slice(0, 1500) });
        if (u.name === "transferir_humano") msgs.push({ papel: "evento", texto: "transferida para a equipe: " + (u.input?.motivo || ""), em: new Date().toISOString() });
        resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: resultados });
    }
  } catch (e) {
    console.error("bomi", e);
  }
  resposta = resposta.replace(/^\s*Bomi:\s*/i, "").trim();
  const ok = !!resposta;
  if (!ok) resposta = DESCULPA;
  msgs.push({ papel: "bomi", texto: resposta, em: new Date().toISOString(), ...(ok ? {} : { falha: true }) });

  const { data: atual } = await sb.from("bomi_conversas").select("transferida").eq("id", conv.id).single();
  await sb.from("bomi_conversas").update({
    mensagens: msgs, ferramentas: usadas.slice(-200), turnos: conv.turnos + 1,
    tokens_in: conv.tokens_in + tin, tokens_out: conv.tokens_out + tout, atualizado_em: new Date().toISOString(),
  }).eq("id", conv.id);

  const partes = resposta.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return resp(200, { mensagens: partes, transferida: !!atual?.transferida });
});

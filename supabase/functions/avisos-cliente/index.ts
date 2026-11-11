// Avisos à cliente por e-mail (OMG): complementa os e-mails do Shopify.
//   Aviso "Estamos separando seus produtos" → disparo MANUAL pelo ERP (Tae · 09/11/2026), para vendas que ainda não foram embaladas
//   Aviso 2 · "Preparado na Coreia"            → quando a venda tem a etapa "embalado"
//   Aviso 4 · "Chegou ao Brasil e foi liberado" → quando a venda tem a etapa "desembaraco"
// Os avisos 1 (pedido confirmado), 3 (saiu da Coreia), 5 (saiu para entrega) e 6 (entregue) continuam com o Shopify.
// Chamado pelo ERP (só membros). Nunca manda o mesmo aviso duas vezes (tabela avisos_cliente).
//   POST { ids: [venda ids] }           → manda o que estiver pendente dessas vendas (avisos automáticos)
//   POST { pendentes: true }            → confere todas as vendas abertas (botão "Enviar pendentes")
//   POST { manual: "separando", previa?: true, ids?: [...] } → "Estamos separando": vendas do site, não canceladas,
//        ainda sem "embalado" e que não receberam este aviso. previa: só lista quem receberia, não manda.
//   POST { teste: "separando"|"preparado"|"liberado" } → manda um exemplo para o e-mail de quem clicou
// Config: config.avisos = { ativo: true|false, de: "OMG! oh my girl <pedidos@...>", responder: "...", whatsapp: "...", copia: "e-mail em cópia oculta" }
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const PAG = "https://ohmygirl.com.br/pages/acompanhe-seu-pedido";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const resp = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// tipo → etapa que dispara, etapas que tornam o aviso atrasado demais (aí só registra "pulado")
const TIPOS: Record<string, { etapa: string; depois: string[]; titulo: string }> = {
  preparado: { etapa: "embalado", depois: ["embarcado", "manifesto", "desembaraco", "lastmile", "entregue"], titulo: "Preparado na Coreia" },
  liberado: { etapa: "desembaraco", depois: ["lastmile", "entregue"], titulo: "Chegou ao Brasil e foi liberado" },
};
// avisos manuais: só saem quando alguém dispara no ERP; não saem se a venda já passou destas etapas
const MANUAIS: Record<string, { depois: string[]; titulo: string }> = {
  separando: { depois: ["embalado", "embarcado", "manifesto", "desembaraco", "lastmile", "entregue"], titulo: "Estamos separando seus produtos" },
};

function texto(tipo: string, nome: string, pedido: string, cfg: any) {
  const primeiro = String(nome || "").trim().split(/\s+/)[0] || "";
  const ola = primeiro ? `Olá, ${esc(primeiro)}!` : "Olá!";
  const wa = cfg.whatsapp ? `<p style="margin:14px 0 0;font-size:13px;color:#7A6A70">Dúvidas? Fale com a gente no WhatsApp ${esc(cfg.whatsapp)}.</p>` : "";
  const corpos: Record<string, { assunto: string; h: string; p: string[] }> = {
    separando: { assunto: `Pedido ${pedido}: estamos separando seus produtos`, h: "Estamos separando seus produtos",
      p: [`Obrigada pela sua compra! Seu pedido já está com a nossa equipe na Coreia do Sul.`,
          `Agora estamos separando e conferindo cada produto, um por um, para garantir que tudo chegue original e certinho até você.`,
          `Quando o pedido for embalado, mandamos outro e-mail. E quando ele embarcar para o Brasil, você recebe o código de rastreio.`] },
    preparado: { assunto: `Pedido ${pedido}: preparado na Coreia`, h: "Seu pedido foi preparado na Coreia",
      p: [`Seus produtos foram separados, conferidos e embalados na Coreia do Sul.`,
          `O próximo passo é o voo para o Brasil. Quando o pedido embarcar, você recebe outro e-mail com o código de rastreio.`] },
    liberado: { assunto: `Pedido ${pedido}: chegou ao Brasil e foi liberado`, h: "Seu pedido chegou ao Brasil",
      p: [`Seu pedido chegou ao Brasil e já foi liberado pela Receita Federal.`,
          `Os impostos foram pagos na compra, então não há nada a pagar na entrega.`,
          `Agora ele segue com a transportadora até você. Avisamos quando sair para entrega.`] },
  };
  const corpo = corpos[tipo] || corpos.preparado;
  const html = `<!doctype html><html><body style="margin:0;background:#FFF5F8;font-family:Helvetica,Arial,sans-serif;color:#3A1E2B">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px">
<tr><td style="font-size:24px;font-weight:800;color:#B83D66;padding-bottom:4px">OMG! <span style="font-size:13px;font-weight:600;color:#C98AA2">oh my girl</span></td></tr>
<tr><td style="padding-top:14px;font-size:20px;font-weight:700">${esc(corpo.h)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.55">
<p style="margin:0 0 10px">${ola}</p>${corpo.p.map((x) => `<p style="margin:0 0 10px">${esc(x)}</p>`).join("")}
<p style="margin:0;color:#7A6A70;font-size:13px">Pedido ${esc(pedido)}</p></td></tr>
<tr><td style="padding-top:20px"><a href="${PAG}" style="display:inline-block;background:#B83D66;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;font-size:14px">Acompanhe seu pedido</a>${wa}</td></tr>
</table></td></tr></table></body></html>`;
  return { assunto: corpo.assunto, html, txt: [ola, ...corpo.p, `Pedido ${pedido}`, `Acompanhe: ${PAG}`].join("\n\n") };
}

async function mandar(para: string, t: { assunto: string; html: string; txt: string }, cfg: any) {
  if (!RESEND) throw new Error("sem RESEND_API_KEY");
  const body: any = { from: cfg.de || "OMG! oh my girl <pedidos@mintess.com>", to: [para], subject: t.assunto, html: t.html, text: t.txt };
  if (cfg.responder) body.reply_to = cfg.responder;
  if (cfg.copia) body.bcc = (Array.isArray(cfg.copia) ? cfg.copia : [cfg.copia]).map(String); // cópia oculta (config.avisos.copia)
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + RESEND, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Resend " + r.status + ": " + JSON.stringify(j).slice(0, 200));
  return String(j.id || "");
}

async function quem(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return null;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase(); if (!email) return null;
  const { data: m } = await admin.from("membros").select("papel").eq("email", email).maybeSingle();
  return m ? { email, editor: m.papel === "editor" } : null;
}
const emailDe = (s: string) => (String(s || "").match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/) || [])[0] || "";

// manda um aviso para uma venda (reserva antes para nunca duplicar)
async function enviarUm(v: any, tipo: string, cfg: any, resultados: any[]) {
  const pedido = v.pedido_site || "#" + v.numero;
  const para = emailDe(v.contato);
  const base = { venda: v.id, numero: v.numero, tipo, canal: "email", para };
  const t = texto(tipo, v.cliente, pedido, cfg);
  const { data: res, error: re } = await admin.from("avisos_cliente").insert({ ...base, status: "enviando", assunto: t.assunto }).select("id").single();
  if (re) { if (/duplicate|unique/i.test(re.message)) return; throw re; }
  try {
    const id = await mandar(para, t, cfg);
    await admin.from("avisos_cliente").update({ status: "enviado", resend_id: id, enviado_em: new Date().toISOString() }).eq("id", res.id);
    resultados.push({ numero: v.numero, tipo, status: "enviado", para });
  } catch (er) {
    await admin.from("avisos_cliente").update({ status: "erro", info: String((er as Error).message || er).slice(0, 300) }).eq("id", res.id);
    resultados.push({ numero: v.numero, tipo, status: "erro", info: String((er as Error).message || er).slice(0, 120) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  try {
    const u = await quem(req);
    if (!u) return resp(403, { erro: "Só membros do ERP" });
    let b: any = {}; try { b = await req.json(); } catch { /* vazio */ }
    const { data: c } = await admin.from("config").select("valor").eq("chave", "avisos").maybeSingle();
    const cfg: any = c?.valor || {};

    if (b.teste) {
      const tipo = TIPOS[b.teste] || MANUAIS[b.teste] ? b.teste : "preparado";
      const id = await mandar(u.email, texto(tipo, "Teste", "#1000", cfg), cfg);
      return resp(200, { ok: true, teste: tipo, para: u.email, id });
    }
    if (!u.editor) return resp(403, { erro: "Só editores mandam avisos" });

    // ---- disparo manual ("Estamos separando seus produtos") ----
    if (b.manual) {
      const tipo = String(b.manual); const M = MANUAIS[tipo];
      if (!M) return resp(400, { erro: "aviso manual desconhecido" });
      let q = admin.from("vendas").select("id,numero,pedido_site,cliente,contato,etapas,cancelada,ext_id").eq("cancelada", false);
      if (Array.isArray(b.ids) && b.ids.length) q = q.in("id", b.ids.map(String).slice(0, 200));
      const { data: vs, error } = await q;
      if (error) throw error;
      const ids = (vs || []).map((v: any) => v.id);
      const { data: ja } = ids.length ? await admin.from("avisos_cliente").select("venda,status").eq("tipo", tipo).in("venda", ids) : { data: [] };
      const feito = new Set((ja || []).filter((a: any) => ["enviado", "enviando"].includes(a.status)).map((a: any) => a.venda));
      const lista: any[] = [], fora: any[] = [];
      for (const v of (vs || []).sort((a: any, b: any) => Number(a.numero) - Number(b.numero))) {
        const e = v.etapas || {};
        const item = { numero: v.numero, pedido: v.pedido_site || "#" + v.numero, cliente: v.cliente, para: emailDe(v.contato) };
        if (!String(v.ext_id || "").startsWith("shopify:")) { fora.push({ ...item, motivo: "venda lançada à mão" }); continue; }
        if (feito.has(v.id)) { fora.push({ ...item, motivo: "já recebeu" }); continue; }
        if (M.depois.some((k) => e[k])) { fora.push({ ...item, motivo: "já foi embalado ou passou desta etapa" }); continue; }
        if (!item.para) { fora.push({ ...item, motivo: "sem e-mail" }); continue; }
        lista.push({ ...item, v });
      }
      if (b.previa) return resp(200, { ok: true, previa: true, recebem: lista.map(({ v, ...x }) => x), fora });
      if (!cfg.ativo) return resp(200, { ok: true, desligado: true, resultados: [] });
      const resultados: any[] = [];
      for (const it of lista) await enviarUm(it.v, tipo, cfg, resultados);
      return resp(200, { ok: true, resultados, fora });
    }

    if (!cfg.ativo) return resp(200, { ok: true, desligado: true, resultados: [] });

    let q = admin.from("vendas").select("id,numero,pedido_site,cliente,contato,etapas,cancelada,ext_id");
    if (Array.isArray(b.ids) && b.ids.length) q = q.in("id", b.ids.map(String).slice(0, 200));
    else if (b.pendentes) q = q.eq("cancelada", false);
    else return resp(400, { erro: "informe ids ou pendentes" });
    const { data: vs, error } = await q;
    if (error) throw error;
    const ids = (vs || []).map((v: any) => v.id);
    const { data: ja } = ids.length ? await admin.from("avisos_cliente").select("venda,tipo,status,info").in("venda", ids) : { data: [] };
    const semEmail = new Set((ja || []).filter((a: any) => a.status === "erro" && a.info === "venda sem e-mail").map((a: any) => a.venda + "|" + a.tipo));
    const feito = new Set((ja || []).filter((a: any) => ["enviado", "pulado", "enviando"].includes(a.status)).map((a: any) => a.venda + "|" + a.tipo));
    const resultados: any[] = [];
    for (const v of vs || []) {
      const e = v.etapas || {};
      if (v.cancelada || !String(v.ext_id || "").startsWith("shopify:")) continue;
      for (const [tipo, T] of Object.entries(TIPOS)) {
        if (!e[T.etapa] || feito.has(v.id + "|" + tipo)) continue;
        const para = emailDe(v.contato);
        const base = { venda: v.id, numero: v.numero, tipo, canal: "email", para };
        if (T.depois.some((k) => e[k])) { await admin.from("avisos_cliente").insert({ ...base, status: "pulado", info: "o pedido já passou desta etapa" }); resultados.push({ numero: v.numero, tipo, status: "pulado" }); continue; }
        if (!para) { if (semEmail.has(v.id + "|" + tipo)) continue; await admin.from("avisos_cliente").insert({ ...base, status: "erro", info: "venda sem e-mail" }); resultados.push({ numero: v.numero, tipo, status: "erro", info: "venda sem e-mail" }); continue; }
        await enviarUm(v, tipo, cfg, resultados);
      }
    }
    return resp(200, { ok: true, resultados });
  } catch (e) {
    return resp(500, { erro: String((e as Error).message || e) });
  }
});

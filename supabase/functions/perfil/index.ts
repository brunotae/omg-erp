// "Meu perfil de beleza" (página /pages/meu-perfil do site). Pública, mas só aceita pedidos assinados pelo tema:
// o Liquid gera sig = HMAC-SHA256(segredo, cid:email:ts) para a cliente logada (segredo em config 'perfil_hmac').
// Ações: ler | salvar | apagar. Grava em public.clientes_perfil (só leitura para a equipe no ERP).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = /^https:\/\/((www\.)?ohmygirl\.com\.br|[a-z0-9-]+\.myshopify\.com)$/;
let SEGREDO: string | null = null;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "access-control-allow-origin": ORIGENS.test(o) ? o : "https://www.ohmygirl.com.br", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
}
const resp = (req: Request, st: number, b: unknown) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json", ...cors(req) } });

async function segredo() {
  if (SEGREDO) return SEGREDO;
  const { data } = await sb.from("config").select("valor").eq("chave", "perfil_hmac").single();
  SEGREDO = String(data?.valor || "");
  return SEGREDO;
}
async function hmac(chave: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const txt = (v: unknown, n = 120) => (v == null ? null : String(v).trim().slice(0, n) || null);
const lista = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, n) : null);
const int = (v: unknown, a: number, b: number) => { const x = parseInt(String(v ?? ""), 10); return x >= a && x <= b ? x : null; };

const CAMPOS = "nome,telefone,cep,endereco,numero,complemento,bairro,cidade,uf,aniversario_dia,aniversario_mes,tipo_pele,preocupacoes,sensibilidade,rotina,marcas,como_conheceu,interesses,consentimento,atualizado_em";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resp(req, 405, { erro: "método" });
  let b: any;
  try { b = await req.json(); } catch { return resp(req, 400, { erro: "json" }); }
  const cid = String(b.cid || "").replace(/\D/g, ""), email = String(b.email || "").trim().toLowerCase(), ts = parseInt(String(b.ts || 0), 10);
  if (!cid || !email || !ts) return resp(req, 400, { erro: "faltam dados" });
  if (Math.abs(Date.now() / 1000 - ts) > 2 * 86400) return resp(req, 401, { erro: "sessão expirada, recarregue a página" });
  const esperado = await hmac(await segredo(), `${cid}:${email}:${ts}`);
  if (esperado !== String(b.sig || "")) return resp(req, 401, { erro: "assinatura inválida" });

  if (b.acao === "ler") {
    const { data } = await sb.from("clientes_perfil").select(CAMPOS).eq("shopify_customer_id", cid).maybeSingle();
    return resp(req, 200, { ok: true, perfil: data });
  }
  if (b.acao === "apagar") {
    await sb.from("clientes_perfil").delete().eq("shopify_customer_id", cid);
    return resp(req, 200, { ok: true });
  }
  if (b.acao === "salvar") {
    const d = b.dados || {};
    if (d.consentimento !== true) return resp(req, 400, { erro: "É preciso aceitar o uso dos dados para salvar." });
    const linha = {
      shopify_customer_id: cid, email,
      nome: txt(d.nome, 80), telefone: txt(d.telefone, 20),
      cep: txt(d.cep, 9), endereco: txt(d.endereco), numero: txt(d.numero, 12), complemento: txt(d.complemento, 60),
      bairro: txt(d.bairro, 60), cidade: txt(d.cidade, 60), uf: txt(d.uf, 2)?.toUpperCase() ?? null,
      aniversario_dia: int(d.aniversario_dia, 1, 31), aniversario_mes: int(d.aniversario_mes, 1, 12),
      tipo_pele: txt(d.tipo_pele, 30), preocupacoes: lista(d.preocupacoes), sensibilidade: txt(d.sensibilidade, 30),
      rotina: txt(d.rotina, 30), marcas: lista(d.marcas, 20), como_conheceu: txt(d.como_conheceu, 40), interesses: lista(d.interesses),
      consentimento: true, consentido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    };
    const { error } = await sb.from("clientes_perfil").upsert(linha, { onConflict: "shopify_customer_id" });
    if (error) return resp(req, 500, { erro: "não foi possível salvar" });
    return resp(req, 200, { ok: true });
  }
  return resp(req, 400, { erro: "ação" });
});

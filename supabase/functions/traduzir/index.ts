// traduzir · v1 (19/11/2026) — traduz textos curtos do ERP (ex.: tarefas para a Janice) com o Claude.
// Só membros do ERP (JWT). Pedido: { textos: string[], para: "ko" | "pt" } → { textos: string[] } na mesma ordem.
// Segredo usado: ANTHROPIC_API_KEY (o mesmo da Bomi). Modelo: TRADUZIR_MODELO (padrão claude-haiku-4-5-20251001).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CHAVE = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELO = Deno.env.get("TRADUZIR_MODELO") ?? "claude-haiku-4-5-20251001";
const NOME: Record<string, string> = { ko: "Korean (natural, polite workplace Korean, short imperative to-do style)", pt: "Brazilian Portuguese" };

async function membro(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (!email) return false;
  const { data: m } = await admin.from("membros").select("email").eq("email", email).maybeSingle();
  return !!m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!(await membro(req))) return resp(403, { erro: "Só membros do ERP" });
  if (!CHAVE) return resp(503, { erro: "ANTHROPIC_API_KEY não configurada" });
  let b: any; try { b = await req.json(); } catch { return resp(400, { erro: "pedido inválido" }); }
  const textos: string[] = Array.isArray(b?.textos) ? b.textos.map((t: unknown) => String(t ?? "").slice(0, 1000)).slice(0, 60) : [];
  const para = b?.para === "pt" ? "pt" : "ko";
  if (!textos.length) return resp(200, { textos: [] });
  const system = "You translate short internal to-do items for a small Korea–Brazil K-beauty company (OMG). Translate each item to " + NOME[para] +
    ". Keep names of people, brands, products, SKUs and numbers as they are. Do not add explanations. Answer ONLY with a JSON array of strings, same length and order as the input.";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CHAVE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 2000, system, messages: [{ role: "user", content: JSON.stringify(textos) }] }),
  });
  if (!r.ok) return resp(502, { erro: "tradução falhou (" + r.status + ")" });
  const j: any = await r.json();
  const txt = (j.content || []).map((c: any) => c.text || "").join("").trim();
  let out: unknown;
  try { out = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)); } catch { return resp(502, { erro: "resposta inválida da tradução" }); }
  if (!Array.isArray(out) || out.length !== textos.length) return resp(502, { erro: "tradução incompleta" });
  return resp(200, { textos: out.map((x) => String(x ?? "")) });
});

// Link curto das parcerias: ohmygirl.com.br/a/<slug> (redirecionamento do Shopify) → esta função → site com UTM.
// Pública (sem login). Conta o clique (sem guardar IP: só um código diário anônimo para contar pessoas únicas)
// e manda para o site com utm_* + ref=<slug>. Link pausado, vencido ou de influenciador inativo vai para o site sem UTM.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = "https://www.ohmygirl.com.br";
const SAL = Deno.env.get("BOMI_SAL") ?? "omg-ir";
const ROBO = /bot|crawl|spider|facebookexternalhit|whatsapp|telegram|slack|discord|preview|curl|wget|python|headless/i;

const vai = (url: string) => new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function destinoSeguro(d: string) {
  try {
    const u = new URL(d || "/", SITE);
    if (!/(^|\.)ohmygirl\.com\.br$/.test(u.hostname)) return new URL("/", SITE);
    return new URL(u.pathname + u.search + u.hash, SITE);
  } catch { return new URL("/", SITE); }
}

async function hash(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].slice(0, 10).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const slug = (u.searchParams.get("l") || u.pathname.split("/").filter(Boolean).pop() || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (!slug || slug === "ir") return vai(SITE + "/");
  const { data: l } = await sb.from("links_utm").select("id,slug,destino,utm_source,utm_medium,utm_campaign,utm_content,utm_term,ativo,inicio,fim,influenciador").eq("slug", slug).maybeSingle();
  if (!l) return vai(SITE + "/");
  const dest = destinoSeguro(l.destino);
  const hoje = hojeSP();
  let ativo = l.ativo && (!l.inicio || l.inicio <= hoje) && (!l.fim || l.fim >= hoje);
  if (ativo && l.influenciador) {
    const { data: i } = await sb.from("influenciadores").select("ativo,fim").eq("id", l.influenciador).maybeSingle();
    ativo = !!i && i.ativo && (!i.fim || i.fim >= hoje);
  }
  if (!ativo) return vai(dest.toString());
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) if (l[k]) dest.searchParams.set(k, l[k]);
  dest.searchParams.set("ref", l.slug);
  const ua = req.headers.get("user-agent") || "";
  if (!ROBO.test(ua)) {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    let origem = "";
    try { const r = req.headers.get("referer"); if (r) origem = new URL(r).hostname; } catch { /* sem origem */ }
    await sb.from("link_cliques").insert({ link: l.id, visitante: await hash(SAL + "|" + hoje + "|" + ip + "|" + ua), origem }).then(() => {}, () => {});
  }
  return vai(dest.toString());
});

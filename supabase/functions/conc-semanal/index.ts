// Leitura semanal dos concorrentes válidos (KS e Jini) → conc_catalogo.
// Chamado pelo GitHub Actions em partes: { loja: "ks"|"jini", de: 0, qtd: 40, inicio: ISO }.
// Só lê páginas públicas dos concorrentes e grava preços; não recebe nem devolve dados da OMG.
import { createClient } from "npm:@supabase/supabase-js@2";
import { LOJAS, urlsDaLoja, lerPagina, gravarLeitura } from "../_shared/concorrentes.ts";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const resp = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { "content-type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  let b: any; try { b = await req.json(); } catch { return resp(400, { erro: "pedido inválido" }); }
  // TEMPORÁRIO (30/10/2026): lista dos nossos produtos das marcas pedidas, para as planilhas de preço oficial. Sai depois de usar.
  if (b.acao === "omg_marcas" && Array.isArray(b.marcas)) {
    const { data, error } = await admin.from("produtos").select("sku,nome,marca,preco,peso_g,ativo").in("marca", b.marcas.slice(0, 20)).limit(5000);
    if (error) return resp(500, { erro: error.message });
    return resp(200, { ok: true, produtos: data });
  }
  const loja = String(b.loja || ""); if (!LOJAS[loja]) return resp(400, { erro: "loja inválida" });
  const de = Math.max(0, Number(b.de) || 0), qtd = Math.min(60, Math.max(1, Number(b.qtd) || 40));
  const inicio = String(b.inicio || "");
  const urls = await urlsDaLoja(loja);
  const parte = urls.slice(de, de + qtd);
  let ok = 0; const erros: string[] = [];
  for (const u of parte) {
    try { await gravarLeitura(admin, await lerPagina(u)); ok++; } catch (e) { erros.push(u + " · " + String((e as Error).message || e).slice(0, 80)); }
    await new Promise((r) => setTimeout(r, 300));
  }
  const fim = de + qtd >= urls.length;
  let inativos = 0;
  if (fim && /^\d{4}-\d\d-\d\dT/.test(inicio)) {
    // o que sumiu do site fica inativo, só se a leitura desta rodada foi boa
    const { count } = await admin.from("conc_catalogo").select("url", { count: "exact", head: true }).eq("loja", loja).gte("lido_em", inicio);
    if ((count ?? 0) >= 0.7 * urls.length) {
      const { data } = await admin.from("conc_catalogo").update({ ativo: false }).eq("loja", loja).eq("ativo", true).lt("lido_em", inicio).select("url");
      inativos = data?.length ?? 0;
    }
  }
  return resp(200, { loja, total: urls.length, de, lidos: ok, erros, fim, inativos });
});

// Ações do ERP no Shopify. Chamada pelo ERP com o login do usuário (só editores).
//   { acao: "sincronizar" }                              → traz todos os produtos (inclui rascunhos)
//   { acao: "status", produtoId, ativo: true|false }     → ativa ou pausa (rascunho) no site
//   { acao: "preco", produtoId, varianteId, preco }      → muda o preço da variante no site
//   { acao: "fotos", itens: [{ handle, fotos, peso_g }] } → troca as fotos pelas oficiais e corrige o peso
//   { acao: "testar" }                                   → confere a ligação (nome da loja e permissões)
//   { acao: "paginas", itens: [{ politica?: "PRIVACY_POLICY"|..., handle?, titulo?, html }] } → publica políticas e páginas
//   { acao: "webhooks" }                                 → assina os avisos do Shopify (pedidos e produtos) para a função shopify-webhook
//   { acao: "rodape", aplicar: false|true }              → troca links do rodapé das páginas antigas pela Central de Ajuda,
//                                                          esconde as páginas antigas e cria redirecionamentos (aplicar:false só mostra o plano)
//   { acao: "ativar", handles: [..], ativo: true|false } → ativa (ou pausa) produtos pelo handle, até 50 por vez
//   { acao: "fotos_refazer", itens: [{ handle, ok, fotos?, oficial?, url?, motivo?, fotos_originais? }] }
//        → refaz a fila de fotos com a regra rígida; quem não passa e já tinha foto nova volta para a original
//   { acao: "pesos", itens: [{ sku, peso_g, dim: [c, l, a] (cm) }] } → grava peso (frete) e dimensões (metafield custom.dimensoes_cm), até 100 por vez
// Segredos: SHOPIFY_SHOP (ex.: mundo-beleza-9571.myshopify.com), SHOPIFY_API_VERSION (opcional) e
//   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (app do Dev Dashboard; token pedido a cada 24 h por client credentials)
//   ou, alternativa, SHOPIFY_ADMIN_TOKEN fixo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { gravarProdutos, gravarProdutosLote, produtoParaLinhas } from "../_shared/produtos.js";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SHOP = Deno.env.get("SHOPIFY_SHOP") ?? "";
const TOKEN_FIXO = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const configurado = () => !!SHOP && (!!TOKEN_FIXO || (!!CLIENT_ID && !!CLIENT_SECRET));

// Token do app (client credentials): vale ~24 h; guardamos em memória e renovamos 5 min antes.
let cacheToken = { valor: "", expira: 0 };
async function tokenShopify(): Promise<string> {
  if (TOKEN_FIXO) return TOKEN_FIXO;
  if (cacheToken.valor && Date.now() < cacheToken.expira) return cacheToken.valor;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Shopify recusou o token do app: " + r.status);
  cacheToken = { valor: j.access_token, expira: Date.now() + ((Number(j.expires_in) || 86399) - 300) * 1000 };
  return cacheToken.valor;
}
const VERSAO = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VERSAO}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await tokenShopify() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors ?? r.status));
  return j.data;
}

const Q_PRODUTOS = `query($after: String) {
  products(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle vendor productType status
      variants(first: 100) { nodes { id sku price title inventoryItem { measurement { weight { value unit } } } } } }
  }
}`;

// Troca as fotos de um produto: primeiro adiciona as oficiais, depois apaga as antigas
// (assim o produto nunca fica sem foto se algo falhar no meio).
async function trocarFotos(it: { handle: string; fotos: string[]; peso_g?: number | null }) {
  const fotos = (it.fotos || []).filter((u) => /^https:\/\//.test(u)).slice(0, 20);
  if (!it.handle || !fotos.length) throw new Error("sem handle ou sem fotos");
  const d: any = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes {
      id title media(first: 50) { nodes { id } } variants(first: 100) { nodes { id } } } } }`, { q: "handle:" + it.handle });
  const p = d.products.nodes[0];
  if (!p) throw new Error("produto não encontrado no Shopify");
  const antigas: string[] = p.media.nodes.map((m: any) => m.id);
  const media = fotos.map((u) => ({ originalSource: u, alt: p.title, mediaContentType: "IMAGE" }));
  const add: any = await gql(`mutation($p: ProductUpdateInput!, $m: [CreateMediaInput!]) {
      productUpdate(product: $p, media: $m) { product { id } userErrors { message } } }`, { p: { id: p.id }, m: media });
  if (add.productUpdate.userErrors.length) throw new Error(add.productUpdate.userErrors[0].message);
  if (antigas.length) {
    const del: any = await gql(`mutation($id: ID!, $ids: [ID!]!) {
        productDeleteMedia(productId: $id, mediaIds: $ids) { deletedMediaIds mediaUserErrors { message } } }`, { id: p.id, ids: antigas });
    const e = del.productDeleteMedia.mediaUserErrors; if (e.length) throw new Error("fotos novas entraram, mas as antigas não saíram: " + e[0].message);
  }
  const g = Number(it.peso_g);
  if (g > 0 && p.variants.nodes.length) {
    const w: any = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
      { pid: p.id, v: p.variants.nodes.map((v: any) => ({ id: v.id, inventoryItem: { measurement: { weight: { value: g, unit: "GRAMS" } } } })) });
    if (!w.productVariantsBulkUpdate.userErrors.length) {
      await admin.from("produtos").update({ peso_g: g }).eq("shopify_product_id", p.id.split("/").pop());
    }
  }
}

async function editor(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: m } = await admin.from("membros").select("papel").eq("email", email).maybeSingle();
  return m?.papel === "editor" ? email : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!configurado()) return resp(503, { erro: "Ligação com o Shopify ainda não configurada" });
  if (!(await editor(req))) return resp(403, { erro: "Só editores do ERP podem fazer isso" });

  let b: any;
  try { b = await req.json(); } catch { return resp(400, { erro: "pedido inválido" }); }

  try {
    if (b.acao === "sincronizar") {
      // Em partes (o servidor tem limite de tempo): até ~60 s por chamada; devolve "proximo" para continuar.
      let after: string | null = b.after || null, total = 0, novos = 0, atualizados = 0;
      const ini = Date.now();
      do {
        const d: any = await gql(Q_PRODUTOS, { after });
        const r = await gravarProdutosLote(admin, d.products.nodes.flatMap((p: any) => produtoParaLinhas(p)));
        novos += r.novos; atualizados += r.atualizados; total += d.products.nodes.length;
        after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
      } while (after && Date.now() - ini < 50_000);
      return resp(200, { ok: true, produtos: total, novos, atualizados, proximo: after });
    }

    if (b.acao === "status") {
      const d: any = await gql(
        `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id status } userErrors { message } } }`,
        { p: { id: "gid://shopify/Product/" + b.produtoId, status: b.ativo ? "ACTIVE" : "DRAFT" } },
      );
      const e = d.productUpdate.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      const st = b.ativo ? "active" : "draft";
      await admin.from("produtos").update({ ativo: !!b.ativo, site_status: st }).eq("shopify_product_id", String(b.produtoId));
      return resp(200, { ok: true, status: st });
    }

    if (b.acao === "cupom_criar") {
      // Cria um cupom de verdade no Shopify (o checkout reconhece na hora).
      // cupom: { codigo, tipo: "%"|"R$", valor, minimo?, publico: "todas"|"primeira"|"clientes", emails?: [], uma_vez?, limite_total?, inicio?, fim?, titulo? }
      const c = b.cupom || {};
      const codigo = String(c.codigo || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (codigo.length < 3) return resp(400, { erro: "código precisa de ao menos 3 letras ou números" });
      const valor = Number(c.valor);
      if (!(valor > 0)) return resp(400, { erro: "valor do desconto inválido" });
      if (c.tipo === "%" && valor > 100) return resp(400, { erro: "percentual acima de 100%" });
      const ja: any = await gql(`query($c: String!) { codeDiscountNodeByCode(code: $c) { id } }`, { c: codigo });
      if (ja.codeDiscountNodeByCode) return resp(409, { erro: "já existe um cupom com o código " + codigo + " no Shopify" });

      let alvo: { tipo: string; ids?: string[] } = { tipo: "todas" };
      const semCadastro: string[] = [];
      if (c.publico === "clientes") {
        const emails = [...new Set((Array.isArray(c.emails) ? c.emails : []).map((e: any) => String(e).trim().toLowerCase()).filter((e: string) => e.includes("@")))].slice(0, 200);
        const ids: string[] = [];
        for (const e of emails) {
          const q: any = await gql(`query($q: String!) { customers(first: 1, query: $q) { nodes { id email } } }`, { q: "email:" + e });
          const cl = q.customers.nodes.find((x: any) => String(x.email || "").toLowerCase() === e);
          if (cl) ids.push(cl.id); else semCadastro.push(e);
        }
        if (!ids.length) return resp(400, { erro: "nenhuma das clientes tem cadastro no Shopify", sem_cadastro: semCadastro });
        alvo = { tipo: "clientes", ids };
      } else if (c.publico === "primeira") {
        const s: any = await gql(`{ segments(first: 100) { nodes { id name query } } }`);
        let seg = s.segments.nodes.find((x: any) => /number_of_orders\s*=\s*0/.test(String(x.query || "")));
        if (!seg) {
          const n: any = await gql(`mutation($n: String!, $q: String!) { segmentCreate(name: $n, query: $q) { segment { id } userErrors { message } } }`,
            { n: "OMG · ainda não comprou", q: "number_of_orders = 0" });
          if (n.segmentCreate.userErrors.length) throw new Error("não consegui criar o grupo 'primeira compra': " + n.segmentCreate.userErrors[0].message);
          seg = n.segmentCreate.segment;
        }
        alvo = { tipo: "segmento", ids: [seg.id] };
      }

      const base: any = {
        title: String(c.titulo || codigo).slice(0, 255),
        code: codigo,
        startsAt: c.inicio ? `${c.inicio}T00:00:00-03:00` : new Date().toISOString(),
        endsAt: c.fim ? `${c.fim}T23:59:59-03:00` : null,
        customerGets: {
          value: c.tipo === "%" ? { percentage: Math.round(valor * 100) / 10000 } : { discountAmount: { amount: valor.toFixed(2), appliesOnEachItem: false } },
          items: { all: true },
        },
        minimumRequirement: Number(c.minimo) > 0 ? { subtotal: { greaterThanOrEqualToSubtotal: Number(c.minimo).toFixed(2) } } : null,
        usageLimit: Number(c.limite_total) > 0 ? Math.round(Number(c.limite_total)) : null,
        appliesOncePerCustomer: !!c.uma_vez,
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      };
      const M = `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }`;
      // Versões novas da API usam "context"; as antigas, "customerSelection". Tenta a nova e cai para a antiga.
      const ctx = alvo.tipo === "clientes" ? { customers: { add: alvo.ids } } : alvo.tipo === "segmento" ? { customerSegments: { add: alvo.ids } } : { all: "ALL" };
      const sel = alvo.tipo === "clientes" ? { customers: { add: alvo.ids } } : alvo.tipo === "segmento" ? { customerSegments: { add: alvo.ids } } : { all: true };
      let d: any;
      try { d = await gql(M, { d: { ...base, context: ctx } }); }
      catch (_) { d = await gql(M, { d: { ...base, customerSelection: sel } }); }
      const e = d.discountCodeBasicCreate.userErrors; if (e.length) return resp(422, { erro: e.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, codigo, id: d.discountCodeBasicCreate.codeDiscountNode.id, clientes: alvo.ids?.length ?? null, sem_cadastro: semCadastro });
    }

    if (b.acao === "tema_ler") {
      // Lê arquivos do tema publicado (MAIN). b.arquivos: nomes exatos; ou b.busca: texto para filtrar nomes.
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      if (b.busca !== undefined) {
        const nomes: string[] = []; let after: string | null = null;
        do {
          const d: any = await gql(`query($id: ID!, $a: String) { theme(id: $id) { files(first: 250, after: $a) { nodes { filename } pageInfo { hasNextPage endCursor } } } }`, { id: tema.id, a: after });
          nomes.push(...d.theme.files.nodes.map((f: any) => f.filename));
          after = d.theme.files.pageInfo.hasNextPage ? d.theme.files.pageInfo.endCursor : null;
        } while (after);
        return resp(200, { ok: true, tema: tema.name, arquivos: nomes.filter((n) => n.includes(String(b.busca))) });
      }
      const d: any = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 50) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`, { id: tema.id, f: b.arquivos });
      return resp(200, { ok: true, tema: tema.name, id: tema.id, arquivos: d.theme.files.nodes.map((f: any) => ({ nome: f.filename, conteudo: f.body?.content ?? null })) });
    }

    if (b.acao === "tema_gravar") {
      // Grava arquivos no tema publicado. b.arquivos: [{ nome, conteudo }]. Guarda cópia do original em tema_backup (Supabase).
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      const arqs = (Array.isArray(b.arquivos) ? b.arquivos : []).slice(0, 10);
      const ant: any = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 50) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`, { id: tema.id, f: arqs.map((a: any) => a.nome) });
      const backup = ant.theme.files.nodes.map((f: any) => ({ nome: f.filename, conteudo: f.body?.content ?? null }));
      const d: any = await gql(`mutation($id: ID!, $f: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $id, files: $f) { upsertedThemeFiles { filename } userErrors { filename message } } }`,
        { id: tema.id, f: arqs.map((a: any) => ({ filename: a.nome, body: a.base64 ? { type: "BASE64", value: String(a.base64) } : { type: "TEXT", value: String(a.conteudo) } })) });
      const ue = d.themeFilesUpsert.userErrors; if (ue.length) return resp(422, { erro: ue.map((x: any) => x.filename + ": " + x.message).join("; "), backup });
      return resp(200, { ok: true, tema: tema.name, gravados: d.themeFilesUpsert.upsertedThemeFiles.map((x: any) => x.filename), backup });
    }

    if (b.acao === "produto_ler") {
      // Diagnóstico de página de produto: b.handles (até 20) ou b.busca (texto livre do Shopify, até 50 resultados, só resumo).
      const CAMPOS = `id handle title status vendor productType templateSuffix tags descriptionHtml onlineStoreUrl
        media(first: 20) { nodes { mediaContentType alt preview { image { url width height } } } }
        variants(first: 20) { nodes { id title sku price availableForSale inventoryQuantity } }`;
      if (b.busca) {
        const d: any = await gql(`query($q: String) { products(first: 50, query: $q) { nodes { handle title status templateSuffix } } }`, { q: String(b.busca) });
        return resp(200, { ok: true, produtos: d.products.nodes });
      }
      const out: any[] = [];
      for (const h of (Array.isArray(b.handles) ? b.handles : []).slice(0, 20)) {
        const d: any = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { ${CAMPOS} } }`, { h: String(h) });
        out.push(d.productByIdentifier ?? { handle: h, erro: "não encontrado" });
      }
      return resp(200, { ok: true, produtos: out });
    }

    if (b.acao === "desc_scan") {
      // Varre produtos ATIVOS (100 por chamada, b.after) e aponta descrições problemáticas.
      const d: any = await gql(`query($a: String) { products(first: 100, after: $a, query: "status:active") { nodes { handle title vendor productType tags descriptionHtml media(first: 1) { nodes { id } } variants(first: 1) { nodes { price } } } pageInfo { hasNextPage endCursor } } }`, { a: b.after ?? null });
      const achados: any[] = [];
      for (const p of d.products.nodes) {
        const h = String(p.descriptionHtml || ""); const txt = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const f: string[] = [];
        if (/shopify-section|BrickSection|data-section-id|<section/i.test(h)) f.push("secao_copiada");
        if (/<(script|style|iframe|form)\b/i.test(h)) f.push("tag_perigosa");
        const ext = [...h.matchAll(/(?:href|src)="(?:https?:)?\/\/([^/"]+)/gi)].map((m) => m[1].toLowerCase()).filter((x) => !/cdn\.shopify\.com|ohmygirl\.com\.br|myshopify\.com/.test(x));
        if (ext.length) f.push("link_externo:" + [...new Set(ext)].slice(0, 3).join(","));
        if (/proveniente do exterior/i.test(txt) && txt.length < 260) f.push("so_aviso");
        else if (txt.length < 40) f.push("sem_descricao");
        if (h.length > 12000) f.push("longa:" + h.length);
        if ((p.tags || []).some((t: string) => /duplicata/i.test(t))) f.push("duplicata");
        if (!p.media.nodes.length) f.push("sem_foto");
        if (f.length || b.todos) achados.push({ h: p.handle, t: p.title, v: p.vendor, pr: p.variants.nodes[0]?.price, f, ...(b.todos ? { tipo: p.productType, tags: p.tags } : {}) });
      }
      return resp(200, { ok: true, n: d.products.nodes.length, achados, proximo: d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null });
    }

    if (b.acao === "produto_desc") {
      // Corrige a descrição (HTML) de produtos: b.itens = [{ id, html }] (até 20).
      const res: any[] = [];
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 20)) {
        const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { handle } userErrors { message } } }`, { p: { id: String(it.id), descriptionHtml: String(it.html) } });
        const e = d.productUpdate.userErrors;
        res.push(e.length ? { id: it.id, erro: e.map((x: any) => x.message).join("; ") } : { id: it.id, ok: d.productUpdate.product.handle });
      }
      return resp(200, { ok: true, res });
    }

    if (b.acao === "teste_produtos") {
      // Diagnóstico: passa produtos do Shopify pelo mesmo caminho do aviso products/update e mostra os erros.
      const d: any = await gql(Q_PRODUTOS.replace("first: 50", "first: " + Math.min(Number(b.n) || 50, 50)), { after: b.after ?? null });
      const erros: any[] = []; let ok = 0;
      for (const p of d.products.nodes) {
        try { await gravarProdutos(admin, produtoParaLinhas(p)); ok++; }
        catch (e) { erros.push({ handle: p.handle, erro: JSON.stringify(e).slice(0, 300) }); }
      }
      return resp(200, { ok, erros, proximo: d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null });
    }

    if (b.acao === "envio_sync") {
      // Leva as etapas do ERP para o Shopify (o Shopify manda os e-mails à cliente):
      // embarcado → "pedido enviado" (fulfillment com link de rastreio); desembaraço → em trânsito;
      // last mile → saiu para entrega; entregue → entregue. Idempotente: guarda o que já foi feito em dados_site.envio.
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 30);
      const PAG = "https://ohmygirl.com.br/pages/acompanhe-seu-pedido";
      const { data: vs } = await admin.from("vendas").select("id,numero,ext_id,pedido_site,etapas,rastreio,cancelada,dados_site").in("id", ids);
      const ORD = ["embarcado", "manifesto", "desembaraco", "lastmile", "entregue"];
      const EVT: [string, string, string][] = [["desembaraco", "IN_TRANSIT", "Chegou ao Brasil: em liberação na Receita Federal"], ["lastmile", "OUT_FOR_DELIVERY", "Saiu para entrega"], ["entregue", "DELIVERED", "Entregue"]];
      const resultados: any[] = [];
      for (const v of vs || []) {
        const r: any = { numero: v.numero, feito: [] as string[] };
        try {
          const e = v.etapas || {};
          if (v.cancelada || !String(v.ext_id || "").startsWith("shopify:")) { r.pulado = v.cancelada ? "cancelada" : "não veio do site"; resultados.push(r); continue; }
          if (!ORD.some((k) => e[k])) { r.pulado = "ainda não embarcou"; resultados.push(r); continue; }
          const ds = v.dados_site || {}; const env = { eventos: [] as string[], ...(ds.envio || {}) };
          const orderId = "gid://shopify/Order/" + String(v.ext_id).split(":")[1];
          const nPed = String(v.pedido_site || v.numero).replace(/\D/g, "");
          const track = (num: string) => ({ company: v.rastreio ? "Mile Express" : "OMG", number: num, url: PAG + "?pedido=" + nPed });
          if (!env.fulfillment_id) {
            const q: any = await gql(`query($id: ID!) { order(id: $id) { fulfillments(first: 5) { id } fulfillmentOrders(first: 10) { nodes { id status } } } }`, { id: orderId });
            if (!q.order) throw new Error("pedido não encontrado no Shopify");
            if (q.order.fulfillments.length) env.fulfillment_id = q.order.fulfillments[0].id;
            else {
              const fos = q.order.fulfillmentOrders.nodes.filter((f: any) => ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(f.status));
              if (!fos.length) throw new Error("sem itens a enviar no Shopify");
              const d: any = await gql(`mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { message } } }`,
                { f: { lineItemsByFulfillmentOrder: fos.map((f: any) => ({ fulfillmentOrderId: f.id })), notifyCustomer: true, trackingInfo: track(v.rastreio || String(v.numero)) } });
              const ue = d.fulfillmentCreate.userErrors; if (ue.length) throw new Error(ue[0].message);
              env.fulfillment_id = d.fulfillmentCreate.fulfillment.id; r.feito.push("enviado (e-mail à cliente)");
            }
            env.rastreio = v.rastreio || "";
          }
          if (v.rastreio && env.rastreio !== v.rastreio) {
            const d: any = await gql(`mutation($id: ID!, $t: FulfillmentTrackingInput!) { fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $t, notifyCustomer: false) { userErrors { message } } }`,
              { id: env.fulfillment_id, t: track(v.rastreio) });
            const ue = d.fulfillmentTrackingInfoUpdate.userErrors; if (ue.length) throw new Error(ue[0].message);
            env.rastreio = v.rastreio; r.feito.push("rastreio atualizado");
          }
          for (const [k, st, msg] of EVT) {
            if (!e[k] || env.eventos.includes(k)) continue;
            const d: any = await gql(`mutation($ev: FulfillmentEventInput!) { fulfillmentEventCreate(fulfillmentEvent: $ev) { userErrors { message } } }`,
              { ev: { fulfillmentId: env.fulfillment_id, status: st, message: msg, happenedAt: String(e[k]).slice(0, 10) + "T12:00:00-03:00" } });
            const ue = d.fulfillmentEventCreate.userErrors; if (ue.length) throw new Error(ue[0].message);
            env.eventos.push(k); r.feito.push(msg.toLowerCase());
          }
          await admin.from("vendas").update({ dados_site: { ...ds, envio: env } }).eq("id", v.id);
          r.ok = true;
        } catch (err) {
          const m = String((err as Error).message || err);
          r.ok = false; r.erro = /access|scope|denied|permission/i.test(m) ? "o app do Shopify ainda não tem permissão de envio (fulfillments)" : m.slice(0, 200);
        }
        resultados.push(r);
      }
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "cupom_status") {
      const id = String(b.id || "");
      if (!id.startsWith("gid://shopify/DiscountCodeNode/")) return resp(400, { erro: "cupom sem ligação com o Shopify" });
      const m = b.ativo
        ? `mutation($id: ID!) { discountCodeActivate(id: $id) { userErrors { message } } }`
        : `mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`;
      const d: any = await gql(m, { id });
      const e = (b.ativo ? d.discountCodeActivate : d.discountCodeDeactivate).userErrors;
      if (e.length) return resp(422, { erro: e[0].message });
      return resp(200, { ok: true });
    }

    if (b.acao === "marcas") {
      // corrige a marca (vendor) de produtos cadastrados com marca errada: itens [{ handle, marca }]
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 40);
      const resultados: any[] = [];
      for (const it of itens) {
        try {
          const d: any = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes { id vendor } } }`, { q: "handle:" + it.handle });
          const p = d.products.nodes[0]; if (!p) throw new Error("produto não encontrado");
          const u: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: p.id, vendor: String(it.marca) } });
          if (u.productUpdate.userErrors.length) throw new Error(u.productUpdate.userErrors[0].message);
          await admin.from("produtos").update({ marca: String(it.marca) }).eq("shopify_product_id", p.id.split("/").pop());
          resultados.push({ handle: it.handle, ok: true, antes: p.vendor });
        } catch (e) { resultados.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 160) }); }
      }
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "preco") {
      const preco = Number(b.preco);
      if (!(preco > 0)) return resp(400, { erro: "preço inválido" });
      const d: any = await gql(
        `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
        { pid: "gid://shopify/Product/" + b.produtoId, v: [{ id: "gid://shopify/ProductVariant/" + b.varianteId, price: preco.toFixed(2) }] },
      );
      const e = d.productVariantsBulkUpdate.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      await admin.from("produtos").update({ preco }).eq("shopify_variant_id", String(b.varianteId));
      return resp(200, { ok: true, preco });
    }

    if (b.acao === "fotos") {
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 25) : [];
      const resultados = [];
      for (const it of itens) {
        try { await trocarFotos(it); resultados.push({ handle: it.handle, ok: true }); }
        catch (e) { resultados.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 200) }); }
      }
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "testar") {
      const d: any = await gql(`{ shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
      return resp(200, { ok: true, loja: d.shop.name, dominio: d.shop.myshopifyDomain,
        permissoes: (d.currentAppInstallation?.accessScopes || []).map((x: any) => x.handle) });
    }

    if (b.acao === "webhooks") {
      const URL_WH = URL_SB + "/functions/v1/shopify-webhook";
      const TOPICOS = ["ORDERS_PAID", "ORDERS_CANCELLED", "PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"];
      const ex: any = await gql(`{ webhookSubscriptions(first: 50) { nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`);
      const ja = new Set(ex.webhookSubscriptions.nodes.filter((w: any) => w.endpoint?.callbackUrl === URL_WH).map((w: any) => w.topic));
      const resultados: any[] = [];
      for (const t of TOPICOS) {
        if (ja.has(t)) { resultados.push({ topico: t, ok: true, obs: "já estava ligado" }); continue; }
        try {
          const d: any = await gql(`mutation($t: WebhookSubscriptionTopic!, $w: WebhookSubscriptionInput!) {
              webhookSubscriptionCreate(topic: $t, webhookSubscription: $w) { webhookSubscription { id } userErrors { message } } }`,
            { t, w: { callbackUrl: URL_WH, format: "JSON" } });
          const e = d.webhookSubscriptionCreate.userErrors; if (e.length) throw new Error(e[0].message);
          resultados.push({ topico: t, ok: true, obs: "ligado agora" });
        } catch (e) { resultados.push({ topico: t, ok: false, erro: String((e as Error).message || e).slice(0, 300) }); }
      }
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "paginas") {
      const POL = ["PRIVACY_POLICY", "TERMS_OF_SERVICE", "REFUND_POLICY", "SHIPPING_POLICY", "CONTACT_INFORMATION"];
      const resultados: any[] = [];
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 15)) {
        const nome = it.politica || it.handle;
        try {
          const html = String(it.html || "");
          if (html.length < 50) throw new Error("conteúdo vazio");
          if (it.politica) {
            if (!POL.includes(it.politica)) throw new Error("política desconhecida");
            // As políticas do Shopify não aceitam <style> (o CSS aparecia como texto na página).
            // Tiramos o bloco de estilo e o título repetido (o Shopify já mostra o nome da política)
            // e deixamos só estilos em linha, simples.
            const corpo = html
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<h1[\s\S]*?<\/h1>/i, "")
              .replace(/<nav class="toc"/g, '<nav style="background:#fff;border:1px solid #F6E2E9;border-radius:14px;padding:12px 16px;margin:16px 0 8px"')
              .replace(/<div class="aviso"/g, '<div style="background:#fff;border-left:4px solid #9EDFC4;padding:10px 14px;border-radius:8px;margin-top:26px"')
              .replace(/<div class="tbl"/g, '<div style="overflow-x:auto;margin:10px 0"')
              .replace(/<div class="omg-pol"/g, "<div")
              .replace(/ class="[^"]*"/g, "");
            const d: any = await gql(`mutation($p: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $p) { shopPolicy { url } userErrors { message } } }`,
              { p: { type: it.politica, body: corpo } });
            const e = d.shopPolicyUpdate.userErrors; if (e.length) throw new Error(e[0].message);
            resultados.push({ nome, ok: true, url: d.shopPolicyUpdate.shopPolicy?.url });
          } else {
            const h = String(it.handle || "").replace(/[^a-z0-9-]/g, "");
            if (!h) throw new Error("sem handle");
            const q: any = await gql(`query($q: String!) { pages(first: 1, query: $q) { nodes { id handle } } }`, { q: "handle:" + h });
            const ex = q.pages.nodes.find((x: any) => x.handle === h);
            const page = { title: String(it.titulo || h), body: html, isPublished: true, ...(ex ? {} : { handle: h }) };
            const d: any = ex
              ? await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { page { handle } userErrors { message } } }`, { id: ex.id, p: page })
              : await gql(`mutation($p: PageCreateInput!) { pageCreate(page: $p) { page { handle } userErrors { message } } }`, { p: page });
            const r = ex ? d.pageUpdate : d.pageCreate;
            if (r.userErrors.length) throw new Error(r.userErrors[0].message);
            resultados.push({ nome, ok: true, url: "/pages/" + r.page.handle, criada: !ex });
          }
        } catch (e) {
          resultados.push({ nome, ok: false, erro: String((e as Error).message || e).slice(0, 200) });
        }
      }
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "pagina_ler") {
      // b.busca: texto a procurar no corpo de todas as páginas e políticas; ou b.handle: corpo de uma página.
      const pg: any = await gql(`{ pages(first: 100) { nodes { id handle title body isPublished } } shop { shopPolicies { type body } } }`);
      if (b.handle) return resp(200, { ok: true, pagina: pg.pages.nodes.find((x: any) => x.handle === b.handle) ?? null });
      if (b.politica) return resp(200, { ok: true, politica: pg.shop.shopPolicies.find((x: any) => x.type === b.politica) ?? null });
      const re = new RegExp(String(b.busca || "."), "i");
      const hits = [...pg.pages.nodes.map((x: any) => ({ nome: "page:" + x.handle + (x.isPublished ? "" : " (oculta)"), body: x.body })), ...pg.shop.shopPolicies.map((x: any) => ({ nome: "policy:" + x.type, body: x.body }))]
        .filter((x) => re.test(x.body || "")).map((x) => ({ nome: x.nome, trechos: [...String(x.body).matchAll(new RegExp(".{0,80}(" + String(b.busca) + ").{0,80}", "gi"))].map((m) => m[0]).slice(0, 5) }));
      return resp(200, { ok: true, hits });
    }

    if (b.acao === "tags_trocar") {
      // b.itens: [{ handle, add: [..], remove: [..] }] (até 50)
      const res: any[] = [];
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 50)) {
        try {
          const q: any = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id } }`, { h: String(it.handle) });
          const id = q.productByIdentifier?.id; if (!id) throw new Error("não encontrado");
          if (it.remove?.length) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsRemove(id: $id, tags: $t) { userErrors { message } } }`, { id, t: it.remove }); if (d.tagsRemove.userErrors.length) throw new Error(d.tagsRemove.userErrors[0].message); }
          if (it.add?.length) { const d: any = await gql(`mutation($id: ID!, $t: [String!]!) { tagsAdd(id: $id, tags: $t) { userErrors { message } } }`, { id, t: it.add }); if (d.tagsAdd.userErrors.length) throw new Error(d.tagsAdd.userErrors[0].message); }
          res.push({ handle: it.handle, ok: true });
        } catch (e) { res.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 160) }); }
      }
      return resp(200, { ok: true, res });
    }

    if (b.acao === "colecao_regras") {
      const out: any[] = [];
      for (const h of (Array.isArray(b.handles) ? b.handles : []).slice(0, 20)) {
        const d: any = await gql(`query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { handle title ruleSet { appliedDisjunctively rules { column relation condition } } } }`, { h: String(h) });
        out.push(d.collectionByIdentifier);
      }
      return resp(200, { ok: true, colecoes: out });
    }

    if (b.acao === "colecoes") {
      const out: any[] = []; let a: string | null = null;
      do {
        const d: any = await gql(`query($a: String) { collections(first: 250, after: $a) { nodes { handle title productsCount { count } image { url } } pageInfo { hasNextPage endCursor } } }`, { a });
        out.push(...d.collections.nodes.map((c: any) => ({ h: c.handle, t: c.title, n: c.productsCount?.count, img: !!c.image })));
        a = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null;
      } while (a);
      return resp(200, { ok: true, colecoes: out });
    }

    if (b.acao === "menu_salvar") {
      // Cria ou substitui um menu inteiro: { handle, titulo, itens: [{ titulo, url }] } (links HTTP).
      const itens = (Array.isArray(b.itens) ? b.itens : []).map((i: any) => ({ title: String(i.titulo), type: "HTTP", url: String(i.url), items: [] }));
      const q: any = await gql(`{ menus(first: 50) { nodes { id handle } } }`);
      const ex = q.menus.nodes.find((m: any) => m.handle === b.handle);
      const d: any = ex
        ? await gql(`mutation($id: ID!, $t: String!, $h: String, $i: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $t, handle: $h, items: $i) { menu { id handle } userErrors { message } } }`, { id: ex.id, t: String(b.titulo), h: b.handle, i: itens })
        : await gql(`mutation($t: String!, $h: String!, $i: [MenuItemCreateInput!]!) { menuCreate(title: $t, handle: $h, items: $i) { menu { id handle } userErrors { message } } }`, { t: String(b.titulo), h: String(b.handle), i: itens });
      const r = d.menuUpdate || d.menuCreate;
      if (r.userErrors.length) return resp(422, { erro: r.userErrors.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, menu: r.menu, criado: !ex });
    }

    if (b.acao === "menus_ler" || b.acao === "menu_titulos") {
      // menus_ler: todos os menus + idiomas da loja. menu_titulos: { menu_id, trocas: { itemId: "Novo título" } }.
      const ITEM = `id title type url resourceId tags`;
      const mn: any = await gql(`{ menus(first: 25) { nodes { id handle title items { ${ITEM} items { ${ITEM} items { ${ITEM} } } } } } }`);
      if (b.acao === "menus_ler") return resp(200, { ok: true, menus: mn.menus.nodes });
      const m = mn.menus.nodes.find((x: any) => x.id === b.menu_id); if (!m) return resp(404, { erro: "menu não encontrado" });
      const tr = b.trocas || {}; let n = 0;
      const map = (it: any): any => {
        const out: any = { id: it.id, title: tr[it.id] ?? it.title, type: it.type, tags: it.tags, items: (it.items || []).map(map) };
        if (tr[it.id]) n++;
        if (it.type === "HTTP") out.url = it.url; if (it.resourceId) out.resourceId = it.resourceId;
        if (b.urls?.[it.id]) { out.type = "HTTP"; out.url = String(b.urls[it.id]); delete out.resourceId; n++; }
        return out;
      };
      const items = m.items.map(map);
      const d: any = await gql(`mutation($id: ID!, $t: String!, $h: String, $i: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $t, handle: $h, items: $i) { menu { id } userErrors { message } } }`,
        { id: m.id, t: m.title, h: m.handle, i: items });
      const e = d.menuUpdate.userErrors; if (e.length) return resp(422, { erro: e.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, trocados: n });
    }

    if (b.acao === "rodape") {
      const CA = "/pages/central-de-ajuda";
      // título da página antiga → destino novo
      const DESTINOS: [RegExp, string, string][] = [
        [/prazo|entrega|envio/i, CA + "#cat-entrega", "Central de Ajuda · Entrega"],
        [/frete|imposto|taxa/i, CA + "#cat-remessa-conforme", "Central de Ajuda · Impostos"],
        [/pre[cç]o/i, CA + "#o-preco-do-site-ja-inclui-impostos", "Central de Ajuda · Preços"],
        [/troca|devolu|reembolso/i, "/policies/refund-policy", "Política de Trocas e Devoluções"],
        [/sobre os produtos|original|autentic/i, CA + "#cat-autenticidade", "Central de Ajuda · Originalidade"],
        [/rastrei|acompanh/i, "/pages/acompanhe-seu-pedido", "Acompanhe seu pedido"],
        [/pedido|\bconta\b/i, CA + "#cat-pedidos", "Central de Ajuda · Pedidos"],
        [/faq|perguntas|d[uú]vidas|ajuda/i, CA, "Central de Ajuda"],
      ];
      const NOSSAS = new Set(["central-de-ajuda", "cookies", "contact", "contato", "acompanhe-seu-pedido"]);
      const pg: any = await gql(`{ pages(first: 100) { nodes { id handle title isPublished } } }`);
      const antigas = new Map<string, any>();
      for (const p of pg.pages.nodes) {
        if (NOSSAS.has(p.handle)) continue;
        const d = DESTINOS.find(([re]) => re.test(p.title) || re.test(p.handle));
        if (d) antigas.set(p.id, { ...p, destino: d[1] });
      }
      const ITEM = `id title type url resourceId tags`;
      const mn: any = await gql(`{ menus(first: 25) { nodes { id handle title items { ${ITEM} items { ${ITEM} items { ${ITEM} } } } } } }`);
      const plano: any[] = [];
      const troca = (it: any, menu: string): any => {
        const ant = it.resourceId && antigas.get(it.resourceId);
        const out: any = { id: it.id, title: it.title, type: it.type, url: it.url, resourceId: it.resourceId, tags: it.tags,
          items: (it.items || []).map((x: any) => troca(x, menu)) };
        if (ant) {
          plano.push({ menu, item: it.title, de: "/pages/" + ant.handle, para: ant.destino });
          out.type = "HTTP"; out.url = ant.destino; delete out.resourceId;
        }
        if (out.type !== "HTTP") delete out.url;
        if (!out.resourceId) delete out.resourceId;
        return out;
      };
      const menusNovos = mn.menus.nodes.map((m: any) => ({ m, items: m.items.map((x: any) => troca(x, m.title)) }));
      // menu do rodapé com links de atendimento ganha "Central de Ajuda" no topo, se ainda não tiver
      for (const x of menusNovos) {
        const temAntiga = plano.some((p) => p.menu === x.m.title);
        const jaTem = JSON.stringify(x.items).includes(CA + '"') || x.items.some((i: any) => /central de ajuda/i.test(i.title));
        if (temAntiga && !jaTem) { x.items.unshift({ title: "Central de Ajuda", type: "HTTP", url: CA, items: [] }); plano.push({ menu: x.m.title, item: "Central de Ajuda", de: "(novo)", para: CA }); }
        const AP = "/pages/acompanhe-seu-pedido";
        const temAcomp = JSON.stringify(x.items).includes(AP) || x.items.some((i: any) => /acompanhe/i.test(i.title));
        if ((temAntiga || jaTem) && !temAcomp) { x.items.splice(1, 0, { title: "Acompanhe seu pedido", type: "HTTP", url: AP, items: [] }); plano.push({ menu: x.m.title, item: "Acompanhe seu pedido", de: "(novo)", para: AP }); }
      }
      const paginas = [...antigas.values()].map((p) => ({ pagina: p.title, url: "/pages/" + p.handle, publicada: p.isPublished, redireciona_para: p.destino }));
      if (!b.aplicar) return resp(200, { ok: true, aplicado: false, links: plano, paginas_antigas: paginas });

      const erros: string[] = [];
      for (const x of menusNovos) {
        if (!plano.some((p) => p.menu === x.m.title)) continue;
        try {
          const d: any = await gql(`mutation($id: ID!, $t: String!, $h: String, $i: [MenuItemUpdateInput!]!) {
              menuUpdate(id: $id, title: $t, handle: $h, items: $i) { menu { id } userErrors { message } } }`,
            { id: x.m.id, t: x.m.title, h: x.m.handle, i: x.items });
          const e = d.menuUpdate.userErrors; if (e.length) throw new Error(e[0].message);
        } catch (e) { erros.push("menu " + x.m.title + ": " + String((e as Error).message || e).slice(0, 200)); }
      }
      for (const p of antigas.values()) {
        try {
          const d: any = await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { page { id } userErrors { message } } }`, { id: p.id, p: { isPublished: false } });
          const e = d.pageUpdate.userErrors; if (e.length) throw new Error(e[0].message);
          const r: any = await gql(`mutation($r: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $r) { urlRedirect { id } userErrors { message } } }`, { r: { path: "/pages/" + p.handle, target: p.destino } });
          const e2 = r.urlRedirectCreate.userErrors; if (e2.length && !/taken|already/i.test(e2[0].message)) throw new Error(e2[0].message);
        } catch (e) { erros.push("página " + p.title + ": " + String((e as Error).message || e).slice(0, 200)); }
      }
      return resp(200, { ok: true, aplicado: true, links: plano, paginas_antigas: paginas, erros });
    }

    if (b.acao === "ativar") {
      const hs: string[] = (Array.isArray(b.handles) ? b.handles : []).slice(0, 50).map((h: any) => String(h).replace(/[\s"'\\]/g, "")).filter(Boolean);
      const st = b.ativo === false ? "DRAFT" : "ACTIVE";
      const resultados: any[] = [];
      const um = async (h: string) => {
        try {
          // busca exata pelo handle (aceita handles com º, ™ etc.)
          const q: any = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id handle status } }`, { h });
          const p = q.productByIdentifier;
          if (!p) throw new Error("não está no Shopify");
          if (p.status !== st) {
            const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id } userErrors { message } } }`, { p: { id: p.id, status: st } });
            const e = d.productUpdate.userErrors; if (e.length) throw new Error(e[0].message);
            await admin.from("produtos").update({ ativo: st === "ACTIVE", site_status: st.toLowerCase() }).eq("shopify_product_id", p.id.split("/").pop());
          }
          resultados.push({ handle: h, ok: true, mudou: p.status !== st });
        } catch (e) { resultados.push({ handle: h, ok: false, erro: String((e as Error).message || e).slice(0, 200) }); }
      };
      for (let i = 0; i < hs.length; i += 5) await Promise.all(hs.slice(i, i + 5).map(um));
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "fotos_refazer") {
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 40);
      const { data: filas } = await admin.from("fotos_fila").select("id,handle,status,fotos").in("handle", itens.map((i: any) => String(i.handle)));
      const porH = new Map((filas || []).map((f: any) => [f.handle, f]));
      const agora = new Date().toISOString();
      const resultados: any[] = [];
      const um = async (it: any) => {
        const f: any = porH.get(it.handle);
        try {
          if (it.ok) {
            const fotos = (it.fotos || []).filter((u: string) => /^https:\/\//.test(u)).slice(0, 20);
            const obs = "Confirmado: mesmo produto, mesmo tamanho e rótulo conferido na foto";
            const mesma = f && f.status === "aplicada" && JSON.stringify(f.fotos) === JSON.stringify(fotos);
            const row = { handle: it.handle, marca: it.marca ?? null, titulo: it.titulo ?? null, fonte_titulo: it.oficial ?? null, fonte_url: it.url ?? null,
              fotos, score: 1, obs, status: mesma ? "aplicada" : "pendente", decidido_por: null, decidido_em: null };
            if (f) await admin.from("fotos_fila").update(row).eq("id", f.id); else await admin.from("fotos_fila").insert(row);
            resultados.push({ handle: it.handle, ok: true });
            return;
          }
          let obs = "Fora da fila: " + String(it.motivo || "não confirmado").slice(0, 200) + ". Continua com a foto atual.";
          let restaurada = false, status = "rejeitada";
          if (f && f.status === "aplicada") {
            const orig = (it.fotos_originais || []).filter((u: string) => /^https:\/\//.test(u));
            if (orig.length) {
              try { await trocarFotos({ handle: it.handle, fotos: orig }); restaurada = true; obs = "Foto original restaurada. Motivo: " + String(it.motivo || "").slice(0, 200); }
              catch (e) { status = "erro"; obs = "PRECISA RESTAURAR a foto original (" + String((e as Error).message || e).slice(0, 120) + "). Motivo: " + String(it.motivo || "").slice(0, 150); }
            } else { status = "erro"; obs = "PRECISA RESTAURAR: não achei a foto original. Motivo: " + String(it.motivo || "").slice(0, 150); }
          }
          if (f) await admin.from("fotos_fila").update({ status, obs, decidido_por: "regra rígida", decidido_em: agora }).eq("id", f.id);
          resultados.push({ handle: it.handle, ok: status !== "erro", restaurada });
        } catch (e) { resultados.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 200) }); }
      };
      for (let i = 0; i < itens.length; i += 5) await Promise.all(itens.slice(i, i + 5).map(um));
      return resp(200, { ok: true, resultados });
    }

    if (b.acao === "pesos") {
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 100).filter((i: any) => i?.sku && Number(i.peso_g) > 0);
      const { data: prods } = await admin.from("produtos").select("sku,shopify_product_id,shopify_variant_id")
        .in("sku", itens.map((i: any) => String(i.sku))).not("shopify_variant_id", "is", null);
      const porSku = new Map((prods || []).map((p: any) => [p.sku, p]));
      const porProduto = new Map<string, any[]>();
      const resultados: any[] = [];
      for (const i of itens) {
        const p: any = porSku.get(String(i.sku));
        if (!p) { resultados.push({ sku: i.sku, ok: false, erro: "SKU não está no catálogo sincronizado" }); continue; }
        const g = Math.round(Number(i.peso_g));
        const dim = Array.isArray(i.dim) && i.dim.length === 3 && i.dim.every((x: any) => Number(x) > 0)
          ? i.dim.map((x: any) => String(Math.round(Number(x) * 10) / 10).replace(".", ",")).join(" × ") + " cm" : "";
        const v: any = { id: "gid://shopify/ProductVariant/" + p.shopify_variant_id, inventoryItem: { measurement: { weight: { value: g, unit: "GRAMS" } } } };
        if (dim) v.metafields = [{ namespace: "custom", key: "dimensoes_cm", type: "single_line_text_field", value: dim }];
        if (!porProduto.has(p.shopify_product_id)) porProduto.set(p.shopify_product_id, []);
        porProduto.get(p.shopify_product_id)!.push({ sku: i.sku, g, v });
      }
      const umProduto = async ([pid, vs]: [string, any[]]) => {
        try {
          const d: any = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`,
            { pid: "gid://shopify/Product/" + pid, v: vs.map((x) => x.v) });
          const e = d.productVariantsBulkUpdate.userErrors;
          if (e.length) throw new Error(e[0].message);
          for (const x of vs) {
            await admin.from("produtos").update({ peso_g: x.g }).eq("sku", x.sku);
            resultados.push({ sku: x.sku, ok: true });
          }
        } catch (e) {
          for (const x of vs) resultados.push({ sku: x.sku, ok: false, erro: String((e as Error).message || e).slice(0, 200) });
        }
      };
      const fila = [...porProduto.entries()];
      for (let i = 0; i < fila.length; i += 5) await Promise.all(fila.slice(i, i + 5).map(umProduto)); // 5 produtos por vez
      return resp(200, { ok: true, resultados });
    }

    return resp(400, { erro: "ação desconhecida" });
  } catch (e) {
    console.error(b?.acao, e);
    return resp(502, { erro: "O Shopify não respondeu como esperado: " + String((e as Error).message || e).slice(0, 300) });
  }
});

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
//   { acao: "marca_publicar", marca?, aplicar? } → página Marcas com todas as marcas no ar (+ imagem) e fichas da Bomi da marca
//   { acao: "link_curto", slug, apagar? }   → ohmygirl.com.br/a/<slug> (link curto das parcerias, conta cliques)
//   { acao: "cupons_listar" }               → todos os cupons de código do Shopify (para importar no ERP)
//   { acao: "tema_duplicar" | "tema_copiar" | "colecao_criar" | "menu_arvore" } → ver cada bloco abaixo
//   { acao: "conc_ler", urls: [..] }                 → lê preço da KS/Jini (até 20 links) e grava em conc_catalogo
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
      // cupom: { codigo, tipo: "%"|"R$"|"frete", valor, teto? (frete), minimo?, publico: "todas"|"primeira"|"clientes", emails?: [], uma_vez?, limite_total?, inicio?, fim?, titulo? }
      const c = b.cupom || {};
      const codigo = String(c.codigo || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (codigo.length < 3) return resp(400, { erro: "código precisa de ao menos 3 letras ou números" });
      const frete = c.tipo === "frete";
      const valor = Number(c.valor);
      if (!frete && !(valor > 0)) return resp(400, { erro: "valor do desconto inválido" });
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
      if (frete) {
        // Frete grátis: zera o frete em qualquer região (destino Brasil). Teto opcional: só vale se o frete for até c.teto.
        delete base.customerGets;
        base.destination = { countries: { add: ["BR"], includeRestOfWorld: false } };
        if (Number(c.teto) > 0) base.maximumShippingPrice = Number(c.teto).toFixed(2);
        base.combinesWith = { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false };
      }
      const M = frete
        ? `mutation($d: DiscountCodeFreeShippingInput!) { discountCodeBasicCreate: discountCodeFreeShippingCreate(freeShippingCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }`
        : `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }`;
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

    if (b.acao === "tema_duplicar") {
      // Cópia de segurança do tema publicado inteiro (fica em Loja virtual › Temas, não publicada). { nome? }
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      const d: any = await gql(`mutation($id: ID!, $n: String) { themeDuplicate(id: $id, name: $n) { newTheme { id name } userErrors { message } } }`,
        { id: tema.id, n: String(b.nome || ("Cópia " + tema.name)).slice(0, 50) });
      const e = d.themeDuplicate.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      return resp(200, { ok: true, copia: d.themeDuplicate.newTheme });
    }

    if (b.acao === "tema_copiar") {
      // Guarda arquivos do tema publicado na tabela tema_backup (para consulta). { arquivos: [..] }
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      const d: any = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 50) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`, { id: tema.id, f: b.arquivos });
      const rows = d.theme.files.nodes.map((f: any) => ({ arquivo: f.filename, conteudo: f.body?.content ?? null }));
      if (rows.length) await admin.from("tema_backup").insert(rows);
      return resp(200, { ok: true, copiados: rows.map((r: any) => r.arquivo) });
    }

    if (b.acao === "colecao_criar") {
      // Cria (ou atualiza) coleção automática por regra e publica na loja.
      // { handle, titulo, descricao?, ou?: true, regras: [{ column: "TITLE"|"TAG"|"VENDOR"|"TYPE"|"VARIANT_PRICE"…, relation: "CONTAINS"|"EQUALS"…, condition }], ordem?: "BEST_SELLING"|"CREATED_DESC"… }
      const ruleSet = { appliedDisjunctively: !!b.ou, rules: (b.regras || []).map((r: any) => ({ column: r.column, relation: r.relation, condition: String(r.condition) })) };
      const q: any = await gql(`query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id } }`, { h: String(b.handle) });
      const ex = q.collectionByIdentifier;
      const input: any = { title: String(b.titulo), handle: String(b.handle), ruleSet, sortOrder: b.ordem || "BEST_SELLING" };
      if (b.descricao !== undefined) input.descriptionHtml = String(b.descricao);
      let id: string;
      if (ex) {
        const d: any = await gql(`mutation($i: CollectionInput!) { collectionUpdate(input: $i) { collection { id } userErrors { message } } }`, { i: { ...input, id: ex.id } });
        if (d.collectionUpdate.userErrors.length) return resp(422, { erro: d.collectionUpdate.userErrors[0].message });
        id = ex.id;
      } else {
        const d: any = await gql(`mutation($i: CollectionInput!) { collectionCreate(input: $i) { collection { id } userErrors { message } } }`, { i: input });
        if (d.collectionCreate.userErrors.length) return resp(422, { erro: d.collectionCreate.userErrors[0].message });
        id = d.collectionCreate.collection.id;
      }
      // publica em todos os canais (loja virtual incluída)
      let publicada = "nao_tentou";
      try {
        const pubs: any = await gql(`{ publications(first: 20) { nodes { id name } } }`);
        await gql(`mutation($id: ID!, $p: [PublicationInput!]!) { publishablePublish(id: $id, input: $p) { userErrors { message } } }`,
          { id, p: pubs.publications.nodes.map((p: any) => ({ publicationId: p.id })) });
        publicada = "sim";
      } catch (e) { publicada = "sem permissão (" + String((e as Error).message || e).slice(0, 80) + ")"; }
      const c: any = await gql(`query($id: ID!) { collection(id: $id) { handle productsCount { count } } }`, { id });
      return resp(200, { ok: true, criada: !ex, publicada, handle: c.collection.handle, produtos: c.collection.productsCount?.count ?? null });
    }

    if (b.acao === "colecao_titulo") {
      // Só troca o título de coleções (manuais ou automáticas). { itens: [{ handle, titulo }] }
      const res: any[] = [];
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 30)) {
        const q: any = await gql(`query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id } }`, { h: String(it.handle) });
        const id = q.collectionByIdentifier?.id; if (!id) { res.push({ handle: it.handle, ok: false, erro: "não encontrada" }); continue; }
        const d: any = await gql(`mutation($i: CollectionInput!) { collectionUpdate(input: $i) { userErrors { message } } }`, { i: { id, title: String(it.titulo) } });
        const e = d.collectionUpdate.userErrors; res.push({ handle: it.handle, ok: !e.length, erro: e[0]?.message });
      }
      return resp(200, { ok: true, res });
    }

    if (b.acao === "menu_arvore") {
      // Cria ou substitui um menu com subitens: { handle, titulo, itens: [{ titulo, url, itens?: [{ titulo, url, itens? }] }] }
      const conv = (i: any): any => ({ title: String(i.titulo), type: "HTTP", url: String(i.url), items: (Array.isArray(i.itens) ? i.itens : []).map(conv) });
      const itens = (Array.isArray(b.itens) ? b.itens : []).map(conv);
      const q: any = await gql(`{ menus(first: 50) { nodes { id handle } } }`);
      const ex = q.menus.nodes.find((m: any) => m.handle === b.handle);
      const d: any = ex
        ? await gql(`mutation($id: ID!, $t: String!, $h: String, $i: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $t, handle: $h, items: $i) { menu { id handle } userErrors { message } } }`, { id: ex.id, t: String(b.titulo), h: b.handle, i: itens })
        : await gql(`mutation($t: String!, $h: String!, $i: [MenuItemCreateInput!]!) { menuCreate(title: $t, handle: $h, items: $i) { menu { id handle } userErrors { message } } }`, { t: String(b.titulo), h: String(b.handle), i: itens });
      const r = d.menuUpdate || d.menuCreate;
      if (r.userErrors.length) return resp(422, { erro: r.userErrors.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, menu: r.menu, criado: !ex });
    }

    if (b.acao === "tema_gravar") {
      // Grava arquivos no tema publicado. b.arquivos: [{ nome, conteudo }]. Guarda cópia do original em tema_backup (Supabase).
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      const arqs = (Array.isArray(b.arquivos) ? b.arquivos : []).slice(0, 10);
      const ant: any = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 50) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`, { id: tema.id, f: arqs.map((a: any) => a.nome) });
      const backup = ant.theme.files.nodes.map((f: any) => ({ nome: f.filename, conteudo: f.body?.content ?? null }));
      if (backup.length) await admin.from("tema_backup").insert(backup.map((x: any) => ({ arquivo: x.nome, conteudo: x.conteudo })));
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

    if (b.acao === "cupons_listar") {
      // Todos os cupons com código do Shopify (inclusive os criados direto no admin): para o ERP importar e sincronizar o status.
      const out: any[] = []; let a: string | null = null;
      do {
        const d: any = await gql(`query($a: String) { codeDiscountNodes(first: 100, after: $a) { nodes { id codeDiscount {
            __typename
            ... on DiscountCodeBasic { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount codes(first: 3) { nodes { code } }
              customerGets { value { ... on DiscountAmount { amount { amount } } ... on DiscountPercentage { percentage } } }
              minimumRequirement { ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } } }
            ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount codes(first: 3) { nodes { code } }
              maximumShippingPrice { amount } minimumRequirement { ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } } }
            ... on DiscountCodeBxgy { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount codes(first: 3) { nodes { code } } }
          } } pageInfo { hasNextPage endCursor } } }`, { a });
        for (const n of d.codeDiscountNodes.nodes) {
          const c = n.codeDiscount || {}; const v = c.customerGets?.value || {};
          for (const cd of c.codes?.nodes || []) out.push({
            id: n.id, codigo: cd.code, titulo: c.title, tipo_shopify: c.__typename, status: c.status,
            inicio: c.startsAt, fim: c.endsAt, limite: c.usageLimit, uma_vez: c.appliesOncePerCustomer, usos: c.asyncUsageCount,
            valor_tipo: v.percentage != null ? "%" : v.amount ? "R$" : c.__typename === "DiscountCodeFreeShipping" ? "frete" : "",
            valor: v.percentage != null ? Math.round(Number(v.percentage) * 10000) / 100 : v.amount ? Number(v.amount.amount) : c.maximumShippingPrice ? Number(c.maximumShippingPrice.amount) : null,
            minimo: c.minimumRequirement?.greaterThanOrEqualToSubtotal ? Number(c.minimumRequirement.greaterThanOrEqualToSubtotal.amount) : null,
          });
        }
        a = d.codeDiscountNodes.pageInfo.hasNextPage ? d.codeDiscountNodes.pageInfo.endCursor : null;
      } while (a);
      return resp(200, { ok: true, cupons: out });
    }

    if (b.acao === "cupom_apagar") {
      const id = String(b.id || "");
      if (!id.startsWith("gid://shopify/DiscountCodeNode/")) return resp(400, { erro: "cupom sem ligação com o Shopify" });
      const d: any = await gql(`mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { message } } }`, { id });
      const e = d.discountCodeDelete.userErrors; if (e.length) return resp(422, { erro: e[0].message });
      return resp(200, { ok: true });
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

    if (b.acao === "conc_ler") {
      // Lê o preço de páginas da KS e da Jini (link colado na Precificação) e grava em conc_catalogo.
      const urls: string[] = (Array.isArray(b.urls) ? b.urls : []).map((u: string) => String(u).trim().replace(/[?#].*$/, ""))
        .filter((u: string) => /^https:\/\/(kscosmeticos|jinicosmeticos)\.com\.br\/(produtos|kits)\//i.test(u)).slice(0, 20);
      const norm = (u: string) => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
      const num = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return x > 0 ? x : null; };
      const resultados = [];
      for (const url of urls) {
        try {
          const loja = /kscosmeticos/i.test(url) ? "ks" : "jini";
          const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36", "accept-language": "pt-BR" } });
          if (!r.ok) throw new Error("página respondeu " + r.status);
          const t = await r.text();
          const prods: any[] = [];
          for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
            let j: any; try { j = JSON.parse(m[1].trim()); } catch { continue; }
            const pilha = Array.isArray(j) ? [...j] : [j];
            while (pilha.length) { const o = pilha.pop(); if (o && typeof o === "object") { if (o["@type"] === "Product") prods.push(o); if (Array.isArray(o["@graph"])) pilha.push(...o["@graph"]); } }
          }
          const ofr = (o: any) => Array.isArray(o?.offers) ? o.offers[0] || {} : o?.offers || {};
          let p = prods.find((o) => [ofr(o).url, o?.mainEntityOfPage?.["@id"], o?.url].some((x) => x && norm(x) === norm(url)));
          if (!p && loja === "ks") p = prods[0];
          let nome = p?.name ?? null, marca = typeof p?.brand === "object" ? p?.brand?.name : p?.brand ?? null;
          let preco = num(ofr(p).price ?? ofr(p).lowPrice), de: number | null = null;
          let esgotado = /OutOfStock/.test(String(ofr(p).availability ?? ""));
          if (loja === "jini") {
            const mp = t.match(/<meta property="nuvemshop:price" content="([\d.,]+)"/); if (!preco && mp) preco = num(mp[1]);
            const mc = t.match(/"compare_at_price_number":\s*([\d.]+)/); if (mc) de = num(mc[1]);
            if (!nome) { const mt = t.match(/<meta property="og:title" content="([^"]+)"/); nome = mt ? mt[1] : null; }
            if (!marca && nome && nome.includes(" - ")) marca = nome.split(" - ")[0].trim();
          } else {
            const ml = t.match(/line-through[^>]*>\s*R\$\s*([\d.]+,\d{2})/); if (ml) de = num(ml[1].replace(/\./g, "").replace(",", "."));
          }
          if (de && preco && de <= preco) de = null;
          if (!preco) throw new Error("preço não encontrado na página");
          const { data: ant } = await admin.from("conc_catalogo").select("preco").eq("url", url).maybeSingle();
          const mudou = ant && Number(ant.preco) !== preco;
          const row: Record<string, unknown> = { url, loja, nome, marca, preco, preco_de: de, esgotado, ativo: true, lido_em: new Date().toISOString() };
          if (mudou) { row.preco_ant = Number(ant!.preco); row.mudou_em = new Date().toISOString(); }
          const { error } = await admin.from("conc_catalogo").upsert(row, { onConflict: "url" });
          if (error) throw new Error(error.message);
          resultados.push({ url, ok: true, preco, nome });
        } catch (e) { resultados.push({ url, ok: false, erro: String((e as Error).message || e).slice(0, 160) }); }
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

    if (b.acao === "status_lote") {
      // Muda o status de vários produtos: { ids: [id numérico], status: "ACTIVE" | "DRAFT" | "ARCHIVED" } (até 50).
      const st = String(b.status || "").toUpperCase();
      if (!["ACTIVE", "DRAFT", "ARCHIVED"].includes(st)) return resp(400, { erro: "status inválido" });
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x: string) => /^\d+$/.test(x)).slice(0, 50);
      const res: any[] = [];
      const um = async (id: string) => {
        try {
          const d: any = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id status } userErrors { message } } }`, { p: { id: "gid://shopify/Product/" + id, status: st } });
          const e = d.productUpdate.userErrors; if (e.length) throw new Error(e[0].message);
          await admin.from("produtos").update({ ativo: st === "ACTIVE", site_status: st.toLowerCase() }).eq("shopify_product_id", id);
          res.push({ id, ok: true });
        } catch (e) { res.push({ id, ok: false, erro: String((e as Error).message || e).slice(0, 160) }); }
      };
      for (let i = 0; i < ids.length; i += 5) await Promise.all(ids.slice(i, i + 5).map(um));
      return resp(200, { ok: true, status: st, res });
    }

    if (b.acao === "catalogo") {
      // Raio-x do catálogo: todos os produtos (qualquer status), 250 por chamada (b.after).
      const d: any = await gql(`query($a: String) { products(first: 250, after: $a) { nodes { legacyResourceId handle title vendor status productType tags totalInventory
          mediaCount { count } variantsCount { count } priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } } } pageInfo { hasNextPage endCursor } } }`, { a: b.after ?? null });
      const rows = d.products.nodes.map((p: any) => [p.handle, p.title, p.vendor, p.status, p.productType,
        (p.tags || []).filter((t: string) => /^cat[-:]|duplicata/.test(t)).join("|"), p.mediaCount?.count ?? 0, p.variantsCount?.count ?? 0,
        Number(p.priceRangeV2?.minVariantPrice?.amount ?? 0), Number(p.priceRangeV2?.maxVariantPrice?.amount ?? 0), String(p.legacyResourceId)]);
      return resp(200, { ok: true, cols: ["handle","titulo","marca","status","tipo","tags","fotos","skus","preco_min","preco_max","id"], rows, proximo: d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null });
    }

    if (b.acao === "marca_publicar") {
      // Publica uma marca no site depois de ativar os produtos:
      //   1) página Marcas (templates/page.marcas.json) passa a ter um cartão para cada marca com produto no ar, na ordem de quantidade;
      //   2) imagem assets/marca-<slug>.webp: se faltar no tema, copia de site/marcas/cenas/<slug>.webp do repositório (se existir);
      //   3) fichas da Bomi da marca (tabela bomi_fichas_extra), feitas da descrição dos produtos ativos.
      // { acao: "marca_publicar", marca?: "MEDIHEAL", aplicar?: true }  (sem aplicar: só mostra o plano)
      const IGNORAR = new Set(["mundo beleza"]);
      const slug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      // 1) contagem de ativos por marca
      const cont: Record<string, number> = {}; let a: string | null = null;
      do {
        const d: any = await gql(`query($a: String) { products(first: 250, after: $a, query: "status:active") { nodes { vendor } pageInfo { hasNextPage endCursor } } }`, { a });
        for (const p of d.products.nodes) { const v = String(p.vendor || "").trim(); if (v && !IGNORAR.has(v.toLowerCase())) cont[v] = (cont[v] || 0) + 1; }
        a = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
      } while (a);
      const t: any = await gql(`{ themes(first: 1, roles: [MAIN]) { nodes { id name } } }`);
      const tema = t.themes.nodes[0]; if (!tema) throw new Error("sem tema publicado");
      const ARQ = "templates/page.marcas.json";
      const lido: any = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 1) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`, { id: tema.id, f: [ARQ] });
      const original = lido.theme.files.nodes[0]?.body?.content; if (!original) throw new Error("não achei " + ARQ);
      const tpl = JSON.parse(original.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));
      const sec = tpl.sections.marcas; if (!sec) throw new Error("seção marcas não encontrada no template");
      const antes: Record<string, any> = {};
      for (const id of sec.block_order || Object.keys(sec.blocks || {})) { const bl = sec.blocks[id]; if (bl) antes[String(bl.settings?.fornecedor || bl.settings?.nome || "").toLowerCase()] = { id, bl }; }
      // imagens já no tema
      const temImg = new Set<string>(); a = null;
      do {
        const d: any = await gql(`query($id: ID!, $a: String) { theme(id: $id) { files(first: 250, after: $a, filenames: ["assets/marca-*"]) { nodes { filename } pageInfo { hasNextPage endCursor } } } }`, { id: tema.id, a });
        d.theme.files.nodes.forEach((f: any) => temImg.add(f.filename));
        a = d.theme.files.pageInfo.hasNextPage ? d.theme.files.pageInfo.endCursor : null;
      } while (a);
      const marcas = Object.entries(cont).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      const blocks: Record<string, any> = {}, ordem: string[] = [], novas: string[] = [], imagensNovas: { nome: string; base64: string }[] = [], semImagem: string[] = [];
      for (const [v] of marcas) {
        const ex = antes[v.toLowerCase()];
        const sl = slug(v);
        let arquivo = ex?.bl.settings?.arquivo || "";
        if (!ex?.bl.settings?.logo && (!arquivo || !temImg.has("assets/marca-" + arquivo))) {
          arquivo = "";
          if (temImg.has(`assets/marca-${sl}.webp`)) arquivo = sl + ".webp";
          else {
            const r = await fetch(`https://raw.githubusercontent.com/brunotae/omg-erp/main/site/marcas/cenas/${sl}.webp`);
            if (r.ok) {
              const buf = new Uint8Array(await r.arrayBuffer()); let bin = "";
              for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              imagensNovas.push({ nome: `assets/marca-${sl}.webp`, base64: btoa(bin) }); arquivo = sl + ".webp";
            } else semImagem.push(v);
          }
        }
        const id = ex?.id || "marca_" + sl.replace(/-/g, "_");
        blocks[id] = { ...(ex?.bl || { type: "marca" }), settings: { ...(ex?.bl.settings || { nome: v, fornecedor: v, link: "" }), arquivo } };
        ordem.push(id); if (!ex) novas.push(v);
      }
      const saem = Object.keys(antes).filter((k) => !marcas.some(([v]) => v.toLowerCase() === k));
      // fichas da Bomi da marca escolhida
      let fichas: any[] = [];
      if (b.marca) {
        const SECOES = ["Descrição", "O que vem", "O que vem no kit", "Benefícios", "Indicado para", "Como usar", "Ingredientes principais", "Ingredientes", "Textura", "Cuidados", "Dica"];
        const ent = (x: string) => x.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
        const texto = (h: string) => ent(String(h || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<(br|\/p|\/li|\/h\d|\/summary|\/div)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<[^>]+>/g, " "))
          .replace(/[ \t\r\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
        const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        a = null;
        do {
          const d: any = await gql(`query($a: String, $q: String) { products(first: 100, after: $a, query: $q) { nodes { handle title vendor productType tags descriptionHtml variants(first: 50) { nodes { price } } } pageInfo { hasNextPage endCursor } } }`,
            { a, q: `status:active AND vendor:"${String(b.marca).replace(/"/g, "")}"` });
          for (const p of d.products.nodes) {
            if (p.vendor.toLowerCase() !== String(b.marca).toLowerCase()) continue;
            const secoes: Record<string, string[]> = {}; let atual = "Descrição";
            for (const l of texto(p.descriptionHtml).split("\n").map((x) => x.trim()).filter(Boolean)) { if (SECOES.includes(l)) { atual = l; continue; } (secoes[atual] ||= []).push(l); }
            const pr = [...new Set(p.variants.nodes.map((x: any) => Number(x.price)))].sort((x: any, y: any) => x - y) as number[];
            fichas.push({ handle: p.handle, nome: p.title, marca: p.vendor, tipo: p.productType || "", tags: (p.tags || []).join(", "),
              preco: pr.length ? brl(pr[0]) : "", preco_max: pr.length > 1 ? brl(pr[pr.length - 1]) : "",
              secoes: Object.fromEntries(Object.entries(secoes).map(([k, v]) => [k, v.join(" ").slice(0, 700)])) });
          }
          a = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
        } while (a);
      }
      const plano = { marcas: marcas.length, ordem: marcas.map(([v, n]) => v + " (" + n + ")"), novas, saem, imagens_novas: imagensNovas.map((x) => x.nome), sem_imagem: semImagem, fichas: fichas.length };
      if (!b.aplicar) return resp(200, { ok: true, aplicado: false, ...plano });
      sec.blocks = blocks; sec.block_order = ordem;
      const arqs = [...imagensNovas.map((x) => ({ filename: x.nome, body: { type: "BASE64", value: x.base64 } })), { filename: ARQ, body: { type: "TEXT", value: JSON.stringify(tpl, null, 2) } }];
      await admin.from("tema_backup").insert({ arquivo: ARQ, conteudo: original });
      const g: any = await gql(`mutation($id: ID!, $f: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $id, files: $f) { upsertedThemeFiles { filename } userErrors { filename message } } }`, { id: tema.id, f: arqs });
      const ue = g.themeFilesUpsert.userErrors; if (ue.length) return resp(422, { erro: ue.map((x: any) => x.filename + ": " + x.message).join("; ") });
      if (fichas.length) {
        await admin.from("bomi_fichas_extra").delete().eq("marca", String(fichas[0].marca));
        const { error } = await admin.from("bomi_fichas_extra").upsert(fichas.map((f) => ({ handle: f.handle, marca: f.marca, ficha: f, atualizado: new Date().toISOString() })));
        if (error) return resp(500, { erro: "página ok, mas fichas da Bomi falharam: " + error.message, ...plano });
      }
      return resp(200, { ok: true, aplicado: true, ...plano });
    }

    if (b.acao === "link_curto") {
      // Link curto das parcerias: cria (ou apaga) o redirecionamento ohmygirl.com.br/a/<slug> → função "ir" (conta o clique e põe a UTM).
      // { acao: "link_curto", slug, apagar?: true }
      const slug = String(b.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) return resp(400, { erro: "código do link inválido" });
      const path = "/a/" + slug, alvo = URL_SB + "/functions/v1/ir?l=" + slug;
      const d: any = await gql(`query($q: String) { urlRedirects(first: 5, query: $q) { nodes { id path target } } }`, { q: `path:${path}` });
      const ex = d.urlRedirects.nodes.find((r: any) => r.path === path);
      if (b.apagar) {
        if (ex) await gql(`mutation($id: ID!) { urlRedirectDelete(id: $id) { userErrors { message } } }`, { id: ex.id });
        return resp(200, { ok: true, apagado: !!ex });
      }
      if (ex && ex.target === alvo) return resp(200, { ok: true, path, ja_existia: true });
      const m: any = ex
        ? await gql(`mutation($id: ID!, $r: UrlRedirectInput!) { urlRedirectUpdate(id: $id, urlRedirect: $r) { urlRedirect { path target } userErrors { message } } }`, { id: ex.id, r: { path, target: alvo } })
        : await gql(`mutation($r: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $r) { urlRedirect { path target } userErrors { message } } }`, { r: { path, target: alvo } });
      const r = ex ? m.urlRedirectUpdate : m.urlRedirectCreate;
      if (r.userErrors.length) return resp(422, { erro: r.userErrors.map((x: any) => x.message).join("; ") });
      return resp(200, { ok: true, path: r.urlRedirect.path, target: r.urlRedirect.target });
    }

    if (b.acao === "colecao_imagem") {
      // Troca a imagem de capa de coleções (cartões "Por onde você quer começar" da home). { itens: [{ handle, src, alt }] }
      const res: any[] = [];
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 20)) {
        try {
          const c: any = await gql(`query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id title image { url } } }`, { h: String(it.handle) });
          const col = c.collectionByIdentifier; if (!col) throw new Error("coleção não encontrada");
          const d: any = await gql(`mutation($i: CollectionInput!) { collectionUpdate(input: $i) { collection { image { url } } userErrors { message } } }`,
            { i: { id: col.id, image: { src: String(it.src), altText: String(it.alt || col.title).slice(0, 200) } } });
          const e = d.collectionUpdate.userErrors; if (e.length) throw new Error(e[0].message);
          res.push({ handle: it.handle, ok: true, antes: col.image?.url || null, depois: d.collectionUpdate.collection.image?.url || null });
        } catch (e) { res.push({ handle: it.handle, ok: false, erro: String((e as Error).message || e).slice(0, 200) }); }
      }
      return resp(200, { ok: true, res });
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

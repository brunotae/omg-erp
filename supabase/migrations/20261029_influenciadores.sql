-- OMG ERP · 06 · Influenciadores, links UTM, cliques e comissões (29/10/2026)
-- Aditivo: não mexe em nada existente.
-- Regras:
--   venda do influenciador = cupom dele (ganha) ou, sem cupom dele, o link dele (ref=<slug> ou utm_content=<codigo>)
--   base da comissão = produtos − desconto − imposto embutido no preço (sem frete); cancelada ou com devolução não conta
--   fechamento mensal: comissoes_fechar('AAAA-MM'); pedido devolvido depois de fechado vira ajuste negativo no próximo fechamento

create table if not exists public.influenciadores (
  id            uuid primary key default gen_random_uuid(),
  codigo        text unique not null check (codigo ~ '^[a-z0-9-]{2,30}$'),
  nome          text not null,
  arroba        text not null default '',
  email         text unique check (email is null or email = lower(email)),
  telefone      text not null default '',
  cupom         text not null default '',
  comissao_pct  numeric not null default 10 check (comissao_pct >= 0 and comissao_pct <= 100),
  ativo         boolean not null default true,
  inicio        date,
  fim           date,
  pix_tipo      text not null default '',
  pix_chave     text not null default '',
  titular       text not null default '',
  documento     text not null default '',
  banco         text not null default '',
  agencia       text not null default '',
  conta         text not null default '',
  pagamento_atualizado timestamptz,
  parceiro      uuid references public.fornecedores(id) on delete set null,
  obs           text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.links_utm (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome          text not null default '',
  influenciador uuid references public.influenciadores(id) on delete set null,
  destino       text not null default '/',
  utm_source    text not null default '',
  utm_medium    text not null default '',
  utm_campaign  text not null default '',
  utm_content   text not null default '',
  utm_term      text not null default '',
  ativo         boolean not null default true,
  inicio        date,
  fim           date,
  custo         numeric,
  obs           text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.link_cliques (
  id        bigserial primary key,
  link      uuid not null references public.links_utm(id) on delete cascade,
  em        timestamptz not null default now(),
  visitante text not null default '',   -- hash diário anônimo (IP + navegador), só para contar pessoas únicas
  origem    text not null default ''    -- site de onde veio (referer), sem parâmetros
);
create index if not exists link_cliques_link_em on public.link_cliques (link, em);

create table if not exists public.comissoes_fechamentos (
  id            uuid primary key default gen_random_uuid(),
  influenciador uuid not null references public.influenciadores(id) on delete cascade,
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),
  pct           numeric not null,
  pedidos       integer not null default 0,
  base          numeric not null default 0,
  valor         numeric not null default 0,
  ajuste        numeric not null default 0,
  total         numeric not null default 0,
  vendas        jsonb not null default '[]'::jsonb,  -- [{id, pedido, base, comissao}]
  estornos      jsonb not null default '[]'::jsonb,  -- [{id, pedido, comissao}] pedidos de meses anteriores devolvidos/cancelados depois
  status        text not null default 'A pagar' check (status in ('A pagar','Pago')),
  pago_em       date,
  forma         text not null default '',
  obs           text not null default '',
  anexos        jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (influenciador, mes)
);

do $$ declare t text; begin
  foreach t in array array['influenciadores','links_utm','link_cliques','comissoes_fechamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros veem" on public.%I', t);
    execute format('create policy "membros veem" on public.%I for select using (public.eh_membro())', t);
    if t <> 'link_cliques' then
      execute format('drop policy if exists "editores criam" on public.%I', t);
      execute format('drop policy if exists "editores alteram" on public.%I', t);
      execute format('drop policy if exists "editores apagam" on public.%I', t);
      execute format('create policy "editores criam" on public.%I for insert with check (public.eh_editor())', t);
      execute format('create policy "editores alteram" on public.%I for update using (public.eh_editor()) with check (public.eh_editor())', t);
      execute format('create policy "editores apagam" on public.%I for delete using (public.eh_editor())', t);
      execute format('drop trigger if exists %I on public.%I', t || '_toca', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.toca_atualizado()', t || '_toca', t);
      execute format('drop trigger if exists %I on public.%I', t || '_hist', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.registra_historico()', t || '_hist', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    else
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- ---------- vendas atribuídas ----------
create or replace function public.comissoes_atrib(p_inf uuid default null)
returns table (venda uuid, numero bigint, pedido text, data date, mes text, influenciador uuid, via text, itens jsonb, base numeric, excluida boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro() and (p_inf is null or not exists (
      select 1 from public.influenciadores i where i.id = p_inf and i.email = public.meu_email() and public.meu_email() <> '')) then
    raise exception 'sem acesso';
  end if;
  return query
  with vv as (
    select v.*,
      greatest(0, coalesce((select sum(coalesce((x->>'qtd')::numeric, 1) * coalesce((x->>'preco')::numeric, 0)) from jsonb_array_elements(coalesce(v.itens, '[]'::jsonb)) x), 0)
        - coalesce(v.desconto, 0) - coalesce((v.dados_site->>'imposto_incluso')::numeric, 0)) as b,
      string_to_array(upper(replace(coalesce(v.cupom, ''), ' ', '')), ',') as cups,
      lower(coalesce(v.dados_site->'utm'->>'ref', '')) as ref,
      lower(coalesce(v.dados_site->'utm'->>'utm_content', '')) as cont
    from public.vendas v
  )
  select vv.id, vv.numero, coalesce(nullif(vv.pedido_site, ''), '#' || vv.numero), vv.data_compra, to_char(vv.data_compra, 'YYYY-MM'),
    coalesce(c.id, l.id, k.id), case when c.id is not null then 'cupom' else 'link' end,
    coalesce((select jsonb_agg(jsonb_build_object('produto', x->>'produto', 'qtd', coalesce((x->>'qtd')::numeric, 1), 'preco', coalesce((x->>'preco')::numeric, 0))) from jsonb_array_elements(coalesce(vv.itens, '[]'::jsonb)) x), '[]'::jsonb),
    round(vv.b, 2),
    coalesce(vv.cancelada, false) or exists (select 1 from public.devolucoes d where d.venda = vv.numero)
  from vv
  left join lateral (select i.id from public.influenciadores i where i.cupom <> '' and upper(replace(i.cupom, ' ', '')) = any (vv.cups) limit 1) c on true
  left join lateral (select lk.influenciador as id from public.links_utm lk where vv.ref <> '' and lk.slug = vv.ref and lk.influenciador is not null limit 1) l on true
  left join lateral (select i.id from public.influenciadores i where vv.cont <> '' and i.codigo = vv.cont limit 1) k on true
  where coalesce(c.id, l.id, k.id) is not null
    and (p_inf is null or coalesce(c.id, l.id, k.id) = p_inf);
end $$;

-- ---------- fechamento do mês ----------
create or replace function public.comissoes_fechar(p_mes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inf record; st text; existe boolean; vs jsonb; est jsonb; nped int; sbase numeric; sval numeric; saj numeric; n int := 0;
  hoje_mes text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
begin
  if not public.eh_editor() then raise exception 'sem permissão'; end if;
  if p_mes !~ '^\d{4}-\d{2}$' or p_mes >= hoje_mes then raise exception 'só dá para fechar mês que já terminou'; end if;
  for inf in select * from public.influenciadores loop
    select f.status into st from public.comissoes_fechamentos f where f.influenciador = inf.id and f.mes = p_mes;
    existe := found;
    if existe and st = 'Pago' then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.venda, 'pedido', a.pedido, 'base', a.base, 'comissao', round(a.base * inf.comissao_pct / 100, 2)) order by a.data), '[]'::jsonb),
           count(*), coalesce(sum(a.base), 0)
      into vs, nped, sbase
      from public.comissoes_atrib(inf.id) a where a.mes = p_mes and not a.excluida;
    sval := coalesce((select sum((x->>'comissao')::numeric) from jsonb_array_elements(vs) x), 0);
    -- pedidos já fechados em meses anteriores que agora estão cancelados/devolvidos e ainda não foram estornados
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'pedido', p.pedido, 'comissao', p.comissao)), '[]'::jsonb), coalesce(-sum(p.comissao), 0)
      into est, saj
      from (
        select (x->>'id')::uuid as id, x->>'pedido' as pedido, (x->>'comissao')::numeric as comissao
        from public.comissoes_fechamentos f, jsonb_array_elements(f.vendas) x
        where f.influenciador = inf.id and f.mes < p_mes
      ) p
      where exists (select 1 from public.comissoes_atrib(inf.id) a where a.venda = p.id and a.excluida)
        and not exists (select 1 from public.comissoes_fechamentos f2, jsonb_array_elements(f2.estornos) e
                        where f2.influenciador = inf.id and f2.mes <> p_mes and (e->>'id')::uuid = p.id);
    if nped = 0 and saj = 0 and not existe then continue; end if;
    insert into public.comissoes_fechamentos (influenciador, mes, pct, pedidos, base, valor, ajuste, total, vendas, estornos)
    values (inf.id, p_mes, inf.comissao_pct, nped, sbase, sval, saj, sval + saj, vs, est)
    on conflict (influenciador, mes) do update set pct = excluded.pct, pedidos = excluded.pedidos, base = excluded.base, valor = excluded.valor,
      ajuste = excluded.ajuste, total = excluded.total, vendas = excluded.vendas, estornos = excluded.estornos
    where public.comissoes_fechamentos.status <> 'Pago';
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'mes', p_mes, 'influenciadores', n);
end $$;

-- ---------- painel do influenciador (só os dados dele) ----------
create or replace function public.parceiro_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.influenciadores; em text := public.meu_email();
begin
  if em = '' then return jsonb_build_object('cadastrado', false); end if;
  select * into me from public.influenciadores where email = em;
  if not found then return jsonb_build_object('cadastrado', false, 'email', em); end if;
  return jsonb_build_object(
    'cadastrado', true,
    'perfil', jsonb_build_object('nome', me.nome, 'arroba', me.arroba, 'codigo', me.codigo, 'cupom', me.cupom, 'comissao_pct', me.comissao_pct,
      'ativo', me.ativo and (me.fim is null or me.fim >= (now() at time zone 'America/Sao_Paulo')::date), 'inicio', me.inicio, 'fim', me.fim,
      'email', me.email, 'telefone', me.telefone, 'pix_tipo', me.pix_tipo, 'pix_chave', me.pix_chave, 'titular', me.titular, 'documento', me.documento,
      'banco', me.banco, 'agencia', me.agencia, 'conta', me.conta, 'pagamento_atualizado', me.pagamento_atualizado),
    'links', coalesce((select jsonb_agg(jsonb_build_object('slug', l.slug, 'nome', l.nome, 'destino', l.destino,
        'utm_source', l.utm_source, 'utm_medium', l.utm_medium, 'utm_campaign', l.utm_campaign, 'utm_content', l.utm_content,
        'ativo', l.ativo and (l.inicio is null or l.inicio <= (now() at time zone 'America/Sao_Paulo')::date) and (l.fim is null or l.fim >= (now() at time zone 'America/Sao_Paulo')::date),
        'inicio', l.inicio, 'fim', l.fim,
        'cliques', (select count(*) from public.link_cliques c where c.link = l.id),
        'visitantes', (select count(distinct c.visitante) from public.link_cliques c where c.link = l.id)) order by l.criado_em)
      from public.links_utm l where l.influenciador = me.id), '[]'::jsonb),
    'cliques_mes', coalesce((select jsonb_object_agg(m, jsonb_build_object('cliques', q, 'visitantes', u)) from (
        select to_char(c.em at time zone 'America/Sao_Paulo', 'YYYY-MM') m, count(*) q, count(distinct c.visitante) u
        from public.link_cliques c join public.links_utm l on l.id = c.link where l.influenciador = me.id group by 1) z), '{}'::jsonb),
    'cliques_dia', coalesce((select jsonb_object_agg(d, q) from (
        select to_char(c.em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d, count(*) q
        from public.link_cliques c join public.links_utm l on l.id = c.link
        where l.influenciador = me.id and c.em > now() - interval '60 days' group by 1) z), '{}'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', a.venda, 'pedido', a.pedido, 'data', a.data, 'mes', a.mes, 'via', a.via,
        'itens', a.itens, 'base', a.base, 'excluida', a.excluida) order by a.data desc) from public.comissoes_atrib(me.id) a), '[]'::jsonb),
    'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('mes', f.mes, 'pct', f.pct, 'pedidos', f.pedidos, 'base', f.base, 'valor', f.valor,
        'ajuste', f.ajuste, 'total', f.total, 'vendas', f.vendas, 'estornos', f.estornos, 'status', f.status, 'pago_em', f.pago_em, 'forma', f.forma) order by f.mes desc)
      from public.comissoes_fechamentos f where f.influenciador = me.id), '[]'::jsonb)
  );
end $$;

create or replace function public.parceiro_salvar_pagamento(d jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := public.meu_email(); n int;
begin
  if em = '' then raise exception 'entre na sua conta'; end if;
  update public.influenciadores set
    pix_tipo  = left(coalesce(d->>'pix_tipo', ''), 20),
    pix_chave = left(coalesce(d->>'pix_chave', ''), 120),
    titular   = left(coalesce(d->>'titular', ''), 120),
    documento = left(coalesce(d->>'documento', ''), 20),
    banco     = left(coalesce(d->>'banco', ''), 60),
    agencia   = left(coalesce(d->>'agencia', ''), 20),
    conta     = left(coalesce(d->>'conta', ''), 30),
    telefone  = left(coalesce(d->>'telefone', telefone), 30),
    pagamento_atualizado = now()
  where email = em;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'e-mail não cadastrado'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.comissoes_atrib(uuid) from public, anon;
revoke all on function public.comissoes_fechar(text) from public, anon;
revoke all on function public.parceiro_painel() from public, anon;
revoke all on function public.parceiro_salvar_pagamento(jsonb) from public, anon;
grant execute on function public.comissoes_atrib(uuid) to authenticated;
grant execute on function public.comissoes_fechar(text) to authenticated;
grant execute on function public.parceiro_painel() to authenticated;
grant execute on function public.parceiro_salvar_pagamento(jsonb) to authenticated;

-- cliques por dia (para o ERP não baixar clique por clique)
create or replace view public.link_cliques_dia with (security_invoker = on) as
  select link, (em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as cliques, count(distinct visitante)::int as visitantes
  from public.link_cliques group by 1, 2;
grant select on public.link_cliques_dia to authenticated;

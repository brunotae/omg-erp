-- OMG ERP · Fila de fotos oficiais (troca das fotos do site pelas do site oficial da marca)
-- Rodar UMA vez no Supabase → SQL Editor (pode repetir).
create table if not exists public.fotos_fila (
  id                 uuid primary key default gen_random_uuid(),
  handle             text unique not null,
  shopify_product_id text,
  marca              text,
  titulo             text,
  fonte_site         text,
  fonte_url          text,
  fonte_titulo       text,
  score              numeric,
  fotos              text[] not null default '{}',
  peso_g             numeric,
  status             text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada','aplicada','erro')),
  obs                text not null default '',
  decidido_por       text,
  decidido_em        timestamptz,
  aplicado_em        timestamptz,
  criado_em          timestamptz not null default now()
);

alter table public.fotos_fila enable row level security;
do $$
declare p record; q text;
begin
  for p in select * from pg_policies where schemaname = 'public' and tablename = 'vendas' loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fotos_fila' and policyname = p.policyname) then
      continue;
    end if;
    q := format('create policy %I on public.fotos_fila as %s for %s to %s',
                p.policyname, p.permissive, p.cmd,
                (select string_agg(quote_ident(r), ',') from unnest(p.roles) r));
    if p.qual is not null then q := q || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then q := q || ' with check (' || p.with_check || ')'; end if;
    execute q;
  end loop;
end $$;

grant select, insert, update, delete on public.fotos_fila to authenticated;

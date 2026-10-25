-- OMG ERP · Avisos do momento da Bomi (cupom ativo, promoção, atraso geral, feriado…)
-- A Bomi lê os avisos ativos dentro do período e usa como informação mais recente, acima da base.
-- Rodar UMA vez no Supabase → SQL Editor (pode repetir).
create table if not exists public.avisos_bomi (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null,
  inicio     date,
  fim        date,
  ativo      boolean not null default true,
  criado_por text,
  criado_em  timestamptz not null default now()
);

alter table public.avisos_bomi enable row level security;
do $$
declare p record; q text;
begin
  for p in select * from pg_policies where schemaname = 'public' and tablename = 'vendas' loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_bomi' and policyname = p.policyname) then
      continue;
    end if;
    q := format('create policy %I on public.avisos_bomi as %s for %s to %s',
                p.policyname, p.permissive, p.cmd,
                (select string_agg(quote_ident(r), ',') from unnest(p.roles) r));
    if p.qual is not null then q := q || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then q := q || ' with check (' || p.with_check || ')'; end if;
    execute q;
  end loop;
end $$;

grant select, insert, update, delete on public.avisos_bomi to authenticated;

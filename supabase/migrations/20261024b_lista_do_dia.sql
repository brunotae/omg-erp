-- OMG ERP · Lista do dia (corte das 18h) e compra da Janice
-- Rodar UMA vez no Supabase → SQL Editor. Pode rodar de novo sem estragar nada.

-- 1) Vendas: hora do pagamento (vem do Shopify) e lista do dia em que entrou
alter table public.vendas add column if not exists pago_em timestamptz;
alter table public.vendas add column if not exists corte uuid;

-- 2) Listas do dia
create table if not exists public.cortes (
  id            uuid primary key default gen_random_uuid(),
  numero        text unique not null,          -- LD-261027
  corte_em      timestamptz,                   -- horário do corte (18h)
  vendas        uuid[] not null default '{}',
  enviado_em    timestamptz,                   -- quando foi mandada para Janice/Skyroad/Mile
  compra        jsonb not null default '[]',   -- [{produto, qtd, custo (₩ por unidade)}]
  despesas_krw  numeric,                       -- embalagem, transporte local etc.
  compra_em     timestamptz,
  obs           text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 3) Mesmas regras de acesso da tabela de vendas (só membros; Consulta só lê)
alter table public.cortes enable row level security;
do $$
declare p record; q text;
begin
  for p in select * from pg_policies where schemaname = 'public' and tablename = 'vendas' loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cortes' and policyname = p.policyname) then
      continue;
    end if;
    q := format('create policy %I on public.cortes as %s for %s to %s',
                p.policyname, p.permissive, p.cmd,
                (select string_agg(quote_ident(r), ',') from unnest(p.roles) r));
    if p.qual is not null then q := q || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then q := q || ' with check (' || p.with_check || ')'; end if;
    execute q;
  end loop;
end $$;

grant select, insert, update, delete on public.cortes to authenticated;

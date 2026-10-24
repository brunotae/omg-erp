-- OMG ERP · ligação com o Shopify
-- Rodar UMA vez no Supabase → SQL Editor. Pode rodar de novo sem estragar nada.

-- 1) Campos para identificar o pedido do site
alter table public.vendas add column if not exists ext_id text;        -- "shopify:<id do pedido>"
alter table public.vendas add column if not exists pedido_site text;   -- ex.: "#1001"
alter table public.vendas add column if not exists dados_site jsonb;   -- impostos e linhas como vieram do Shopify
create unique index if not exists vendas_ext_id_key on public.vendas (ext_id) where ext_id is not null;

-- 2) Número da venda gerado pelo banco (100.000.001, 100.000.002…)
--    Vale para o ERP e para o Shopify; se dois chegarem juntos, ninguém repete número.
create or replace function public.vendas_numero_auto() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4242001);
  if new.numero is null
     or exists (select 1 from public.vendas where numero = new.numero and id <> new.id) then
    select greatest(coalesce(max(numero), 100000000), 100000000) + 1
      into new.numero from public.vendas;
  end if;
  return new;
end $$;

drop trigger if exists vendas_numero_auto on public.vendas;
create trigger vendas_numero_auto
  before insert on public.vendas
  for each row execute function public.vendas_numero_auto();

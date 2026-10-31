-- Número da venda = número do pedido no Shopify (Tae · 31/10/2026)
-- Site:   #1001 → 100.001.001 ; com prefixo #10000 no Shopify: #100001002 → 100.001.002
-- Manual (ERP, B2B, parceiros): série própria 200.000.001, 200.000.002…
create or replace function public.vendas_numero_auto() returns trigger
language plpgsql as $$
declare d bigint;
begin
  perform pg_advisory_xact_lock(4242001);
  if coalesce(new.ext_id,'') like 'shopify:%' and coalesce(new.pedido_site,'') ~ '\d' then
    d := regexp_replace(new.pedido_site, '\D', '', 'g')::bigint;
    new.numero := case when d >= 100000000 then d else 100000000 + d end;
    if exists (select 1 from public.vendas where numero = new.numero and id <> new.id) then
      raise exception 'Venda % já existe no ERP (pedido do site %)', new.numero, new.pedido_site;
    end if;
  elsif new.numero is null or new.numero < 200000000
     or exists (select 1 from public.vendas where numero = new.numero and id <> new.id) then
    select greatest(coalesce(max(numero) filter (where numero >= 200000000), 200000000), 200000000) + 1
      into new.numero from public.vendas;
  end if;
  return new;
end $$;
-- Aplicada em 31/10/2026 junto com: remoção da venda de teste "Fulana Teste 1" e #1001 renumerada para 100.001.001.

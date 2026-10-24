-- OMG ERP · Catálogo ligado ao Shopify. Rodar UMA vez no Supabase → SQL Editor (pode repetir).
alter table public.produtos add column if not exists shopify_product_id text;
alter table public.produtos add column if not exists shopify_variant_id text;
alter table public.produtos add column if not exists site_status text;   -- active | draft | archived | excluido
create unique index if not exists produtos_shopify_variant_key on public.produtos (shopify_variant_id) where shopify_variant_id is not null;
create index if not exists produtos_shopify_product_idx on public.produtos (shopify_product_id);

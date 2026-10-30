-- v34 · Precificação: catálogo dos concorrentes, referências por produto e histórico de preços.
create table if not exists conc_catalogo (
  url text primary key,
  loja text not null,
  nome text,
  marca text,
  sku text,
  preco numeric,
  preco_de numeric,
  preco_ant numeric,
  mudou_em timestamptz,
  esgotado boolean default false,
  peso_g numeric,
  ativo boolean default true,
  lido_em timestamptz default now()
);
create table if not exists precos_ref (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  loja text not null,
  url text,
  status text not null default 'ok',
  usd numeric,
  quem text,
  criado_em timestamptz default now()
);
create unique index if not exists precos_ref_uni on precos_ref(produto_id, loja, coalesce(url,''));
create index if not exists precos_ref_prod on precos_ref(produto_id);
create table if not exists precos_hist (
  id bigserial primary key,
  produto_id uuid references produtos(id) on delete set null,
  sku text, nome text,
  antes numeric, depois numeric,
  regra text, quem text,
  em timestamptz default now()
);
alter table conc_catalogo enable row level security;
alter table precos_ref enable row level security;
alter table precos_hist enable row level security;
do $$ declare t text; begin
  foreach t in array array['conc_catalogo','precos_ref','precos_hist'] loop
    execute format('drop policy if exists "membros veem" on %I', t);
    execute format('drop policy if exists "editores criam" on %I', t);
    execute format('drop policy if exists "editores alteram" on %I', t);
    execute format('drop policy if exists "editores apagam" on %I', t);
    execute format('create policy "membros veem" on %I for select using (eh_membro())', t);
    execute format('create policy "editores criam" on %I for insert with check (eh_editor())', t);
    execute format('create policy "editores alteram" on %I for update using (eh_editor()) with check (eh_editor())', t);
    execute format('create policy "editores apagam" on %I for delete using (eh_editor())', t);
  end loop;
end $$;
insert into config(chave, valor) values ('precos', '{"desc":10,"ext":20,"icms":17,"alerta":3,"freteParte":100,"ufs":"SP,RJ,MG,PR,SC,RS,DF,GO,BA,PE,CE","usd":5.40,"limiteUsd":50,"iiPct":60,"iiDescUsd":30}'::jsonb)
on conflict (chave) do nothing;

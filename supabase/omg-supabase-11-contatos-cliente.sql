-- OMG ERP · Contato com clientes (relatório para a Isa) · 06/11/2026
-- Uma linha por item de venda que a diretora não conseguiu comprar na Coreia. A Isa fala com a cliente
-- e registra a solução (troca, reembolso do item, cancelamento). Qualquer membro do ERP edita o andamento;
-- só editores criam e apagam.
create sequence if not exists public.contatos_cliente_seq;
create table if not exists public.contatos_cliente (
  id uuid primary key default gen_random_uuid(),
  numero text unique default ('AT-'||lpad(nextval('public.contatos_cliente_seq')::text,4,'0')),
  venda bigint not null,
  sku text,
  produto text,
  qtd int not null default 1,
  motivo text,
  ocorrencia text,
  lote text,
  status text not null default 'a_contatar' check (status in ('a_contatar','contatado','troca','reembolso','cancelado','resolvido')),
  solucao text,
  troca_por text,
  valor_reembolso numeric,
  obs text,
  responsavel text default 'Isa',
  contato_em timestamptz,
  resolvido_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists contatos_cliente_venda on public.contatos_cliente(venda);
alter table public.contatos_cliente enable row level security;
drop policy if exists "membros veem" on public.contatos_cliente;
drop policy if exists "membros alteram" on public.contatos_cliente;
drop policy if exists "editores criam" on public.contatos_cliente;
drop policy if exists "editores apagam" on public.contatos_cliente;
create policy "membros veem" on public.contatos_cliente for select using (eh_membro());
create policy "membros alteram" on public.contatos_cliente for update using (eh_membro()) with check (eh_membro());
create policy "editores criam" on public.contatos_cliente for insert with check (eh_editor());
create policy "editores apagam" on public.contatos_cliente for delete using (eh_editor());
drop trigger if exists contatos_cliente_hist on public.contatos_cliente;
create trigger contatos_cliente_hist after insert or delete or update on public.contatos_cliente for each row execute function registra_historico();
drop trigger if exists contatos_cliente_toca on public.contatos_cliente;
create trigger contatos_cliente_toca before update on public.contatos_cliente for each row execute function toca_atualizado();

-- tipo novo nas ocorrências: a diretora não conseguiu comprar (motivo ainda não informado)
alter table public.ocorrencias_compra drop constraint if exists ocorrencias_compra_tipo_check;
alter table public.ocorrencias_compra add constraint ocorrencias_compra_tipo_check check (tipo in ('notkr','disc','mism','sold','unit','delay','nocomp','outro'));

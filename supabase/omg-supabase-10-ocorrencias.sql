create sequence if not exists public.ocorrencias_compra_seq;
create table if not exists public.ocorrencias_compra (
  id uuid primary key default gen_random_uuid(),
  numero text unique default ('OC-'||lpad(nextval('public.ocorrencias_compra_seq')::text,4,'0')),
  lote text not null,
  ordem int,
  tipo text not null check (tipo in ('notkr','disc','mism','sold','unit','delay','outro')),
  escopo text not null default 'item' check (escopo in ('item','lote','nao_identificado')),
  marca text, produto_ko text, produto_pt text, sku text,
  pedidos text[] not null default '{}',
  presente boolean not null default false,
  situacao_ko text, situacao_pt text,
  sugestao_ko text, sugestao_pt text,
  decisao text, responsavel text, data_acao date,
  status text not null default 'aberta' check (status in ('aberta','andamento','resolvida')),
  relatado_por text,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
create index if not exists ocorrencias_compra_lote on public.ocorrencias_compra(lote, ordem);
alter table public.ocorrencias_compra enable row level security;
create policy "membros veem" on public.ocorrencias_compra for select using (eh_membro());
create policy "editores criam" on public.ocorrencias_compra for insert with check (eh_editor());
create policy "editores alteram" on public.ocorrencias_compra for update using (eh_editor()) with check (eh_editor());
create policy "editores apagam" on public.ocorrencias_compra for delete using (eh_editor());
create trigger ocorrencias_compra_hist after insert or delete or update on public.ocorrencias_compra for each row execute function registra_historico();
create trigger ocorrencias_compra_toca before update on public.ocorrencias_compra for each row execute function toca_atualizado();

-- Colunas I–L (decisão, responsável, data, status): qualquer membro do ERP pode alterar, inclusive quem tem acesso só de consulta
-- (ex.: a diretora na Coreia). O resto da linha só editores mudam.
create or replace function public.ocorrencia_atualizar(p_id uuid, p_decisao text, p_responsavel text, p_data date, p_status text)
returns public.ocorrencias_compra language plpgsql security definer set search_path=public as $$
declare r public.ocorrencias_compra;
begin
  if not eh_membro() then raise exception 'sem acesso'; end if;
  if p_status not in ('aberta','andamento','resolvida') then raise exception 'status inválido'; end if;
  update public.ocorrencias_compra set decisao=nullif(p_decisao,''), responsavel=nullif(p_responsavel,''), data_acao=p_data, status=p_status
   where id=p_id returning * into r;
  if r.id is null then raise exception 'ocorrência não encontrada'; end if;
  return r;
end $$;
revoke all on function public.ocorrencia_atualizar(uuid,text,text,date,text) from public, anon;
grant execute on function public.ocorrencia_atualizar(uuid,text,text,date,text) to authenticated;

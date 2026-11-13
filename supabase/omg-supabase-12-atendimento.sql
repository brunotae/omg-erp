-- OMG ERP · Painel de atendimento (Isa) · 13/11/2026
-- Quem está em "atendentes" NÃO é membro do ERP: as tabelas continuam fechadas para ela (RLS por eh_membro()).
-- Ela só enxerga o que estas duas funções devolvem: pedidos (cliente, contato, itens, etapas, rastreio, avisos)
-- e a fila "Avisar cliente" (contatos_cliente). Sem custos, margens, CPF, fornecedores, parceiros ou configurações.
create table if not exists public.atendentes (
  email text primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);
alter table public.atendentes enable row level security;
drop policy if exists "editores gerenciam" on public.atendentes;
create policy "editores gerenciam" on public.atendentes for all using (eh_editor()) with check (eh_editor());

create or replace function public.eh_atendente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.atendentes a where a.email = public.meu_email() and a.ativo)
$$;

create or replace function public.atend_painel(p_dias int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.atendentes;
begin
  select * into me from public.atendentes where email = public.meu_email() and ativo;
  if not found then return jsonb_build_object('cadastrado', false, 'email', public.meu_email()); end if;
  return jsonb_build_object(
    'cadastrado', true,
    'nome', me.nome,
    'vendas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'numero', v.numero, 'pedido', coalesce(v.pedido_site, '#'||v.numero), 'data', v.data_compra,
        'cliente', v.cliente, 'contato', v.contato, 'fone', coalesce(v.dados_site->'endereco'->>'fone', ''),
        'cidade', v.cidade, 'uf', v.uf, 'canal', v.canal, 'cancelada', v.cancelada, 'cupom', v.cupom,
        'itens', (select coalesce(jsonb_agg(jsonb_build_object('produto', i->>'produto', 'qtd', i->'qtd', 'preco', i->'preco')), '[]'::jsonb) from jsonb_array_elements(coalesce(v.itens, '[]'::jsonb)) i),
        'total', v.dados_site->'total', 'frete', v.frete,
        'rastreio', v.rastreio,
        'etapas', coalesce(v.etapas, '{}'::jsonb) || coalesce((select l.etapas from public.lotes l where v.id = any(l.vendas) limit 1), '{}'::jsonb),
        'avisos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'status', a.status, 'em', coalesce(a.enviado_em, a.criado_em)) order by a.criado_em), '[]'::jsonb) from public.avisos_cliente a where a.venda = v.id),
        'obs', v.obs
      ) order by v.numero desc)
      from public.vendas v where v.data_compra >= (now() at time zone 'America/Sao_Paulo')::date - p_dias), '[]'::jsonb),
    'contatos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'numero', c.numero, 'venda', c.venda, 'sku', c.sku, 'produto', c.produto, 'qtd', c.qtd,
        'motivo', c.motivo, 'status', c.status, 'solucao', c.solucao, 'obs', c.obs, 'contato_em', c.contato_em,
        'resolvido_em', c.resolvido_em, 'criado_em', c.criado_em) order by c.criado_em desc)
      from public.contatos_cliente c where c.status not in ('resolvido','cancelado') or c.atualizado_em > now() - interval '30 days'), '[]'::jsonb)
  );
end $$;

-- A Isa marca o contato: "contatado" (avisei a cliente) ou "resolvido", com uma nota opcional.
-- Quando todos os contatos de uma ocorrência estão avisados, a ocorrência fecha sozinha.
create or replace function public.atend_marcar(p_id uuid, p_status text, p_nota text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.atendentes; c public.contatos_cliente; quando text := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'); faltam int;
begin
  select * into me from public.atendentes where email = public.meu_email() and ativo;
  if not found then raise exception 'sem acesso de atendimento'; end if;
  if p_status not in ('contatado','resolvido') then raise exception 'status inválido'; end if;
  update public.contatos_cliente set
    status = p_status,
    contato_em = coalesce(contato_em, now()),
    resolvido_em = case when p_status = 'resolvido' then now() else resolvido_em end,
    obs = nullif(concat_ws(E'\n', nullif(obs, ''), quando || ' · ' || me.nome || ': ' || case when p_status = 'contatado' then 'avisei a cliente' else 'resolvido' end
          || case when coalesce(trim(p_nota), '') <> '' then ' · ' || left(trim(p_nota), 500) else '' end), '')
  where id = p_id returning * into c;
  if not found then raise exception 'contato não encontrado'; end if;
  if c.ocorrencia is not null then
    select count(*) into faltam from public.contatos_cliente x where x.ocorrencia = c.ocorrencia and x.status = 'a_contatar';
    if faltam = 0 then
      update public.ocorrencias_compra set status = 'resolvida',
        decisao = concat_ws(' · ', nullif(decisao, ''), quando || ': ' || me.nome || ' avisou a cliente.')
      where numero = c.ocorrencia and status <> 'resolvida';
    end if;
  end if;
  return jsonb_build_object('ok', true, 'numero', c.numero, 'status', c.status);
end $$;

revoke all on function public.eh_atendente() from public, anon;
revoke all on function public.atend_painel(int) from public, anon;
revoke all on function public.atend_marcar(uuid, text, text) from public, anon;
grant execute on function public.eh_atendente() to authenticated;
grant execute on function public.atend_painel(int) to authenticated;
grant execute on function public.atend_marcar(uuid, text, text) to authenticated;

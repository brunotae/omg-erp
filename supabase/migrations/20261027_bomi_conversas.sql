-- OMG ERP · Bomi no site: conversas, transferências para a equipe e feedbacks.
-- Quem grava é só a função "bomi" (chave de serviço). A equipe lê e atualiza pelo ERP.
-- Rodar UMA vez no Supabase → SQL Editor (pode repetir).
create table if not exists public.bomi_conversas (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null default 'site',          -- site | whatsapp | email
  sessao        text not null,                          -- id aleatório do navegador da cliente
  ip_hash       text,                                   -- só para limitar abuso (não guarda o IP)
  pagina        text,                                   -- página do site onde a conversa começou
  mensagens     jsonb not null default '[]',            -- [{papel:'cliente'|'bomi'|'evento', texto, em}]
  ferramentas   jsonb not null default '[]',            -- chamadas de ferramentas (bastidores, para revisão)
  turnos        int not null default 0,
  tokens_in     int not null default 0,
  tokens_out    int not null default 0,
  transferida   boolean not null default false,
  nota          text,                                   -- 👍/👎 da cliente, se der
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists bomi_conversas_sessao_key on public.bomi_conversas (canal, sessao);
create index if not exists bomi_conversas_ip_idx on public.bomi_conversas (ip_hash, criado_em);

create table if not exists public.bomi_atendimentos (
  id            uuid primary key default gen_random_uuid(),
  conversa_id   uuid references public.bomi_conversas(id) on delete set null,
  tipo          text not null,                          -- 'transferencia' | 'feedback'
  motivo        text not null default '',               -- motivo da transferência ou tipo do feedback
  resumo        text not null default '',
  contato       text not null default '',               -- e-mail/WhatsApp que a cliente deixou (se deixou)
  status        text not null default 'aberto' check (status in ('aberto','respondido','resolvido')),
  resolvido_por text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists bomi_atendimentos_status_idx on public.bomi_atendimentos (status, criado_em desc);

-- Mesmas regras de acesso da tabela de vendas (só membros do ERP)
do $$
declare p record; q text; t text;
begin
  foreach t in array array['bomi_conversas','bomi_atendimentos'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select * from pg_policies where schemaname = 'public' and tablename = 'vendas' loop
      if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = p.policyname) then
        continue;
      end if;
      q := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, t, p.permissive, p.cmd,
                  (select string_agg(quote_ident(r), ',') from unnest(p.roles) r));
      if p.qual is not null then q := q || ' using (' || p.qual || ')'; end if;
      if p.with_check is not null then q := q || ' with check (' || p.with_check || ')'; end if;
      execute q;
    end loop;
  end loop;
end $$;

grant select, update on public.bomi_conversas to authenticated;
grant select, insert, update, delete on public.bomi_atendimentos to authenticated;

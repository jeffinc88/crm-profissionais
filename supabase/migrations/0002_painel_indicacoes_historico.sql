-- =====================================================================
-- CRM de Profissionais — Migração 0002
-- • Histórico (linha do tempo) de obras, profissionais e comissões
-- • Formulário público "Indique uma obra" (link por profissional)
-- Rodar no SQL Editor do Supabase depois da 0001. Pode rodar de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Histórico de alterações
-- ---------------------------------------------------------------------
create table if not exists public.crm_historico (
  id               bigserial primary key,
  tabela           text not null,              -- 'obra' | 'profissional' | 'comissao'
  registro_id      uuid not null,
  obra_id          uuid,
  profissional_id  uuid,
  acao             text not null check (acao in ('criou', 'alterou', 'excluiu')),
  mudancas         jsonb not null default '{}'::jsonb,  -- { campo: [antes, depois] }
  usuario_id       uuid default auth.uid(),
  usuario_nome     text,
  data             timestamptz not null default now()
);
create index if not exists crm_historico_obra_idx on public.crm_historico (obra_id, data desc);
create index if not exists crm_historico_prof_idx on public.crm_historico (profissional_id, data desc);

-- Campos que interessam no histórico de cada tabela (o resto é ruído)
create or replace function public.crm_registrar_historico()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  campos   text[];
  c        text;
  antes    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  depois   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  dif      jsonb := '{}'::jsonb;
  linha    jsonb := coalesce(depois, antes);
  v_tabela text;
  v_nome   text;
begin
  if tg_table_name = 'crm_obras' then
    v_tabela := 'obra';
    campos := array['profissional_id','papel','status','motivo_perda','dono_nome','dono_telefone','dono_documento',
                    'endereco','cidade','previsao_laje','data_fechamento','data_entrega','tipo_comissao',
                    'valor_comissao_combinado','valor_produtos'];
  elsif tg_table_name = 'crm_profissionais' then
    v_tabela := 'profissional';
    campos := array['nome','apelido','telefone','cidade','categoria_id','tipo_comissao_padrao','valor_comissao_padrao',
                    'prazo_recompra_dias','chave_pix','ativo'];
  else
    v_tabela := 'comissao';
    campos := array['tipo','percentual','valor','status','cliente_quitou_em','pago_em','comprovante_path'];
  end if;

  if tg_op = 'UPDATE' then
    foreach c in array campos loop
      if (antes -> c) is distinct from (depois -> c) then
        dif := dif || jsonb_build_object(c, jsonb_build_array(antes -> c, depois -> c));
      end if;
    end loop;
    if dif = '{}'::jsonb then return new; end if;  -- nada relevante mudou
  elsif tg_op = 'DELETE' then
    -- guarda o nome para a linha do tempo saber o que foi excluído
    dif := jsonb_strip_nulls(jsonb_build_object('dono_nome', antes -> 'dono_nome', 'nome', antes -> 'nome'));
  elsif tg_op = 'INSERT' then
    foreach c in array campos loop
      if (depois -> c) is not null and (depois -> c) <> 'null'::jsonb then
        dif := dif || jsonb_build_object(c, jsonb_build_array(null, depois -> c));
      end if;
    end loop;
  end if;

  select nome into v_nome from public.crm_operadores where user_id = auth.uid();

  insert into public.crm_historico (tabela, registro_id, obra_id, profissional_id, acao, mudancas, usuario_nome)
  values (
    v_tabela,
    (linha ->> 'id')::uuid,
    case when v_tabela = 'obra' then (linha ->> 'id')::uuid else (linha ->> 'obra_id')::uuid end,
    case when v_tabela = 'profissional' then (linha ->> 'id')::uuid else (linha ->> 'profissional_id')::uuid end,
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
    dif,
    coalesce(v_nome, case when auth.uid() is null then 'Sistema' else null end)
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 2. Campos novos
-- ---------------------------------------------------------------------
alter table public.crm_obras
  add column if not exists indicado_em    timestamptz,     -- quando o profissional indicou pelo link
  add column if not exists origem_cadastro text not null default 'operador'
    check (origem_cadastro in ('operador', 'link_indicacao', 'conciliacao'));

alter table public.crm_profissionais
  add column if not exists token_indicacao uuid not null default gen_random_uuid();
create unique index if not exists crm_profissionais_token_idx on public.crm_profissionais (token_indicacao);

drop trigger if exists crm_hist_obras on public.crm_obras;
create trigger crm_hist_obras after insert or update or delete on public.crm_obras
for each row execute function public.crm_registrar_historico();
drop trigger if exists crm_hist_prof on public.crm_profissionais;
create trigger crm_hist_prof after insert or update or delete on public.crm_profissionais
for each row execute function public.crm_registrar_historico();
drop trigger if exists crm_hist_com on public.crm_comissoes;
create trigger crm_hist_com after insert or update or delete on public.crm_comissoes
for each row execute function public.crm_registrar_historico();

-- ---------------------------------------------------------------------
-- 3. Indicações recebidas pelo link público
-- ---------------------------------------------------------------------
create table if not exists public.crm_indicacoes (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  uuid not null references public.crm_profissionais(id) on delete cascade,
  dono_nome        text not null,
  dono_telefone    text,
  endereco         text,
  cidade           text,
  etapa            text,
  previsao_laje    text,           -- texto livre: "dezembro", "daqui 2 meses"
  observacao       text,
  status           text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  obra_id          uuid references public.crm_obras(id) on delete set null,
  recebida_em      timestamptz not null default now(),
  revisada_em      timestamptz,
  revisada_por     uuid
);
create index if not exists crm_indicacoes_status_idx on public.crm_indicacoes (status, recebida_em);

alter table public.crm_indicacoes enable row level security;
drop policy if exists crm_indicacoes_select on public.crm_indicacoes;
create policy crm_indicacoes_select on public.crm_indicacoes for select to authenticated using (public.crm_is_operador());
drop policy if exists crm_indicacoes_update on public.crm_indicacoes;
create policy crm_indicacoes_update on public.crm_indicacoes for update to authenticated
  using (public.crm_is_operador()) with check (public.crm_is_operador());
revoke all on public.crm_indicacoes from anon;
grant select, update on public.crm_indicacoes to authenticated;

-- Página pública: devolve só o primeiro nome do profissional dono do link
create or replace function public.crm_indicacao_info(p_token uuid)
returns text language sql stable security definer set search_path = public
as $$
  select split_part(coalesce(nullif(apelido, ''), nome), ' ', 1)
    from public.crm_profissionais where token_indicacao = p_token and ativo
$$;

-- Página pública: grava a indicação (o visitante nunca lê nada do banco)
create or replace function public.crm_enviar_indicacao(
  p_token uuid, p_dono_nome text, p_dono_telefone text, p_endereco text,
  p_cidade text, p_etapa text, p_previsao_laje text, p_observacao text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_prof uuid;
begin
  select id into v_prof from public.crm_profissionais where token_indicacao = p_token and ativo;
  if v_prof is null then raise exception 'Link de indicação inválido'; end if;

  if coalesce(length(trim(p_dono_nome)), 0) < 2 then raise exception 'Informe o nome do dono da obra'; end if;
  if coalesce(length(trim(p_endereco)), 0) < 3 and coalesce(length(regexp_replace(p_dono_telefone, '\D', '', 'g')), 0) < 10 then
    raise exception 'Informe o endereço da obra ou o telefone do dono';
  end if;

  -- trava simples contra abuso: até 30 indicações por link em 24h
  if (select count(*) from public.crm_indicacoes
       where profissional_id = v_prof and recebida_em > now() - interval '24 hours') >= 30 then
    raise exception 'Limite de indicações por dia atingido. Fale com a fábrica.';
  end if;

  insert into public.crm_indicacoes
    (profissional_id, dono_nome, dono_telefone, endereco, cidade, etapa, previsao_laje, observacao)
  values (
    v_prof, left(trim(p_dono_nome), 120),
    nullif(left(regexp_replace(coalesce(p_dono_telefone, ''), '\D', '', 'g'), 13), ''),
    nullif(left(trim(p_endereco), 200), ''), nullif(left(trim(p_cidade), 80), ''),
    nullif(left(trim(p_etapa), 60), ''), nullif(left(trim(p_previsao_laje), 60), ''),
    nullif(left(trim(p_observacao), 500), '')
  );
  return true;
end $$;

revoke execute on function public.crm_indicacao_info(uuid) from public;
revoke execute on function public.crm_enviar_indicacao(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.crm_indicacao_info(uuid) to anon, authenticated;
grant execute on function public.crm_enviar_indicacao(uuid, text, text, text, text, text, text, text) to anon, authenticated;

-- Operador aprova: vira Obra do Indicador, com a data da indicação registrada
create or replace function public.crm_aprovar_indicacao(p_indicacao_id uuid, p_obra_existente uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_ind public.crm_indicacoes; v_obra uuid;
begin
  if not public.crm_is_operador() then raise exception 'Acesso restrito aos operadores do CRM'; end if;
  select * into v_ind from public.crm_indicacoes where id = p_indicacao_id for update;
  if not found or v_ind.status <> 'pendente' then raise exception 'Indicação não está pendente'; end if;

  if p_obra_existente is not null then
    v_obra := p_obra_existente;
    update public.crm_obras
       set indicado_em = coalesce(indicado_em, v_ind.recebida_em)
     where id = v_obra;
  else
    insert into public.crm_obras (profissional_id, papel, dono_nome, dono_telefone, endereco, cidade,
                                  status, indicado_em, origem_cadastro, observacoes)
    values (v_ind.profissional_id, 'indicador', v_ind.dono_nome, v_ind.dono_telefone, v_ind.endereco, v_ind.cidade,
            'em_andamento', v_ind.recebida_em, 'link_indicacao',
            nullif(concat_ws(E'\n',
              'Etapa informada: ' || v_ind.etapa,
              'Previsão da laje (informada): ' || v_ind.previsao_laje,
              v_ind.observacao), ''))
    returning id into v_obra;
  end if;

  update public.crm_indicacoes
     set status = 'aprovada', obra_id = v_obra, revisada_em = now(), revisada_por = auth.uid()
   where id = v_ind.id;
  return v_obra;
end $$;
revoke execute on function public.crm_aprovar_indicacao(uuid, uuid) from public, anon;
grant execute on function public.crm_aprovar_indicacao(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Permissões do histórico (só leitura para operadores)
-- ---------------------------------------------------------------------
alter table public.crm_historico enable row level security;
drop policy if exists crm_historico_select on public.crm_historico;
create policy crm_historico_select on public.crm_historico for select to authenticated using (public.crm_is_operador());
revoke all on public.crm_historico from anon;
grant select on public.crm_historico to authenticated;

-- A view de resumo do profissional passa a expor o token (recriada para incluir a coluna nova)
drop view if exists public.crm_v_agenda;
drop view if exists public.crm_v_profissionais;
create view public.crm_v_profissionais
with (security_invoker = true) as
select p.*,
       c.nome as categoria,
       v.ultima_venda,
       v.vendas_total,
       coalesce(p.prazo_recompra_dias, cfg.prazo_recompra_dias) as prazo_efetivo,
       (current_date - coalesce(v.ultima_venda, p.created_at::date)) as dias_sem_venda,
       coalesce(k.a_pagar, 0)    as comissao_a_pagar,
       coalesce(k.aguardando, 0) as comissao_aguardando,
       coalesce(k.pago, 0)       as comissao_paga
  from public.crm_profissionais p
  cross join public.crm_config cfg
  left join public.crm_categorias c on c.id = p.categoria_id
  left join lateral (
    select max(o.data_fechamento) as ultima_venda, count(*) as vendas_total
      from public.crm_obras o
     where o.profissional_id = p.id
       and o.status in ('fechada', 'entregue')
       and o.papel in ('indicador', 'comprador')
  ) v on true
  left join lateral (
    select sum(valor) filter (where status = 'a_pagar')                as a_pagar,
           sum(valor) filter (where status = 'aguardando_recebimento') as aguardando,
           sum(valor) filter (where status = 'paga')                   as pago
      from public.crm_comissoes k where k.profissional_id = p.id
  ) k on true;

create view public.crm_v_agenda
with (security_invoker = true) as
select 'recompra'::text as tipo,
       p.id as profissional_id, null::uuid as obra_id,
       p.nome as profissional_nome, p.telefone,
       format('%s dias sem venda (prazo %s)', p.dias_sem_venda, p.prazo_efetivo) as descricao,
       (coalesce(p.ultima_venda, p.created_at::date) + p.prazo_efetivo) as data_ref,
       1 as prioridade
  from public.crm_v_profissionais p
 where p.ativo
   and p.dias_sem_venda >= p.prazo_efetivo
   and (p.proximo_contato is null or p.proximo_contato <= current_date)
union all
select 'agendado', p.id, null, p.nome, p.telefone, 'Contato agendado', p.proximo_contato, 2
  from public.crm_v_profissionais p
 where p.ativo
   and p.proximo_contato <= current_date
   and p.dias_sem_venda < p.prazo_efetivo
union all
select 'pos_entrega', o.profissional_id, o.id,
       coalesce(pr.nome, '(sem profissional)'), coalesce(o.dono_telefone, pr.telefone),
       format('Pós-entrega: %s — %s', coalesce(o.dono_nome, 'Dono da Obra'), coalesce(o.endereco, o.cidade, '')),
       o.data_entrega + cfg.dias_pos_entrega, 0
  from public.crm_obras o
  cross join public.crm_config cfg
  left join public.crm_profissionais pr on pr.id = o.profissional_id
 where o.status = 'entregue'
   and not o.pos_entrega_feito
   and o.data_entrega + cfg.dias_pos_entrega <= current_date
union all
select 'obra_sem_laje', o.profissional_id, o.id,
       coalesce(pr.nome, '(sem profissional)'), pr.telefone,
       format('Acompanhar obra: %s — %s%s', coalesce(o.dono_nome, 'Dono da Obra'),
              coalesce(o.endereco, o.cidade, ''),
              coalesce(' (laje prevista ' || to_char(o.previsao_laje, 'DD/MM') || ')', '')),
       o.proximo_acompanhamento, 3
  from public.crm_obras o
  left join public.crm_profissionais pr on pr.id = o.profissional_id
 where o.status in ('em_andamento', 'orcada')
   and o.proximo_acompanhamento <= current_date;

grant select on public.crm_v_profissionais, public.crm_v_agenda to authenticated;
revoke all on public.crm_v_profissionais, public.crm_v_agenda from anon;

-- ---------------------------------------------------------------------
-- 5. Mensagens em "gratificação" (o termo usado em todo o CRM)
-- ---------------------------------------------------------------------
create or replace function public.crm_comissao_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  is_ger boolean := public.crm_is_gerencial();
  is_db_admin boolean := auth.uid() is null; -- SQL Editor / backend sem JWT
begin
  if tg_op = 'UPDATE' and not is_ger and not is_db_admin then
    if new.valor is distinct from old.valor
       or new.percentual is distinct from old.percentual
       or new.tipo is distinct from old.tipo
       or new.profissional_id is distinct from old.profissional_id then
      raise exception 'Somente o perfil Gerencial pode alterar valores de gratificação';
    end if;
    if new.status in ('paga', 'cancelada') and new.status is distinct from old.status then
      raise exception 'Somente o perfil Gerencial pode registrar pagamento ou cancelar gratificação';
    end if;
    if new.pago_em is distinct from old.pago_em
       or new.comprovante_path is distinct from old.comprovante_path then
      raise exception 'Somente o perfil Gerencial pode registrar pagamento';
    end if;
  end if;

  if new.status = 'paga' then
    if new.cliente_quitou_em is null then
      raise exception 'A gratificação só pode ser paga depois que o Dono da Obra quitar o pedido';
    end if;
    new.pago_em := coalesce(new.pago_em, current_date);
    new.pago_por := coalesce(new.pago_por, auth.uid());
  end if;

  if new.cliente_quitou_em is not null and new.status = 'aguardando_recebimento' then
    new.status := 'a_pagar';
  end if;

  new.divergente := new.valor_combinado is not null and new.tipo = 'fixa'
                    and new.valor_combinado <> new.valor;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Indicação registrada pelo operador a partir de áudio/mensagem no WhatsApp
-- ---------------------------------------------------------------------
alter table public.crm_obras drop constraint if exists crm_obras_origem_cadastro_check;
alter table public.crm_obras add constraint crm_obras_origem_cadastro_check
  check (origem_cadastro in ('operador', 'link_indicacao', 'whatsapp', 'conciliacao'));

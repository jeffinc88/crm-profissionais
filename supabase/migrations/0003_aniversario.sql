-- =====================================================================
-- CRM de Profissionais — 0003: data de nascimento e aviso de aniversário
-- Pode ser rodado de novo sem estragar nada.
-- =====================================================================

-- 1. Campo novo no cadastro do Profissional
alter table public.crm_profissionais
  add column if not exists data_nascimento date;

-- 2. As views usam p.*, então precisam ser recriadas para enxergar a coluna nova
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
       coalesce(k.pago, 0)       as comissao_paga,
       -- próximo aniversário (29/02 cai em 28/02 nos anos não bissextos)
       case when p.data_nascimento is not null then
         case when (p.data_nascimento + make_interval(years => extract(year from current_date)::int - extract(year from p.data_nascimento)::int))::date >= current_date
              then (p.data_nascimento + make_interval(years => extract(year from current_date)::int - extract(year from p.data_nascimento)::int))::date
              else (p.data_nascimento + make_interval(years => extract(year from current_date)::int + 1 - extract(year from p.data_nascimento)::int))::date
         end
       end as proximo_aniversario
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
-- Aniversário: aparece 7 dias antes (tempo de comprar o presente) até o próprio dia
select 'aniversario', p.id, null, p.nome, p.telefone,
       case when p.proximo_aniversario = current_date
            then format('Aniversário HOJE — faz %s anos', extract(year from p.proximo_aniversario)::int - extract(year from p.data_nascimento)::int)
            else format('Aniversário em %s (daqui %s dias) — faz %s anos',
                        to_char(p.proximo_aniversario, 'DD/MM'), p.proximo_aniversario - current_date,
                        extract(year from p.proximo_aniversario)::int - extract(year from p.data_nascimento)::int)
       end,
       p.proximo_aniversario, 0
  from public.crm_v_profissionais p
 where p.ativo
   and p.proximo_aniversario between current_date and current_date + 7
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

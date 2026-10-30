-- =====================================================================
-- CRM de Profissionais — 0004: link GERAL "Indique uma obra"
-- (o do cartão de visita / cartaz: um link só, para qualquer profissional)
-- Pode ser rodado de novo sem estragar nada.
-- =====================================================================

-- 1. A indicação pode chegar sem profissional definido: guarda quem disse ser
alter table public.crm_indicacoes
  alter column profissional_id drop not null,
  add column if not exists indicador_nome     text,
  add column if not exists indicador_telefone text,
  add column if not exists origem             text not null default 'link_pessoal';

alter table public.crm_indicacoes drop constraint if exists crm_indicacoes_origem_check;
alter table public.crm_indicacoes add constraint crm_indicacoes_origem_check
  check (origem in ('link_pessoal', 'link_geral'));

-- 2. Página pública geral: grava a indicação (o visitante nunca lê nada do banco).
--    Se o telefone de quem indica bate com um profissional ativo, já liga a ele;
--    se não, o operador escolhe ou cadastra o profissional na hora de aprovar.
create or replace function public.crm_enviar_indicacao_geral(
  p_indicador_nome text, p_indicador_telefone text,
  p_dono_nome text, p_dono_telefone text, p_endereco text, p_etapa text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_tel  text := regexp_replace(coalesce(p_indicador_telefone, ''), '\D', '', 'g');
  v_prof uuid;
begin
  if v_tel like '55%' and length(v_tel) >= 12 then v_tel := substr(v_tel, 3); end if;

  if coalesce(length(trim(p_indicador_nome)), 0) < 2 then raise exception 'Informe o seu nome'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Informe o seu telefone com DDD'; end if;
  if coalesce(length(trim(p_dono_nome)), 0) < 2 then raise exception 'Informe o nome do dono da obra'; end if;
  if coalesce(length(trim(p_endereco)), 0) < 3 and coalesce(length(regexp_replace(p_dono_telefone, '\D', '', 'g')), 0) < 10 then
    raise exception 'Informe o endereço da obra ou o telefone do dono';
  end if;

  -- travas simples contra abuso: 30 por telefone e 300 no total, em 24h
  if (select count(*) from public.crm_indicacoes
       where indicador_telefone = v_tel and recebida_em > now() - interval '24 hours') >= 30
     or (select count(*) from public.crm_indicacoes
       where origem = 'link_geral' and recebida_em > now() - interval '24 hours') >= 300 then
    raise exception 'Limite de indicações por dia atingido. Fale com a fábrica.';
  end if;

  select id into v_prof from public.crm_profissionais
   where ativo and telefone in (v_tel, '55' || v_tel)
   order by created_at limit 1;

  insert into public.crm_indicacoes
    (profissional_id, indicador_nome, indicador_telefone, origem,
     dono_nome, dono_telefone, endereco, etapa)
  values (
    v_prof, left(trim(p_indicador_nome), 120), v_tel, 'link_geral',
    left(trim(p_dono_nome), 120),
    nullif(left(regexp_replace(coalesce(p_dono_telefone, ''), '\D', '', 'g'), 13), ''),
    nullif(left(trim(p_endereco), 200), ''),
    nullif(left(trim(p_etapa), 60), '')
  );
  return true;
end $$;

revoke execute on function public.crm_enviar_indicacao_geral(text, text, text, text, text, text) from public;
grant execute on function public.crm_enviar_indicacao_geral(text, text, text, text, text, text) to anon, authenticated;

-- 3. Aprovar: quando a indicação chegou sem profissional, o operador informa qual é
drop function if exists public.crm_aprovar_indicacao(uuid, uuid);
create or replace function public.crm_aprovar_indicacao(
  p_indicacao_id uuid, p_obra_existente uuid default null, p_profissional_id uuid default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_ind public.crm_indicacoes; v_obra uuid; v_prof uuid;
begin
  if not public.crm_is_operador() then raise exception 'Acesso restrito aos operadores do CRM'; end if;
  select * into v_ind from public.crm_indicacoes where id = p_indicacao_id for update;
  if not found or v_ind.status <> 'pendente' then raise exception 'Indicação não está pendente'; end if;

  v_prof := coalesce(p_profissional_id, v_ind.profissional_id);
  if v_prof is null then raise exception 'Escolha quem indicou (ou cadastre o profissional) antes de aprovar'; end if;

  if p_obra_existente is not null then
    v_obra := p_obra_existente;
    update public.crm_obras
       set indicado_em = coalesce(indicado_em, v_ind.recebida_em)
     where id = v_obra;
  else
    insert into public.crm_obras (profissional_id, papel, dono_nome, dono_telefone, endereco, cidade,
                                  status, indicado_em, origem_cadastro, observacoes)
    values (v_prof, 'indicador', v_ind.dono_nome, v_ind.dono_telefone, v_ind.endereco, v_ind.cidade,
            'em_andamento', v_ind.recebida_em, 'link_indicacao',
            nullif(concat_ws(E'\n',
              'Etapa informada: ' || v_ind.etapa,
              'Previsão da laje (informada): ' || v_ind.previsao_laje,
              v_ind.observacao), ''))
    returning id into v_obra;
  end if;

  update public.crm_indicacoes
     set status = 'aprovada', obra_id = v_obra, profissional_id = v_prof,
         revisada_em = now(), revisada_por = auth.uid()
   where id = v_ind.id;
  return v_obra;
end $$;
revoke execute on function public.crm_aprovar_indicacao(uuid, uuid, uuid) from public, anon;
grant execute on function public.crm_aprovar_indicacao(uuid, uuid, uuid) to authenticated;

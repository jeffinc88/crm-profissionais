-- =====================================================================
-- 0008 — Integração com o app de orçamentos (lajes-backend)
--
-- O app e o CRM usam o mesmo banco. O backend do app (conexão direta,
-- sem passar pela API pública) chama as funções crm_app_* abaixo:
--   * carteira do vendedor para o campo "Profissional da obra";
--   * obra do CRM que bate com o telefone/CPF do cliente (aviso "obra indicada");
--   * orçamento salvo  → obra fica "Orçada" (ou é criada) e lead vira "orçado";
--   * pedido confirmado → entra no CRM e, se tudo bater, é conciliado sozinho.
--     Só fica na Fila de Conciliação o que precisa de alguém olhar.
--
-- Essas funções NÃO ficam disponíveis para o site (anon/authenticated).
-- Pode rodar mais de uma vez.
-- =====================================================================

-- 1. Vendedor do app ↔ operador do CRM ---------------------------------
alter table public.crm_operadores add column if not exists app_usuario_id integer;
create unique index if not exists crm_operadores_app_usuario_idx
  on public.crm_operadores (app_usuario_id) where app_usuario_id is not null;

-- Liga automaticamente quem usa o mesmo e-mail no app e no CRM
do $$
begin
  if to_regclass('public.users') is not null then
    update public.crm_operadores o
       set app_usuario_id = u.id
      from auth.users a
      join public.users u on lower(u.email) = lower(a.email)
     where a.id = o.user_id
       and o.app_usuario_id is null
       and not exists (select 1 from public.crm_operadores x where x.app_usuario_id = u.id);
  end if;
end $$;

-- Lista de usuários do app para a tela de Configurações do CRM (só gerência)
create or replace function public.crm_usuarios_app()
returns table (id integer, nome text, email text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.crm_perfil() is distinct from 'gerencial' then
    raise exception 'Acesso restrito à gerência';
  end if;
  if to_regclass('public.users') is null then return; end if;
  return query execute 'select id::integer, name::text, email::text from public.users order by name';
end $$;
revoke execute on function public.crm_usuarios_app() from public, anon;
grant  execute on function public.crm_usuarios_app() to authenticated;

-- 2. Campos novos -------------------------------------------------------
alter table public.crm_obras drop constraint if exists crm_obras_origem_cadastro_check;
alter table public.crm_obras add constraint crm_obras_origem_cadastro_check
  check (origem_cadastro in ('operador', 'link_indicacao', 'whatsapp', 'conciliacao', 'app'));

alter table public.crm_pedidos_app
  add column if not exists conciliacao_auto boolean not null default false,
  add column if not exists motivo_fila      text,     -- por que ficou para alguém olhar
  add column if not exists profissional_id  uuid references public.crm_profissionais(id) on delete set null,
  add column if not exists app_obra_id      uuid references public.crm_obras(id) on delete set null;

-- helpers
create or replace function public.crm__digitos(t text)
returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') $$;

create or replace function public.crm__mesmo_telefone(a text, b text)
returns boolean language sql immutable as $$
  select length(public.crm__digitos(a)) >= 8 and length(public.crm__digitos(b)) >= 8
     and right(public.crm__digitos(a), 8) = right(public.crm__digitos(b), 8)
$$;

-- 3. Conciliação: o núcleo vira uma função interna, usada pela tela e pelo app
create or replace function public.crm__conciliar_core(
  p_pedido_id   uuid,
  p_obra_id     uuid,
  p_tipo        text,
  p_percentual  numeric,
  p_valor_fixo  numeric,
  p_por         uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_pedido  public.crm_pedidos_app;
  v_obra    public.crm_obras;
  v_prof    public.crm_profissionais;
  v_cfg     public.crm_config;
  v_tipo    text;
  v_perc    numeric;
  v_valor   numeric;
  v_gera    boolean;
  v_com_id  uuid;
begin
  select * into v_pedido from public.crm_pedidos_app where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_pedido.status_conciliacao <> 'pendente' then
    raise exception 'Este pedido já foi conciliado';
  end if;

  select * into v_obra from public.crm_obras where id = p_obra_id for update;
  if not found then raise exception 'Obra não encontrada'; end if;
  select * into v_prof from public.crm_profissionais where id = v_obra.profissional_id;
  select * into v_cfg  from public.crm_config where id = 1;

  update public.crm_obras
     set status          = case when status = 'entregue' then status else 'fechada' end,
         data_fechamento = coalesce(data_fechamento, v_pedido.data_fechamento::date),
         valor_produtos  = v_pedido.valor_produtos,
         dono_nome       = coalesce(dono_nome, v_pedido.cliente_nome),
         dono_documento  = coalesce(dono_documento, v_pedido.cliente_documento),
         dono_telefone   = coalesce(dono_telefone, v_pedido.cliente_telefone)
   where id = v_obra.id;

  update public.crm_pedidos_app
     set status_conciliacao = 'conciliado', obra_id = v_obra.id,
         conciliado_em = now(), conciliado_por = p_por, motivo_fila = null
   where id = v_pedido.id;

  -- Quem gera gratificação: Indicador sempre; Profissional da Obra só se a regra estiver ligada;
  -- Comprador nunca (Q30).
  v_gera := v_prof.id is not null and (
              v_obra.papel = 'indicador'
              or (v_obra.papel = 'profissional_da_obra' and v_cfg.comissao_profissional_obra));

  if v_gera then
    v_tipo := coalesce(p_tipo, v_obra.tipo_comissao,
                       case when v_pedido.valor_outras_despesas > 0 then 'fixa' end,
                       v_prof.tipo_comissao_padrao);
    if v_tipo = 'percentual' then
      v_perc  := coalesce(p_percentual,
                          case when v_prof.tipo_comissao_padrao = 'percentual' then v_prof.valor_comissao_padrao end,
                          v_cfg.percentual_padrao);
      v_valor := round(v_pedido.valor_produtos * v_perc / 100, 2);
    else
      v_valor := coalesce(p_valor_fixo,
                          nullif(v_pedido.valor_outras_despesas, 0),
                          v_obra.valor_comissao_combinado,
                          case when v_prof.tipo_comissao_padrao = 'fixa' then v_prof.valor_comissao_padrao end,
                          0);
    end if;

    insert into public.crm_comissoes
      (obra_id, profissional_id, pedido_id, tipo, percentual, base_calculo,
       valor, valor_combinado, profissional_omitido)
    values
      (v_obra.id, v_prof.id, v_pedido.id, v_tipo, v_perc, v_pedido.valor_produtos,
       v_valor, v_obra.valor_comissao_combinado, not v_pedido.originado_crm)
    on conflict (obra_id) do nothing
    returning id into v_com_id;
  end if;

  return v_com_id;
end $$;
revoke execute on function public.crm__conciliar_core(uuid, uuid, text, numeric, numeric, uuid) from public, anon, authenticated;

-- A tela de Conciliação continua igual (mesma assinatura e mesmas regras)
create or replace function public.crm_conciliar(
  p_pedido_id   uuid,
  p_obra_id     uuid,
  p_tipo        text    default null,
  p_percentual  numeric default null,
  p_valor_fixo  numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not public.crm_is_interno() then
    raise exception 'Acesso restrito aos operadores do CRM';
  end if;
  return public.crm__conciliar_core(p_pedido_id, p_obra_id, p_tipo, p_percentual, p_valor_fixo, auth.uid());
end $$;

-- 4. Funções chamadas pelo backend do app --------------------------------

-- Operador do CRM que corresponde ao usuário do app (null = não ligado)
create or replace function public.crm__operador_do_app(p_app_usuario integer)
returns uuid language sql stable security definer set search_path = public
as $$ select user_id from public.crm_operadores where app_usuario_id = p_app_usuario and ativo $$;

-- Carteira para o campo "Profissional da obra".
-- Admin do app vê todos; vendedor vê só os que estão sob a responsabilidade dele.
create or replace function public.crm_app_carteira(p_app_usuario integer, p_admin boolean)
returns table (id uuid, nome text, apelido text, cidade text, telefone text,
               categoria text, ultima_venda date, responsavel text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nome, p.apelido, p.cidade, p.telefone, p.categoria, p.ultima_venda,
         split_part(op.nome, ' ', 1)
    from public.crm_v_profissionais p
    left join public.crm_operadores op on op.user_id = p.responsavel_id
   where p.ativo
     and (p_admin or p.responsavel_id = public.crm__operador_do_app(p_app_usuario))
   order by p.nome
$$;

-- Obra em aberto do CRM que bate com o telefone ou o CPF/CNPJ do cliente
create or replace function public.crm_app_obra_sugerida(
  p_app_usuario integer, p_admin boolean, p_telefone text, p_documento text
) returns table (obra_id uuid, profissional_id uuid, profissional_nome text, apelido text,
                 cidade text, papel text, status text, origem text, indicado_em timestamptz,
                 outra_carteira boolean)
language sql stable security definer set search_path = public
as $$
  select o.id, p.id, p.nome, p.apelido, p.cidade, o.papel, o.status, o.origem_cadastro, o.indicado_em,
         not (p_admin or p.responsavel_id is null
              or p.responsavel_id = public.crm__operador_do_app(p_app_usuario))
    from public.crm_obras o
    join public.crm_profissionais p on p.id = o.profissional_id
   where o.status in ('em_andamento', 'orcada')
     and (public.crm__mesmo_telefone(o.dono_telefone, p_telefone)
          or (length(public.crm__digitos(p_documento)) >= 11
              and public.crm__digitos(o.dono_documento) = public.crm__digitos(p_documento)))
   order by coalesce(o.indicado_em, o.created_at) desc
   limit 1
$$;

-- Orçamento salvo no app. Devolve a obra do CRM ligada a ele (ou null).
--  p: { app_orcamento_id, profissional_id, obra_id, outras_despesas,
--       cliente_nome, cliente_telefone, cliente_documento, cidade, endereco }
create or replace function public.crm_app_orcamento_salvo(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_prof   uuid := nullif(p->>'profissional_id', '')::uuid;
  v_obra   public.crm_obras;
  v_outras numeric := coalesce(nullif(p->>'outras_despesas', '')::numeric, 0);
  v_tel    text := public.crm__digitos(p->>'cliente_telefone');
  v_doc    text := public.crm__digitos(p->>'cliente_documento');
begin
  -- Lead da calculadora do site com o mesmo telefone: passa para "orçado"
  update public.crm_leads_site
     set status = 'orcado', atualizado_em = now()
   where status in ('novo', 'em_atendimento')
     and public.crm__mesmo_telefone(telefone, v_tel);

  if v_prof is null then return null; end if;

  -- 1º a obra que o vendedor vinculou; 2º uma obra aberta do mesmo profissional e mesmo cliente
  select * into v_obra from public.crm_obras
   where id = nullif(p->>'obra_id', '')::uuid and profissional_id = v_prof;
  if not found then
    select * into v_obra from public.crm_obras o
     where o.profissional_id = v_prof
       and o.status in ('em_andamento', 'orcada')
       and (public.crm__mesmo_telefone(o.dono_telefone, v_tel)
            or (length(v_doc) >= 11 and public.crm__digitos(o.dono_documento) = v_doc))
     order by o.created_at desc limit 1;
  end if;

  if found then
    update public.crm_obras
       set status = case when status = 'em_andamento' then 'orcada' else status end,
           tipo_comissao = coalesce(tipo_comissao, case when v_outras > 0 then 'fixa' end),
           valor_comissao_combinado = coalesce(valor_comissao_combinado, nullif(v_outras, 0)),
           dono_documento = coalesce(dono_documento, v_doc),
           dono_telefone  = coalesce(dono_telefone, v_tel),
           updated_at = now()
     where id = v_obra.id;
    return v_obra.id;
  end if;

  -- Não existe: cria a obra já como Orçada.
  -- Com gratificação em "Outras Despesas", o profissional entra como Indicador.
  insert into public.crm_obras
    (profissional_id, papel, dono_nome, dono_telefone, dono_documento, endereco, cidade,
     status, tipo_comissao, valor_comissao_combinado, origem_cadastro, created_by, observacoes)
  values
    (v_prof, case when v_outras > 0 then 'indicador' else 'profissional_da_obra' end,
     p->>'cliente_nome', v_tel, v_doc, nullif(p->>'endereco', ''), nullif(p->>'cidade', ''),
     'orcada', case when v_outras > 0 then 'fixa' end, nullif(v_outras, 0), 'app', null,
     'Criada pelo app (orçamento Nº ' || coalesce(p->>'app_orcamento_id', '?') || ')')
  returning * into v_obra;
  return v_obra.id;
end $$;

-- Pedido confirmado no app. Entra no CRM e tenta conciliar sozinho.
--  p: { app_orcamento_id, bling_pedido_id, data_orcamento, cliente_nome, cliente_documento,
--       cliente_telefone, cidade, vendedor_nome, valor_produtos, valor_frete,
--       valor_outras_despesas, profissional_id, obra_id, profissional_informado }
-- Devolve 'conciliado', 'fila' ou 'ja_conciliado'.
create or replace function public.crm_app_pedido_confirmado(p jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_ped    public.crm_pedidos_app;
  v_obra   public.crm_obras;
  v_prof   uuid := nullif(p->>'profissional_id', '')::uuid;
  v_outras numeric := coalesce(nullif(p->>'valor_outras_despesas', '')::numeric, 0);
  v_motivo text;
begin
  insert into public.crm_pedidos_app (
    app_orcamento_id, bling_pedido_id, data_orcamento, data_fechamento,
    cliente_nome, cliente_documento, cliente_telefone, cidade, vendedor_nome,
    valor_produtos, valor_frete, valor_outras_despesas,
    originado_crm, profissional_informado, profissional_id, app_obra_id)
  values (
    p->>'app_orcamento_id', nullif(p->>'bling_pedido_id', ''),
    nullif(p->>'data_orcamento', '')::timestamptz, coalesce(nullif(p->>'data_fechamento', '')::timestamptz, now()),
    p->>'cliente_nome', public.crm__digitos(p->>'cliente_documento'), public.crm__digitos(p->>'cliente_telefone'),
    nullif(p->>'cidade', ''), nullif(p->>'vendedor_nome', ''),
    coalesce(nullif(p->>'valor_produtos', '')::numeric, 0), coalesce(nullif(p->>'valor_frete', '')::numeric, 0), v_outras,
    v_prof is not null or nullif(p->>'profissional_informado', '') is not null,
    nullif(p->>'profissional_informado', ''), v_prof, nullif(p->>'obra_id', '')::uuid)
  on conflict (app_orcamento_id) do update set
    bling_pedido_id        = coalesce(excluded.bling_pedido_id, crm_pedidos_app.bling_pedido_id),
    cliente_nome           = excluded.cliente_nome,
    cliente_documento      = excluded.cliente_documento,
    cliente_telefone       = excluded.cliente_telefone,
    valor_produtos         = excluded.valor_produtos,
    valor_frete            = excluded.valor_frete,
    valor_outras_despesas  = excluded.valor_outras_despesas,
    originado_crm          = excluded.originado_crm,
    profissional_informado = excluded.profissional_informado,
    profissional_id        = excluded.profissional_id,
    app_obra_id            = excluded.app_obra_id
  where crm_pedidos_app.status_conciliacao = 'pendente'
  returning * into v_ped;

  if v_ped.id is null then return 'ja_conciliado'; end if;

  -- Lead da calculadora com o mesmo telefone: virou pedido
  update public.crm_leads_site
     set status = 'virou_pedido', atualizado_em = now()
   where status in ('novo', 'em_atendimento', 'orcado')
     and public.crm__mesmo_telefone(telefone, v_ped.cliente_telefone);

  -- Só concilia sozinho quando não há dúvida. Senão, fica na fila com o motivo.
  if v_ped.app_obra_id is null then
    v_motivo := case
      when v_ped.profissional_informado is not null
        then 'Profissional fora da lista: ' || v_ped.profissional_informado
      else null  -- sem profissional: a fila confere se algum pedreiro foi omitido (ADR 0009)
    end;
  else
    select * into v_obra from public.crm_obras where id = v_ped.app_obra_id;
    if not found or v_obra.profissional_id is distinct from v_prof then
      v_motivo := 'Obra do CRM mudou depois do orçamento';
    elsif v_obra.status in ('perdida') then
      v_motivo := 'A obra estava marcada como perdida no CRM';
    elsif exists (select 1 from public.crm_comissoes k where k.obra_id = v_obra.id) then
      v_motivo := 'A obra já tem gratificação lançada';
    elsif coalesce(v_obra.tipo_comissao, 'fixa') = 'fixa'
          and v_obra.valor_comissao_combinado is not null
          and v_obra.valor_comissao_combinado <> v_outras then
      v_motivo := format('Gratificação diferente da combinada (R$ %s na obra, R$ %s no pedido)',
                         replace(to_char(v_obra.valor_comissao_combinado, 'FM999999990.00'), '.', ','),
                         replace(to_char(v_outras, 'FM999999990.00'), '.', ','));
    end if;
  end if;

  if v_obra.id is not null and v_motivo is null then
    perform public.crm__conciliar_core(v_ped.id, v_obra.id, null, null, null, null);
    update public.crm_pedidos_app set conciliacao_auto = true where id = v_ped.id;
    return 'conciliado';
  end if;

  update public.crm_pedidos_app set motivo_fila = v_motivo where id = v_ped.id;
  return 'fila';
end $$;

-- Pedido desfeito no app (orçamento voltou a rascunho, fechamento em conjunto desfeito).
-- Tira o pedido do CRM se ninguém mexeu nele ainda; se foi conciliado sozinho e a
-- gratificação ainda não foi paga nem liberada, desfaz também.
create or replace function public.crm_app_pedido_desfeito(p_app_orcamento_id text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.crm_pedidos_app;
begin
  select * into v_ped from public.crm_pedidos_app where app_orcamento_id = p_app_orcamento_id for update;
  if not found then return 'nao_existe'; end if;

  if v_ped.status_conciliacao = 'pendente' then
    delete from public.crm_pedidos_app where id = v_ped.id;
    return 'removido';
  end if;

  if v_ped.conciliacao_auto
     and not exists (select 1 from public.crm_comissoes
                      where pedido_id = v_ped.id and status <> 'aguardando_recebimento') then
    delete from public.crm_comissoes where pedido_id = v_ped.id;
    update public.crm_obras
       set status = 'orcada', data_fechamento = null
     where id = v_ped.obra_id and status = 'fechada';
    delete from public.crm_pedidos_app where id = v_ped.id;
    return 'desfeito';
  end if;

  return 'manual';  -- conciliado por alguém ou gratificação já liberada: a gerência decide
end $$;

revoke execute on function public.crm_app_carteira(integer, boolean) from public, anon, authenticated;
revoke execute on function public.crm_app_obra_sugerida(integer, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.crm_app_orcamento_salvo(jsonb) from public, anon, authenticated;
revoke execute on function public.crm_app_pedido_confirmado(jsonb) from public, anon, authenticated;
revoke execute on function public.crm_app_pedido_desfeito(text) from public, anon, authenticated;
revoke execute on function public.crm__operador_do_app(integer) from public, anon, authenticated;

-- 5. Fila de Conciliação: mostra os campos novos (motivo, profissional e obra vindos do app)
drop view if exists public.crm_v_fila_conciliacao;
create view public.crm_v_fila_conciliacao
with (security_invoker = true) as
select pa.*,
       -- sugestões: a obra que veio do app + Obras com o mesmo documento ou telefone do cliente
       (select coalesce(json_agg(json_build_object(
                 'obra_id', o.id, 'dono_nome', o.dono_nome, 'endereco', o.endereco,
                 'profissional', pr.nome, 'status', o.status)), '[]'::json)
          from public.crm_obras o
          left join public.crm_profissionais pr on pr.id = o.profissional_id
         where o.status not in ('perdida')
           and not exists (select 1 from public.crm_pedidos_app x where x.obra_id = o.id)
           and (o.id = pa.app_obra_id
             or (pa.cliente_documento is not null and o.dono_documento = pa.cliente_documento)
             or (pa.cliente_telefone  is not null and public.crm__mesmo_telefone(o.dono_telefone, pa.cliente_telefone)))
       ) as sugestoes
  from public.crm_pedidos_app pa
 where pa.status_conciliacao = 'pendente';
grant select on public.crm_v_fila_conciliacao to authenticated;
revoke all on public.crm_v_fila_conciliacao from anon;

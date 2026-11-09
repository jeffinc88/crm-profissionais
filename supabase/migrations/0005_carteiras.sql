-- =====================================================================
-- CRM de Profissionais — 0005: carteiras de profissionais por vendedor
-- • Perfil novo "vendedor" (representantes e vendedores da fábrica)
-- • Cada profissional pode ter um vendedor responsável (carteira)
-- • Vendedor vê e trabalha só a própria carteira; gerência vê tudo
-- • Só o perfil Gerencial define ou transfere o responsável
-- • Vendedor não consegue cadastrar profissional que já existe no CRM
-- • Lista de carteiras paradas (sem contato há X dias) para a gerência
-- Rodar depois da 0004. Pode rodar de novo.
-- =====================================================================

-- 1. Perfil "vendedor"
alter table public.crm_operadores drop constraint if exists crm_operadores_perfil_check;
alter table public.crm_operadores add constraint crm_operadores_perfil_check
  check (perfil in ('gerencial', 'operacional', 'vendedor'));

-- Gerencial e Operacional são a equipe interna: veem a base inteira
create or replace function public.crm_is_interno()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.crm_perfil() in ('gerencial', 'operacional'), false) $$;

-- 2. Responsável pelo profissional (carteira)
alter table public.crm_profissionais
  add column if not exists responsavel_id uuid references public.crm_operadores(user_id) on delete set null;
create index if not exists crm_profissionais_resp_idx on public.crm_profissionais (responsavel_id);

alter table public.crm_config
  add column if not exists dias_carteira_parada int not null default 90 check (dias_carteira_parada > 0);

create or replace function public.crm_meu_profissional(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.crm_profissionais where id = p_id and responsavel_id = auth.uid()) $$;

-- 3. Regras do cadastro: vendedor vira responsável do que cadastra; só a gerência transfere;
--    vendedor não cadastra quem já existe (mesmo telefone) — sem revelar de quem é.
create or replace function public.crm_profissional_carteira_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_perfil text := public.crm_perfil();
  v_tel    text := regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g');
  v_resp   uuid;
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / backend

  if tg_op = 'INSERT' then
    if v_perfil = 'vendedor' then
      new.responsavel_id := auth.uid();
    elsif v_perfil <> 'gerencial' then
      new.responsavel_id := null;
    end if;
  elsif new.responsavel_id is distinct from old.responsavel_id and v_perfil <> 'gerencial' then
    raise exception 'Somente a gerência pode definir ou transferir o responsável.';
  end if;

  if v_perfil = 'vendedor' and length(v_tel) >= 10
     and (tg_op = 'INSERT' or regexp_replace(coalesce(old.telefone, ''), '\D', '', 'g') <> v_tel) then
    select responsavel_id into v_resp
      from public.crm_profissionais
     where id is distinct from new.id
       and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
       and left(right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11), 2) = left(right(v_tel, 11), 2)
     limit 1;
    if found then
      if v_resp is not null then
        raise exception 'Este profissional já tem um responsável. Fale com a gerência.';
      else
        raise exception 'Este profissional já está cadastrado no CRM. Fale com a gerência para ficar com ele.';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_prof_carteira_trg on public.crm_profissionais;
create trigger crm_prof_carteira_trg before insert or update on public.crm_profissionais
for each row execute function public.crm_profissional_carteira_guard();

-- 4. Quem vê o quê (RLS)
-- Profissionais
drop policy if exists crm_profissionais_select on public.crm_profissionais;
create policy crm_profissionais_select on public.crm_profissionais for select to authenticated
  using (public.crm_is_interno() or responsavel_id = auth.uid());
drop policy if exists crm_profissionais_update on public.crm_profissionais;
create policy crm_profissionais_update on public.crm_profissionais for update to authenticated
  using (public.crm_is_interno() or responsavel_id = auth.uid())
  with check (public.crm_is_interno() or responsavel_id = auth.uid());

-- Obras e contatos: da carteira
do $$
declare t text;
begin
  foreach t in array array['crm_obras', 'crm_contatos'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id))', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.crm_is_interno() or public.crm_meu_profissional(profissional_id))', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id)) with check (public.crm_is_interno() or public.crm_meu_profissional(profissional_id))', t);
  end loop;
end $$;

-- Gratificações: vendedor só lê as da carteira
drop policy if exists crm_comissoes_select on public.crm_comissoes;
create policy crm_comissoes_select on public.crm_comissoes for select to authenticated
  using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id));
drop policy if exists crm_comissoes_insert on public.crm_comissoes;
create policy crm_comissoes_insert on public.crm_comissoes for insert to authenticated with check (public.crm_is_interno());
drop policy if exists crm_comissoes_update on public.crm_comissoes;
create policy crm_comissoes_update on public.crm_comissoes for update to authenticated
  using (public.crm_is_interno()) with check (public.crm_is_interno());

-- Pedidos do app (Conciliação): só a equipe interna
drop policy if exists crm_pedidos_app_select on public.crm_pedidos_app;
create policy crm_pedidos_app_select on public.crm_pedidos_app for select to authenticated using (public.crm_is_interno());

-- Indicações: vendedor vê as dos profissionais dele
drop policy if exists crm_indicacoes_select on public.crm_indicacoes;
create policy crm_indicacoes_select on public.crm_indicacoes for select to authenticated
  using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id));
drop policy if exists crm_indicacoes_update on public.crm_indicacoes;
create policy crm_indicacoes_update on public.crm_indicacoes for update to authenticated
  using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id))
  with check (public.crm_is_interno() or public.crm_meu_profissional(profissional_id));

-- Histórico
drop policy if exists crm_historico_select on public.crm_historico;
create policy crm_historico_select on public.crm_historico for select to authenticated
  using (public.crm_is_interno() or public.crm_meu_profissional(profissional_id));

-- Operadores: vendedor só enxerga a própria linha
drop policy if exists crm_operadores_select on public.crm_operadores;
create policy crm_operadores_select on public.crm_operadores for select to authenticated
  using (public.crm_is_interno() or user_id = auth.uid());

-- Comprovantes de pagamento: só equipe interna
drop policy if exists crm_comprovantes_select on storage.objects;
create policy crm_comprovantes_select on storage.objects for select to authenticated
  using (bucket_id = 'crm-comprovantes' and public.crm_is_interno());

-- 5. Funções que passam por cima do RLS: limitar à equipe interna (ou à carteira)
create or replace function public.crm_conciliar(
  p_pedido_id   uuid,
  p_obra_id     uuid,
  p_tipo        text    default null,  -- 'fixa' | 'percentual' | null = padrão do Profissional
  p_percentual  numeric default null,
  p_valor_fixo  numeric default null   -- null = usa "Outras Despesas" do pedido
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
  if not public.crm_is_interno() then
    raise exception 'Acesso restrito aos operadores do CRM';
  end if;

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
         conciliado_em = now(), conciliado_por = auth.uid()
   where id = v_pedido.id;

  -- Quem gera comissão: Indicador sempre; Profissional da Obra só se a regra estiver ligada;
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

create or replace function public.crm_marcar_sem_profissional(p_pedido_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.crm_is_interno() then
    raise exception 'Acesso restrito aos operadores do CRM';
  end if;
  update public.crm_pedidos_app
     set status_conciliacao = 'sem_profissional', conciliado_em = now(), conciliado_por = auth.uid()
   where id = p_pedido_id and status_conciliacao = 'pendente';
end $$;

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
  -- Vendedor só aprova indicação de profissional da carteira dele
  if not public.crm_is_interno() and not public.crm_meu_profissional(v_prof) then
    raise exception 'Esta indicação não é de um profissional da sua carteira. Fale com a gerência.';
  end if;

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

-- 6. Views recriadas (p.* precisa enxergar responsavel_id)
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


-- 7. Carteiras paradas: profissional com responsável e sem contato registrado há X dias
create or replace view public.crm_v_carteiras_paradas
with (security_invoker = true) as
select p.id as profissional_id, p.nome, p.apelido, p.telefone, p.cidade,
       p.responsavel_id, o.nome as responsavel_nome,
       c.ultimo_contato,
       (current_date - coalesce(c.ultimo_contato::date, p.created_at::date)) as dias_sem_contato,
       cfg.dias_carteira_parada
  from public.crm_profissionais p
  cross join public.crm_config cfg
  join public.crm_operadores o on o.user_id = p.responsavel_id
  left join lateral (select max(data) as ultimo_contato from public.crm_contatos k where k.profissional_id = p.id) c on true
 where p.ativo
   and (current_date - coalesce(c.ultimo_contato::date, p.created_at::date)) >= cfg.dias_carteira_parada;

grant select on public.crm_v_carteiras_paradas to authenticated;
revoke all on public.crm_v_carteiras_paradas from anon;

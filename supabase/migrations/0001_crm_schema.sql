-- =====================================================================
-- CRM de Profissionais — Carvalho Pré-Moldados
-- Migração 0001: schema completo da v1
-- Rodar no SQL Editor do Supabase (mesmo projeto do app comercial).
-- Todas as tabelas usam o prefixo crm_ para não colidir com as do app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Operadores e perfis
-- ---------------------------------------------------------------------
create table if not exists public.crm_operadores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  perfil     text not null check (perfil in ('gerencial', 'operacional')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.crm_perfil()
returns text
language sql stable security definer set search_path = public
as $$
  select perfil from public.crm_operadores
  where user_id = auth.uid() and ativo
$$;

create or replace function public.crm_is_operador()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.crm_perfil() is not null $$;

create or replace function public.crm_is_gerencial()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.crm_perfil() = 'gerencial', false) $$;

-- ---------------------------------------------------------------------
-- 2. Configuração (linha única) — só o Gerencial altera
-- ---------------------------------------------------------------------
create table if not exists public.crm_config (
  id                          int primary key default 1 check (id = 1),
  prazo_recompra_dias         int     not null default 60 check (prazo_recompra_dias > 0),
  dias_pos_entrega            int     not null default 3  check (dias_pos_entrega >= 0),
  comissao_profissional_obra  boolean not null default false,  -- Q15: desligado por padrão
  percentual_padrao           numeric(5,2) not null default 0, -- sugestão para novos cadastros
  updated_at                  timestamptz not null default now()
);
insert into public.crm_config (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Categorias de Profissional
-- ---------------------------------------------------------------------
create table if not exists public.crm_categorias (
  id    serial primary key,
  nome  text not null unique,
  ordem int  not null default 0
);
insert into public.crm_categorias (nome, ordem) values
  ('Pedreiro', 1), ('Mestre de Obras', 2), ('Empreiteiro', 3),
  ('Engenheiro', 4), ('Arquiteto', 5), ('Outro', 99)
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 4. Profissionais
-- ---------------------------------------------------------------------
create table if not exists public.crm_profissionais (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  apelido                text,
  telefone               text,            -- só dígitos, com DDD (ex.: 16999998888)
  cidade                 text,
  categoria_id           int references public.crm_categorias(id),
  tipo_comissao_padrao   text not null default 'fixa' check (tipo_comissao_padrao in ('fixa', 'percentual')),
  valor_comissao_padrao  numeric(12,2),  -- R$ por obra (fixa) ou % (percentual)
  prazo_recompra_dias    int check (prazo_recompra_dias > 0), -- null = usa o da config
  chave_pix              text,
  proximo_contato        date,            -- agenda manual (snooze dos alertas)
  observacoes            text,
  ativo                  boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now()
);
create index if not exists crm_profissionais_nome_idx on public.crm_profissionais (lower(nome));
create index if not exists crm_profissionais_tel_idx  on public.crm_profissionais (telefone);

-- ---------------------------------------------------------------------
-- 5. Obras
-- ---------------------------------------------------------------------
create table if not exists public.crm_obras (
  id                        uuid primary key default gen_random_uuid(),
  profissional_id           uuid references public.crm_profissionais(id) on delete set null,
  papel                     text not null default 'indicador'
                              check (papel in ('indicador', 'comprador', 'profissional_da_obra')),
  dono_nome                 text,
  dono_telefone             text,
  dono_documento            text,           -- CPF/CNPJ, usado na Conciliação
  endereco                  text,
  cidade                    text,
  status                    text not null default 'em_andamento'
                              check (status in ('em_andamento', 'orcada', 'fechada', 'perdida', 'entregue')),
  motivo_perda              text,
  previsao_laje             date,
  proximo_acompanhamento    date,
  data_fechamento           date,
  data_entrega              date,
  pos_entrega_feito         boolean not null default false,
  tipo_comissao             text check (tipo_comissao in ('fixa', 'percentual')),
  valor_comissao_combinado  numeric(12,2),  -- o que o vendedor combinou com o Profissional
  valor_produtos            numeric(12,2),
  observacoes               text,
  created_at                timestamptz not null default now(),
  created_by                uuid default auth.uid(),
  updated_at                timestamptz not null default now(),
  constraint crm_obras_motivo_perda_chk
    check (status <> 'perdida' or motivo_perda is not null)
);
create index if not exists crm_obras_prof_idx   on public.crm_obras (profissional_id);
create index if not exists crm_obras_status_idx on public.crm_obras (status);

-- ---------------------------------------------------------------------
-- 6. Contatos (histórico do relacionamento)
-- ---------------------------------------------------------------------
create table if not exists public.crm_contatos (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  uuid not null references public.crm_profissionais(id) on delete cascade,
  obra_id          uuid references public.crm_obras(id) on delete set null,
  operador_id      uuid default auth.uid(),
  data             timestamptz not null default now(),
  canal            text not null default 'whatsapp'
                     check (canal in ('whatsapp', 'ligacao', 'visita', 'outro')),
  motivo           text check (motivo in ('recompra', 'pos_entrega', 'acompanhamento', 'agendado', 'avulso')),
  resumo           text not null,
  proxima_data     date
);
create index if not exists crm_contatos_prof_idx on public.crm_contatos (profissional_id, data desc);

-- Ao registrar um contato: atualiza o próximo contato do Profissional e,
-- se for pós-entrega, marca a Obra como verificada.
create or replace function public.crm_after_contato()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.crm_profissionais
     set proximo_contato = new.proxima_data, updated_at = now()
   where id = new.profissional_id;

  if new.obra_id is not null and new.motivo = 'pos_entrega' then
    update public.crm_obras set pos_entrega_feito = true, updated_at = now()
     where id = new.obra_id;
  end if;

  if new.obra_id is not null and new.motivo = 'acompanhamento' then
    update public.crm_obras
       set proximo_acompanhamento = coalesce(new.proxima_data, current_date + 30), updated_at = now()
     where id = new.obra_id;
  end if;
  return new;
end $$;

drop trigger if exists crm_after_contato_trg on public.crm_contatos;
create trigger crm_after_contato_trg after insert on public.crm_contatos
for each row execute function public.crm_after_contato();

-- ---------------------------------------------------------------------
-- 7. Pedidos vindos do app comercial (alimentam a Fila de Conciliação)
--    O backend do app grava aqui quando um orçamento vira pedido fechado.
-- ---------------------------------------------------------------------
create table if not exists public.crm_pedidos_app (
  id                         uuid primary key default gen_random_uuid(),
  app_orcamento_id           text not null unique,
  bling_pedido_id            text,
  data_orcamento             timestamptz,      -- define a Origem (ADR 0006)
  data_fechamento            timestamptz not null default now(),
  cliente_nome               text,
  cliente_documento          text,
  cliente_telefone           text,
  cidade                     text,
  vendedor_nome              text,
  valor_produtos             numeric(12,2) not null default 0,
  valor_frete                numeric(12,2) not null default 0,
  valor_outras_despesas      numeric(12,2) not null default 0, -- Comissão Fixa embutida
  originado_crm              boolean not null default false,   -- aviso do vendedor
  profissional_informado     text,                             -- nome que o vendedor digitou
  status_conciliacao         text not null default 'pendente'
                               check (status_conciliacao in ('pendente', 'conciliado', 'sem_profissional')),
  obra_id                    uuid references public.crm_obras(id) on delete set null,
  conciliado_em              timestamptz,
  conciliado_por             uuid,
  created_at                 timestamptz not null default now()
);
create index if not exists crm_pedidos_status_idx on public.crm_pedidos_app (status_conciliacao);

-- ---------------------------------------------------------------------
-- 8. Comissões (Extrato)
-- ---------------------------------------------------------------------
create table if not exists public.crm_comissoes (
  id                           uuid primary key default gen_random_uuid(),
  obra_id                      uuid not null unique references public.crm_obras(id) on delete restrict,
  profissional_id              uuid not null references public.crm_profissionais(id) on delete restrict,
  pedido_id                    uuid references public.crm_pedidos_app(id) on delete set null,
  tipo                         text not null check (tipo in ('fixa', 'percentual')),
  percentual                   numeric(5,2),
  base_calculo                 numeric(12,2),   -- valor dos produtos, sem frete (Q19)
  valor                        numeric(12,2) not null check (valor >= 0),
  valor_combinado              numeric(12,2),   -- o que constava na Obra (checagem)
  divergente                   boolean not null default false,
  profissional_omitido         boolean not null default false, -- ADR 0009
  status                       text not null default 'aguardando_recebimento'
                                 check (status in ('aguardando_recebimento', 'a_pagar', 'paga', 'cancelada')),
  cliente_quitou_em            date,
  pago_em                      date,
  pago_por                     uuid,
  comprovante_path             text,
  observacoes                  text,
  created_at                   timestamptz not null default now(),
  created_by                   uuid default auth.uid(),
  updated_at                   timestamptz not null default now()
);
create index if not exists crm_comissoes_prof_idx on public.crm_comissoes (profissional_id, status);

-- Regras de quem pode mexer em quê nas comissões (Q33):
-- • Operacional cria (na Conciliação) e marca "cliente quitou" (→ a_pagar).
-- • Só o Gerencial altera valores, cancela ou registra o pagamento.
-- • Comissão só pode ser paga depois que o cliente quitou (Q12).
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
      raise exception 'Somente o perfil Gerencial pode alterar valores de comissão';
    end if;
    if new.status in ('paga', 'cancelada') and new.status is distinct from old.status then
      raise exception 'Somente o perfil Gerencial pode registrar pagamento ou cancelar comissão';
    end if;
    if new.pago_em is distinct from old.pago_em
       or new.comprovante_path is distinct from old.comprovante_path then
      raise exception 'Somente o perfil Gerencial pode registrar pagamento';
    end if;
  end if;

  if new.status = 'paga' then
    if new.cliente_quitou_em is null then
      raise exception 'A comissão só pode ser paga depois que o Dono da Obra quitar o pedido';
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

drop trigger if exists crm_comissao_guard_trg on public.crm_comissoes;
create trigger crm_comissao_guard_trg before insert or update on public.crm_comissoes
for each row execute function public.crm_comissao_guard();

-- Configuração: só o Gerencial altera
create or replace function public.crm_config_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.crm_is_gerencial() then
    raise exception 'Somente o perfil Gerencial pode alterar as regras do CRM';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_config_guard_trg on public.crm_config;
create trigger crm_config_guard_trg before update on public.crm_config
for each row execute function public.crm_config_guard();

-- updated_at automático
create or replace function public.crm_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists crm_prof_touch on public.crm_profissionais;
create trigger crm_prof_touch before update on public.crm_profissionais
for each row execute function public.crm_touch();
drop trigger if exists crm_obra_touch on public.crm_obras;
create trigger crm_obra_touch before update on public.crm_obras
for each row execute function public.crm_touch();

-- Obra: preenche datas automaticamente conforme o status
create or replace function public.crm_obra_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('fechada', 'entregue') and new.data_fechamento is null then
    new.data_fechamento := current_date;
  end if;
  if new.status = 'entregue' and new.data_entrega is null then
    new.data_entrega := current_date;
  end if;
  if tg_op = 'INSERT' and new.proximo_acompanhamento is null
     and new.status in ('em_andamento', 'orcada') then
    new.proximo_acompanhamento := coalesce(new.previsao_laje - 15, current_date + 30);
    if new.proximo_acompanhamento < current_date then
      new.proximo_acompanhamento := current_date;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_obra_status_trg on public.crm_obras;
create trigger crm_obra_status_trg before insert or update on public.crm_obras
for each row execute function public.crm_obra_status();

-- ---------------------------------------------------------------------
-- 9. Conciliação (RPC) — liga um pedido do app a uma Obra e gera a comissão
-- ---------------------------------------------------------------------
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
  if not public.crm_is_operador() then
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
  if not public.crm_is_operador() then
    raise exception 'Acesso restrito aos operadores do CRM';
  end if;
  update public.crm_pedidos_app
     set status_conciliacao = 'sem_profissional', conciliado_em = now(), conciliado_por = auth.uid()
   where id = p_pedido_id and status_conciliacao = 'pendente';
end $$;

-- ---------------------------------------------------------------------
-- 10. Views: resumo do Profissional, Agenda e Fila de Conciliação
-- ---------------------------------------------------------------------
create or replace view public.crm_v_profissionais
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

-- Agenda do dia: uma linha por item a fazer
create or replace view public.crm_v_agenda
with (security_invoker = true) as
-- Recompra: passou do prazo sem Venda Originada (Q16). Some ao agendar um próximo contato futuro.
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
-- Contato agendado manualmente (que não seja já um caso de recompra)
select 'agendado', p.id, null, p.nome, p.telefone,
       'Contato agendado',
       p.proximo_contato, 2
  from public.crm_v_profissionais p
 where p.ativo
   and p.proximo_contato <= current_date
   and p.dias_sem_venda < p.prazo_efetivo
union all
-- Pós-entrega: confirmar com o Dono da Obra quem é o Profissional (ADR 0009)
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
-- Obra sem laje: acompanhamento de obras ainda em andamento ou orçadas
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

create or replace view public.crm_v_fila_conciliacao
with (security_invoker = true) as
select pa.*,
       -- sugestões: Obras com o mesmo documento ou telefone do cliente
       (select coalesce(json_agg(json_build_object(
                 'obra_id', o.id, 'dono_nome', o.dono_nome, 'endereco', o.endereco,
                 'profissional', pr.nome, 'status', o.status)), '[]'::json)
          from public.crm_obras o
          left join public.crm_profissionais pr on pr.id = o.profissional_id
         where o.status not in ('perdida')
           and not exists (select 1 from public.crm_pedidos_app x where x.obra_id = o.id)
           and ((pa.cliente_documento is not null and o.dono_documento = pa.cliente_documento)
             or (pa.cliente_telefone  is not null and o.dono_telefone  = pa.cliente_telefone))
       ) as sugestoes
  from public.crm_pedidos_app pa
 where pa.status_conciliacao = 'pendente';

-- ---------------------------------------------------------------------
-- 11. RLS — nada do CRM é visível para quem não é Operador (ADR 0001)
-- ---------------------------------------------------------------------
alter table public.crm_operadores    enable row level security;
alter table public.crm_config        enable row level security;
alter table public.crm_categorias    enable row level security;
alter table public.crm_profissionais enable row level security;
alter table public.crm_obras         enable row level security;
alter table public.crm_contatos      enable row level security;
alter table public.crm_pedidos_app   enable row level security;
alter table public.crm_comissoes     enable row level security;

do $$
declare t text;
begin
  -- leitura para operadores em todas as tabelas
  foreach t in array array['crm_operadores','crm_config','crm_categorias','crm_profissionais',
                           'crm_obras','crm_contatos','crm_pedidos_app','crm_comissoes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.crm_is_operador())', t);
  end loop;

  -- escrita para operadores
  foreach t in array array['crm_profissionais','crm_obras','crm_contatos','crm_comissoes'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.crm_is_operador())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.crm_is_operador()) with check (public.crm_is_operador())', t);
  end loop;

  -- exclusão e cadastros administrativos: só Gerencial
  foreach t in array array['crm_profissionais','crm_obras','crm_contatos','crm_comissoes',
                           'crm_categorias','crm_operadores'] loop
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.crm_is_gerencial())', t);
  end loop;
  foreach t in array array['crm_categorias','crm_operadores'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.crm_is_gerencial())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.crm_is_gerencial())', t);
  end loop;
end $$;

drop policy if exists crm_config_update on public.crm_config;
create policy crm_config_update on public.crm_config for update to authenticated
  using (public.crm_is_gerencial()) with check (public.crm_is_gerencial());

-- crm_pedidos_app: só o backend do app escreve (conexão direta, fora do RLS);
-- operadores só leem e conciliam pelas funções acima.

revoke all on public.crm_operadores, public.crm_config, public.crm_categorias, public.crm_profissionais,
              public.crm_obras, public.crm_contatos, public.crm_pedidos_app, public.crm_comissoes
  from anon;
grant select, insert, update, delete on public.crm_operadores, public.crm_categorias, public.crm_profissionais,
              public.crm_obras, public.crm_contatos, public.crm_comissoes to authenticated;
grant select, update on public.crm_config to authenticated;
grant select on public.crm_pedidos_app to authenticated;
grant select on public.crm_v_profissionais, public.crm_v_agenda, public.crm_v_fila_conciliacao to authenticated;
revoke all on public.crm_v_profissionais, public.crm_v_agenda, public.crm_v_fila_conciliacao from anon;
grant usage, select on sequence public.crm_categorias_id_seq to authenticated;

revoke execute on function public.crm_conciliar(uuid, uuid, text, numeric, numeric) from public, anon;
revoke execute on function public.crm_marcar_sem_profissional(uuid) from public, anon;
grant  execute on function public.crm_conciliar(uuid, uuid, text, numeric, numeric) to authenticated;
grant  execute on function public.crm_marcar_sem_profissional(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Storage: comprovantes de PIX (bucket privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('crm-comprovantes', 'crm-comprovantes', false)
on conflict (id) do nothing;

drop policy if exists crm_comprovantes_select on storage.objects;
create policy crm_comprovantes_select on storage.objects for select to authenticated
  using (bucket_id = 'crm-comprovantes' and public.crm_is_operador());
drop policy if exists crm_comprovantes_insert on storage.objects;
create policy crm_comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-comprovantes' and public.crm_is_gerencial());

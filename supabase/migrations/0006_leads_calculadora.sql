-- =====================================================================
-- CRM — 0006: contatos que chegam pela CALCULADORA DE LAJE do site
-- (carvalholajes.com.br/calculadora). O visitante informa nome, WhatsApp e
-- cidade para ver a lista completa; o contato cai aqui e o gerente designa
-- o vendedor. Rodar depois da 0005 (carteiras). Pode ser rodado de novo.
-- =====================================================================

create table if not exists public.crm_leads_site (
  id               uuid primary key default gen_random_uuid(),
  recebido_em      timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  origem           text not null default 'calculadora',
  nome             text not null,
  telefone         text not null,
  cidade           text,
  previsao         text,
  area_m2          numeric(10,2),
  resumo           text,
  chamou_whatsapp  boolean not null default false,
  simulacoes       int not null default 1,
  status           text not null default 'novo'
                   check (status in ('novo','em_atendimento','orcado','virou_pedido','perdido')),
  responsavel_id   uuid references public.crm_operadores(user_id) on delete set null,
  observacao       text
);
alter table public.crm_leads_site add column if not exists responsavel_id uuid references public.crm_operadores(user_id) on delete set null;
create index if not exists crm_leads_site_tel_idx on public.crm_leads_site (telefone, recebido_em desc);
create index if not exists crm_leads_site_status_idx on public.crm_leads_site (status, recebido_em desc);

alter table public.crm_leads_site enable row level security;
drop policy if exists crm_leads_site_select on public.crm_leads_site;
-- Equipe interna vê todos; vendedor vê só os leads designados a ele
create policy crm_leads_site_select on public.crm_leads_site for select to authenticated
  using (public.crm_is_interno() or (public.crm_is_operador() and responsavel_id = auth.uid()));
drop policy if exists crm_leads_site_update on public.crm_leads_site;
create policy crm_leads_site_update on public.crm_leads_site for update to authenticated
  using (public.crm_is_interno() or (public.crm_is_operador() and responsavel_id = auth.uid()))
  with check (public.crm_is_interno() or (public.crm_is_operador() and responsavel_id = auth.uid()));

-- Só o perfil Gerencial designa ou troca o vendedor responsável
create or replace function public.crm_leads_site_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.responsavel_id is distinct from old.responsavel_id and not public.crm_is_gerencial() then
    raise exception 'Só a gerência designa o vendedor do lead';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists crm_leads_site_guard on public.crm_leads_site;
create trigger crm_leads_site_guard before update on public.crm_leads_site
  for each row when (auth.uid() is not null) execute function public.crm_leads_site_guard();
drop policy if exists crm_leads_site_delete on public.crm_leads_site;
create policy crm_leads_site_delete on public.crm_leads_site for delete to authenticated using (public.crm_is_gerencial());

-- Gravação pela página pública (o visitante nunca lê nada do banco).
-- Mesmo telefone em menos de 3 dias = mesma pessoa refazendo a conta: atualiza o contato.
create or replace function public.crm_lead_calculadora(
  p_nome text, p_telefone text, p_cidade text, p_previsao text,
  p_resumo text, p_chamou_whatsapp boolean default false, p_area numeric default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_id  uuid;
begin
  if v_tel like '55%' and length(v_tel) >= 12 then v_tel := substr(v_tel, 3); end if;
  if coalesce(length(trim(p_nome)), 0) < 2 then raise exception 'Informe o seu nome'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Informe o WhatsApp com DDD'; end if;

  select id into v_id from public.crm_leads_site
   where telefone = v_tel and recebido_em > now() - interval '3 days'
   order by recebido_em desc limit 1;

  if v_id is not null then
    update public.crm_leads_site set
      nome = left(trim(p_nome), 120),
      cidade = coalesce(nullif(left(trim(p_cidade), 80), ''), cidade),
      previsao = coalesce(nullif(left(trim(p_previsao), 60), ''), previsao),
      area_m2 = coalesce(p_area, area_m2),
      resumo = coalesce(nullif(left(p_resumo, 4000), ''), resumo),
      chamou_whatsapp = chamou_whatsapp or coalesce(p_chamou_whatsapp, false),
      simulacoes = simulacoes + case when coalesce(p_chamou_whatsapp, false) then 0 else 1 end,
      atualizado_em = now()
    where id = v_id;
    return true;
  end if;

  -- trava simples contra abuso: 300 contatos novos por dia
  if (select count(*) from public.crm_leads_site where recebido_em > now() - interval '24 hours') >= 300 then
    raise exception 'Limite diário atingido';
  end if;

  insert into public.crm_leads_site (nome, telefone, cidade, previsao, area_m2, resumo, chamou_whatsapp)
  values (left(trim(p_nome), 120), v_tel, nullif(left(trim(p_cidade), 80), ''),
          nullif(left(trim(p_previsao), 60), ''), p_area, nullif(left(p_resumo, 4000), ''),
          coalesce(p_chamou_whatsapp, false));
  return true;
end $$;

revoke execute on function public.crm_lead_calculadora(text, text, text, text, text, boolean, numeric) from public;
grant execute on function public.crm_lead_calculadora(text, text, text, text, text, boolean, numeric) to anon, authenticated;

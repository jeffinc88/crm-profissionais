-- =====================================================================
-- CRM — 0007: "Quem te entregou o cartão?" no link geral de indicação
-- • Cada operador pode aparecer na lista do cartão de visita (no_cartao) e
--   tem um código curto (codigo) para links/QR por vendedor: #/indicar?v=paulo
-- • A indicação guarda o vendedor que entregou o cartão (opcional)
-- Rodar depois da 0006. Pode rodar de novo.
-- =====================================================================

alter table public.crm_operadores
  add column if not exists codigo    text,
  add column if not exists no_cartao boolean not null default false;
create unique index if not exists crm_operadores_codigo_idx on public.crm_operadores (codigo);

-- Valores iniciais: vendedores aparecem no cartão; código = primeiro nome sem acento
update public.crm_operadores
   set codigo = lower(regexp_replace(translate(split_part(trim(nome), ' ', 1),
                 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z0-9]', '', 'g'))
 where codigo is null
   and not exists (select 1 from public.crm_operadores o2
                    where o2.user_id <> crm_operadores.user_id
                      and lower(split_part(trim(o2.nome), ' ', 1)) = lower(split_part(trim(crm_operadores.nome), ' ', 1)));
update public.crm_operadores set no_cartao = true where perfil = 'vendedor' and no_cartao = false
   and not exists (select 1 from public.crm_operadores x where x.no_cartao);  -- só na primeira vez

alter table public.crm_indicacoes
  add column if not exists vendedor_cartao_id uuid references public.crm_operadores(user_id) on delete set null;

-- Lista pública (só primeiro nome e código) para os botões da página de indicação
create or replace function public.crm_vendedores_cartao()
returns table (codigo text, nome text)
language sql stable security definer set search_path = public
as $$
  select codigo, split_part(trim(nome), ' ', 1)
    from public.crm_operadores
   where ativo and no_cartao and codigo is not null
   order by nome
$$;
revoke execute on function public.crm_vendedores_cartao() from public;
grant execute on function public.crm_vendedores_cartao() to anon, authenticated;

-- Envio pelo link geral, agora com o vendedor do cartão (a versão antiga sai)
drop function if exists public.crm_enviar_indicacao_geral(text, text, text, text, text, text);
create or replace function public.crm_enviar_indicacao_geral(
  p_indicador_nome text, p_indicador_telefone text,
  p_dono_nome text, p_dono_telefone text, p_endereco text, p_etapa text,
  p_vendedor text default null   -- código do vendedor que entregou o cartão (opcional)
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_tel  text := regexp_replace(coalesce(p_indicador_telefone, ''), '\D', '', 'g');
  v_prof uuid;
  v_vend uuid;
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

  if nullif(trim(p_vendedor), '') is not null then
    select user_id into v_vend from public.crm_operadores
     where ativo and no_cartao and codigo = lower(trim(p_vendedor)) limit 1;
  end if;

  insert into public.crm_indicacoes
    (profissional_id, indicador_nome, indicador_telefone, origem,
     dono_nome, dono_telefone, endereco, etapa, vendedor_cartao_id)
  values (
    v_prof, left(trim(p_indicador_nome), 120), v_tel, 'link_geral',
    left(trim(p_dono_nome), 120),
    nullif(left(regexp_replace(coalesce(p_dono_telefone, ''), '\D', '', 'g'), 13), ''),
    nullif(left(trim(p_endereco), 200), ''),
    nullif(left(trim(p_etapa), 60), ''),
    v_vend
  );
  return true;
end $$;
revoke execute on function public.crm_enviar_indicacao_geral(text, text, text, text, text, text, text) from public;
grant execute on function public.crm_enviar_indicacao_geral(text, text, text, text, text, text, text) to anon, authenticated;

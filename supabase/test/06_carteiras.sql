\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-0000000000c1','valdir@x'),('00000000-0000-0000-0000-0000000000c2','sandra@x') on conflict do nothing;
insert into crm_operadores values ('00000000-0000-0000-0000-0000000000c1','Valdir (rep)','vendedor'),('00000000-0000-0000-0000-0000000000c2','Sandra (rep)','vendedor') on conflict do nothing;
\echo '--- gerencial dá o Zé para o Valdir'
set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
update crm_profissionais set responsavel_id='00000000-0000-0000-0000-0000000000c1' where nome='José Aparecido';
\echo '--- operacional não pode transferir'
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
update crm_profissionais set responsavel_id='00000000-0000-0000-0000-0000000000c2' where nome='José Aparecido';
\echo '--- Valdir vê só o Zé e as coisas dele'
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select nome from crm_v_profissionais;
select count(*) as obras from crm_obras; select count(*) as agenda from crm_v_agenda; select count(*) as pedidos from crm_pedidos_app; select count(*) as operadores_visiveis from crm_operadores;
select dono_nome from crm_obras;
\echo 'Valdir tenta se dar outro profissional / transferir:'
update crm_profissionais set responsavel_id='00000000-0000-0000-0000-0000000000c2' where nome='José Aparecido';
\echo 'Valdir cadastra pedreiro novo (vira dele):'
insert into crm_profissionais (nome, telefone, categoria_id) values ('Novo do Valdir','16991110000',1) returning nome, responsavel_id = '00000000-0000-0000-0000-0000000000c1' as dele;
\echo '--- Sandra tenta cadastrar o mesmo telefone do Zé (com 55 e máscara):'
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
insert into crm_profissionais (nome, telefone) values ('Zé de novo','5516999990001');
\echo 'Sandra tenta cadastrar quem não tem responsável (Tião):'
insert into crm_profissionais (nome, telefone) values ('Tião', (select '16999990002'));
select count(*) as sandra_ve from crm_v_profissionais;
\echo 'Sandra tenta criar obra para o Zé (não é dela):'
insert into crm_obras (profissional_id, dono_nome) select id, 'X' from crm_profissionais where nome='José Aparecido';
insert into crm_obras (profissional_id, dono_nome) values ('10000000-0000-0000-0000-000000000001','X');
\echo 'Sandra tenta conciliar:'
select crm_conciliar((select id from crm_pedidos_app limit 1), '20000000-0000-0000-0000-000000000001');
\echo '--- Valdir: cria obra e contato para o Zé, lê gratificação mas não altera'
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
insert into crm_obras (profissional_id, dono_nome) values ('10000000-0000-0000-0000-000000000001','Obra do Valdir') returning dono_nome;
insert into crm_contatos (profissional_id, resumo, proxima_data) values ('10000000-0000-0000-0000-000000000001','Liguei', current_date+10) returning resumo;
select count(*) as grat_visiveis from crm_comissoes;
update crm_comissoes set cliente_quitou_em=current_date;
\echo '--- carteiras paradas (gerencial, prazo 1 dia p/ teste)'
reset role; reset request.jwt.claims; update crm_config set dias_carteira_parada=1;
update crm_profissionais set responsavel_id='00000000-0000-0000-0000-0000000000c2' where nome='Carla Menezes';
update crm_profissionais set created_at = now()-interval '5 days' where nome='Carla Menezes';
set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select nome, responsavel_nome, dias_sem_contato from crm_v_carteiras_paradas order by 1;
reset role; reset request.jwt.claims; update crm_config set dias_carteira_parada=90;

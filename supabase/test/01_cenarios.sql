\set ON_ERROR_STOP 0
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','ger@x'),('00000000-0000-0000-0000-00000000000b','op@x'),
 ('00000000-0000-0000-0000-00000000000c','vend@x');
insert into crm_operadores values
 ('00000000-0000-0000-0000-00000000000a','Jefferson','gerencial'),
 ('00000000-0000-0000-0000-00000000000b','Operador','operacional');

-- pedidos chegam do app (backend, sem JWT)
insert into crm_pedidos_app (app_orcamento_id, cliente_nome, cliente_documento, valor_produtos, valor_frete, valor_outras_despesas, originado_crm, profissional_informado, data_fechamento)
values ('ORC-1','Dona Maria','111',10000,500,300,true,'Zé', now() - interval '70 days'),
       ('ORC-2','Seu João','222',8000,400,0,false,null, now()),
       ('ORC-3','Ana','333',5000,0,0,false,null, now());

\echo '--- 1. Não-operador (vendedor) não vê nada'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select count(*) as profs_visiveis from crm_profissionais;
select count(*) as pedidos_visiveis from crm_pedidos_app;
insert into crm_profissionais (nome) values ('Hacker');

\echo '--- 2. Operacional cadastra Profissionais e Obras'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into crm_profissionais (id, nome, telefone, categoria_id, tipo_comissao_padrao, valor_comissao_padrao, created_at)
values ('10000000-0000-0000-0000-000000000001','Zé Pedreiro','16999990001',1,'fixa',300, now() - interval '100 days'),
       ('10000000-0000-0000-0000-000000000002','Tião Mestre','16999990002',2,'percentual',3, now()),
       ('10000000-0000-0000-0000-000000000003','Beto Comprador','16999990003',1,'fixa',200, now());
insert into crm_obras (id, profissional_id, papel, dono_nome, dono_documento, endereco, valor_comissao_combinado)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','indicador','Dona Maria','111','Rua A, 10',250),
       ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','indicador','Seu João','222','Rua B, 20',null),
       ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','comprador','Beto','333','Rua C',null);
select id, status, proximo_acompanhamento = current_date + 30 as acomp_ok from crm_obras order by id;
\echo 'perdida sem motivo deve falhar:'
update crm_obras set status='perdida' where id='20000000-0000-0000-0000-000000000003';

\echo '--- 3. Fila de conciliação com sugestões'
select app_orcamento_id, originado_crm, json_array_length(sugestoes) as n_sug from crm_v_fila_conciliacao order by 1;

\echo '--- 4. Conciliar: fixa embutida (300) ≠ combinado (250) => divergente'
select crm_conciliar((select id from crm_pedidos_app where app_orcamento_id='ORC-1'),'20000000-0000-0000-0000-000000000001') is not null as gerou;
\echo '--- Profissional omitido (ORC-2 sem marcação), percentual 3% sobre produtos'
select crm_conciliar((select id from crm_pedidos_app where app_orcamento_id='ORC-2'),'20000000-0000-0000-0000-000000000002') is not null as gerou;
\echo '--- Comprador não gera comissão'
select crm_conciliar((select id from crm_pedidos_app where app_orcamento_id='ORC-3'),'20000000-0000-0000-0000-000000000003') is null as nao_gerou;
select p.nome, k.tipo, k.valor, k.valor_combinado, k.divergente, k.profissional_omitido, k.status
  from crm_comissoes k join crm_profissionais p on p.id=k.profissional_id order by p.nome;
\echo 'conciliar de novo deve falhar:'
select crm_conciliar((select id from crm_pedidos_app where app_orcamento_id='ORC-1'),'20000000-0000-0000-0000-000000000001');

\echo '--- 5. Operacional tenta pagar / mudar valor (deve falhar), mas marca quitação'
update crm_comissoes set valor=999 where profissional_id='10000000-0000-0000-0000-000000000001';
update crm_comissoes set status='paga' where profissional_id='10000000-0000-0000-0000-000000000001';
update crm_comissoes set cliente_quitou_em=current_date where profissional_id='10000000-0000-0000-0000-000000000001';
select status from crm_comissoes where profissional_id='10000000-0000-0000-0000-000000000001';
update crm_config set prazo_recompra_dias=30;

\echo '--- 6. Gerencial: pagar sem quitação falha; com quitação funciona'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update crm_comissoes set status='paga' where profissional_id='10000000-0000-0000-0000-000000000002';
update crm_comissoes set status='paga', comprovante_path='x.pdf' where profissional_id='10000000-0000-0000-0000-000000000001';
select p.nome, k.status, k.pago_em is not null as tem_data from crm_comissoes k join crm_profissionais p on p.id=k.profissional_id order by 1;

\echo '--- 7. Agenda: Zé (venda há 70 dias > 60) aparece em recompra'
select tipo, profissional_nome, descricao from crm_v_agenda order by prioridade, profissional_nome;
\echo '--- registrar contato com próxima data futura tira o Zé da agenda'
insert into crm_contatos (profissional_id, motivo, resumo, proxima_data)
values ('10000000-0000-0000-0000-000000000001','recompra','Falei com ele, obra nova em dezembro', current_date + 15);
select count(*) filter (where profissional_nome='Zé Pedreiro') as ze_na_agenda from crm_v_agenda;
\echo '--- entrega + pós-entrega'
update crm_obras set status='entregue', data_entrega=current_date-5 where id='20000000-0000-0000-0000-000000000002';
select tipo, descricao from crm_v_agenda where tipo='pos_entrega';
insert into crm_contatos (profissional_id, obra_id, motivo, resumo, proxima_data)
values ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','pos_entrega','Dono confirmou o Tião', current_date+30);
select count(*) as pos_entrega_restantes from crm_v_agenda where tipo='pos_entrega';
\echo '--- 8. Resumo por profissional'
select nome, categoria, vendas_total, dias_sem_venda, comissao_a_pagar, comissao_aguardando, comissao_paga from crm_v_profissionais order by nome;
\echo '--- 9. Config pelo gerencial'
update crm_config set prazo_recompra_dias=45 returning prazo_recompra_dias;

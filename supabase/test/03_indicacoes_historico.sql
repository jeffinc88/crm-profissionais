\set ON_ERROR_STOP 0
select token_indicacao as tk from crm_profissionais where nome='José Aparecido' \gset
\echo '--- anon: info do link e envio'
set role anon;
select crm_indicacao_info(:'tk') as primeiro_nome;
select crm_enviar_indicacao(:'tk','Marta Dias','(16) 98765-4321','Rua Ouro Preto, 77','Franca','Fundação','dezembro','Casa térrea 120m²');
\echo 'anon não lê tabelas:'
select count(*) from crm_indicacoes;
\echo 'token inválido:'
select crm_enviar_indicacao('00000000-0000-0000-0000-000000000000','X','','','','','','');
\echo 'sem endereço nem telefone:'
select crm_enviar_indicacao(:'tk','Fulano','','','','','','');
reset role;
\echo '--- operador aprova'
set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select dono_nome, dono_telefone, status from crm_indicacoes;
select crm_aprovar_indicacao((select id from crm_indicacoes where dono_nome='Marta Dias')) is not null as criou_obra;
select dono_nome, papel, status, origem_cadastro, indicado_em is not null as tem_data, observacoes from crm_obras where dono_nome='Marta Dias';
\echo 'aprovar de novo falha:'
select crm_aprovar_indicacao((select id from crm_indicacoes where dono_nome='Marta Dias'));
\echo '--- histórico'
update crm_obras set status='orcada', previsao_laje=current_date+40 where dono_nome='Marta Dias';
update crm_obras set observacoes='só observação' where dono_nome='Marta Dias';
select acao, usuario_nome, mudancas from crm_historico where obra_id=(select id from crm_obras where dono_nome='Marta Dias') order by id;

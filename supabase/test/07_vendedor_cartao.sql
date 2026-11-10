\set ON_ERROR_STOP 0
select nome, perfil, codigo, no_cartao from crm_operadores order by nome;
set role anon;
select * from crm_vendedores_cartao();
select crm_enviar_indicacao_geral('Josué Pereira','(16) 99222-3344','Dona Cida','(16) 98111-0000','','Começando','valdir');
select crm_enviar_indicacao_geral('Zé','(16) 99999-0001','Helena','(16) 98111-2222','','', null);
select crm_enviar_indicacao_geral('Zé','(16) 99999-0001','Helena 2','(16) 98111-3333','','', 'naoexiste');
select crm_enviar_indicacao_geral('Zé','(16) 99999-0001','Helena 3','(16) 98111-4444','','');
reset role;
select dono_nome, indicador_nome, o.nome as cartao from crm_indicacoes i left join crm_operadores o on o.user_id=i.vendedor_cartao_id where origem='link_geral' order by recebida_em desc limit 4;

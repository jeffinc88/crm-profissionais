-- Dados de exemplo para o painel (testes locais). NÃO rodar em produção.
-- mais dados para o painel (exemplo)
insert into crm_profissionais (id,nome,apelido,telefone,cidade,categoria_id,tipo_comissao_padrao,valor_comissao_padrao,created_at) values
 ('10000000-0000-0000-0000-000000000005','Adriano Couto',null,'16999990005','Restinga',3,'fixa',350, now()-interval '200 days'),
 ('10000000-0000-0000-0000-000000000006','Eng. Paula Rocha',null,'16999990006','Franca',4,'percentual',2, now()-interval '180 days'),
 ('10000000-0000-0000-0000-000000000007','Valdemar Neves','Mazinho','35999990007','Claraval',1,'fixa',280, now()-interval '150 days');
insert into crm_obras (profissional_id,papel,dono_nome,cidade,status,data_fechamento,valor_produtos,endereco)
select p, 'indicador', d, c, 'entregue', current_date - (m*30 + (random()*20)::int), v, 'Rua '||(random()*300)::int
from (values
 ('10000000-0000-0000-0000-000000000001'::uuid,'Cláudia Prado','Franca',1,11800),('10000000-0000-0000-0000-000000000001','Rui Castro','Franca',2,9400),
 ('10000000-0000-0000-0000-000000000001','Neide Lopes','Franca',4,15600),('10000000-0000-0000-0000-000000000005','Hélio Mota','Restinga',1,8700),
 ('10000000-0000-0000-0000-000000000005','Sônia Reis','Restinga',3,7300),('10000000-0000-0000-0000-000000000006','Condomínio Alpes','Franca',2,32400),
 ('10000000-0000-0000-0000-000000000007','Dirceu Lima','Claraval',3,6900),('10000000-0000-0000-0000-000000000002','Ivo Matos','Patrocínio Paulista',5,10100),
 ('10000000-0000-0000-0000-000000000003','Bruna Leal','Franca',1,12900),('10000000-0000-0000-0000-000000000006','Marcelo Pinto','Franca',4,14100),
 ('10000000-0000-0000-0000-000000000005','Otávio Dias','Restinga',0,9900)
) as t(p,d,c,m,v);
insert into crm_obras (profissional_id,papel,dono_nome,cidade,status,motivo_perda) values
 ('10000000-0000-0000-0000-000000000007','indicador','Lucas Brito','Claraval','perdida','Preço'),
 ('10000000-0000-0000-0000-000000000001','indicador','Rita Moura','Franca','perdida','Concorrente'),
 ('10000000-0000-0000-0000-000000000005','indicador','Pedro Sá','Restinga','perdida','Preço');
insert into crm_obras (profissional_id,papel,dono_nome,cidade,status,previsao_laje,endereco) values
 ('10000000-0000-0000-0000-000000000006','indicador','Igreja N. Sra. Aparecida','Franca','orcada',current_date+15,'Av. Brasil, 900'),
 ('10000000-0000-0000-0000-000000000007','indicador','Gilmar Teles','Claraval','em_andamento',current_date+45,'Rua 3, 45');
insert into crm_pedidos_app (app_orcamento_id,cliente_nome,valor_produtos,data_fechamento,status_conciliacao)
select 'H'||g, 'Cliente balcão '||g, 5000+g*100, now()-((g*9)||' days')::interval, 'sem_profissional' from generate_series(1,14) g;

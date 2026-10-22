-- Dados de exemplo usados nos testes locais. NÃO rodar em produção.
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','jefferson@carvalho'),('00000000-0000-0000-0000-00000000000b','operador@carvalho');
insert into crm_operadores values ('00000000-0000-0000-0000-00000000000a','Jefferson','gerencial'),('00000000-0000-0000-0000-00000000000b','Marcos','operacional');
insert into crm_profissionais (id,nome,apelido,telefone,cidade,categoria_id,tipo_comissao_padrao,valor_comissao_padrao,chave_pix,created_at) values
 ('10000000-0000-0000-0000-000000000001','José Aparecido','Zé','16999990001','Franca',1,'fixa',300,'16999990001', now()-interval '120 days'),
 ('10000000-0000-0000-0000-000000000002','Sebastião Lima','Tião','16999990002','Patrocínio Paulista',2,'percentual',3,null, now()-interval '20 days'),
 ('10000000-0000-0000-0000-000000000003','Carla Menezes',null,'16999990003','Franca',5,'percentual',2.5,'carla@pix', now()),
 ('10000000-0000-0000-0000-000000000004','Roberto Silva','Beto','34999990004','Ibiraci',1,'fixa',250,null, now()-interval '90 days');
insert into crm_obras (profissional_id,papel,dono_nome,dono_telefone,dono_documento,endereco,cidade,status,data_fechamento,valor_produtos,previsao_laje) values
 ('10000000-0000-0000-0000-000000000001','indicador','Maria Souza','16988880001','11111111111','Rua Voluntários da Franca, 1200','Franca','fechada',current_date-75,14200,null),
 ('10000000-0000-0000-0000-000000000001','indicador','Paulo Reis','16988880002','22222222222','Av. Champagnat, 450','Franca','em_andamento',null,null,current_date+20),
 ('10000000-0000-0000-0000-000000000003','indicador','Fernanda Alves','16988880003','33333333333','Rua das Palmeiras, 88','Franca','orcada',null,null,current_date+40);
insert into crm_obras (profissional_id,papel,dono_nome,dono_telefone,endereco,cidade,status,data_fechamento,data_entrega,valor_produtos) values
 ('10000000-0000-0000-0000-000000000002','indicador','Antônio Ferreira','16988880004','Sítio Boa Vista','Patrocínio Paulista','entregue',current_date-12,current_date-5,9800),
 (null,'profissional_da_obra','Lúcia Martins','16988880005','Rua Major Claudiano, 300','Franca','entregue',current_date-10,current_date-4,7600);
insert into crm_obras (profissional_id,papel,dono_nome,endereco,cidade,status,motivo_perda) values
 ('10000000-0000-0000-0000-000000000004','indicador','Joaquim Prado','Rua 7, 12','Ibiraci','perdida','Preço');
update crm_obras set proximo_acompanhamento = current_date where dono_nome='Paulo Reis';
insert into crm_pedidos_app (app_orcamento_id,cliente_nome,cliente_documento,cliente_telefone,cidade,vendedor_nome,valor_produtos,valor_frete,valor_outras_despesas,originado_crm,profissional_informado,data_fechamento) values
 ('1043','Paulo Reis','22222222222','16988880002','Franca','Rep. Valdir',18500,650,350,true,'Zé',now()-interval '1 day'),
 ('1047','Fernanda Alves','33333333333','16988880003','Franca','Rep. Valdir',12100,400,0,false,null,now()),
 ('1050','Cláudio Nunes',null,'16977770009','Cristais Paulista','Rep. Sandra',6300,500,0,false,null,now());
insert into crm_comissoes (obra_id,profissional_id,tipo,valor,valor_combinado,base_calculo,status)
 select id,'10000000-0000-0000-0000-000000000001','fixa',300,300,14200,'aguardando_recebimento' from crm_obras where dono_nome='Maria Souza';
insert into crm_comissoes (obra_id,profissional_id,tipo,percentual,base_calculo,valor,cliente_quitou_em)
 select id,'10000000-0000-0000-0000-000000000002','percentual',3,9800,294,current_date-2 from crm_obras where dono_nome='Antônio Ferreira';
insert into crm_contatos (profissional_id,canal,motivo,resumo,proxima_data,data) values
 ('10000000-0000-0000-0000-000000000001','visita','avulso','Visitei a obra da Maria, laje concretada. Tem mais 2 obras no Jd. Aeroporto.',null,now()-interval '30 days');

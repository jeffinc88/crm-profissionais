# CRM de Pedreiros — Carvalho Pré-Moldados

Ferramenta interna da fábrica para construir um relacionamento próximo com os profissionais de obra da região e transformar esse relacionamento em vendas de laje. (Chamado informalmente de "CRM de pedreiros".)

## Pessoas

**Profissional**:
Pessoa que trabalha em obras e se relaciona com a fábrica em um ou mais papéis: Indicador (principal), Comprador e Recomendado.
_Avoid_: Pedreiro (como termo geral), parceiro, cliente

**Categoria**:
O tipo de Profissional: Pedreiro, Mestre de Obras, Engenheiro, Arquiteto, entre outros.
_Avoid_: Divisão, tipo, função

**Indicador**:
O papel do Profissional quando ele traz para a fábrica a obra de um Dono da Obra, sem ser ele quem compra.
_Avoid_: Influenciador, promotor

**Comprador**:
O papel do Profissional quando ele mesmo compra da fábrica.
_Avoid_: Cliente pedreiro

**Recomendado**:
O papel do Profissional quando a fábrica o recomenda a um cliente que procura mão de obra.
_Avoid_: Profissional indicado, banco de pedreiros

**Dono da Obra**:
A pessoa que paga pela obra e compra a laje. Nunca toma conhecimento da Comissão do Profissional.
_Avoid_: Cliente final, proprietário

**Operador**:
Pessoa da fábrica que usa o CRM, com perfil Gerencial ou Operacional.
_Avoid_: Usuário, vendedor

**Gerencial**:
Perfil de Operador que vê tudo e é o único a registrar pagamentos de Comissão e alterar as regras do CRM.

**Operacional**:
Perfil de Operador que cadastra Profissionais e Obras, trabalha a Agenda e a Conciliação, e vê o Extrato de Comissões só para leitura.

## Obras e vendas

**Obra**:
Uma construção concreta, com endereço e Dono da Obra, ligada a um ou mais Profissionais no CRM.
_Avoid_: Projeto, serviço

**Profissional da Obra**:
O Profissional ligado a uma Obra que ele não indicou (o Dono da Obra chegou por conta própria). Por padrão, não recebe Comissão.
_Avoid_: Pedreiro responsável

**Status da Obra**:
Em que pé está a Obra no funil: por exemplo, em andamento, orçada, fechada, perdida (com motivo) ou entregue.

**Orçamento Originado do CRM**:
Orçamento do app comercial marcado como envolvendo um Indicador. Quando feito pelo vendedor, é apenas um aviso: a Origem só é confirmada pelo Operador na Conciliação.
_Avoid_: Orçamento de pedreiro, orçamento indicado

**Profissional Omitido**:
Profissional que participou da venda, mas não foi informado no orçamento. É descoberto na Conciliação ou na ligação pós-entrega ao Dono da Obra.

**Origem**:
Quem trouxe a venda. É definida pelo primeiro orçamento registrado no app para aquela Obra.
_Avoid_: Dono da venda, autoria

**Venda Originada por Profissional**:
Venda de laje cuja Origem é um Profissional, como Indicador ou Comprador. É a métrica principal de sucesso do CRM. Quando o Profissional é o Comprador, a venda conta, mas não gera Comissão.
_Avoid_: Venda do pedreiro, venda indicada

**Conciliação**:
O cruzamento de uma Obra do CRM com o orçamento ou pedido correspondente do app comercial, feito a partir da Fila de Conciliação. Inclui a checagem de que a Comissão Fixa combinada pelo vendedor bate com o valor registrado.
_Avoid_: Sincronização, vínculo

**Fila de Conciliação**:
A lista de pedidos fechados no app que ainda precisam ser ligados a uma Obra: os marcados como Originados do CRM e os sem nenhum Profissional ligado.

## Comissão

**Comissão do Profissional**:
O valor que a fábrica paga ao Indicador por uma venda, liberado só depois que o Dono da Obra quita tudo. Pode ser Fixa ou Percentual.
_Avoid_: Bonificação, RT, gratificação

**Comissão Fixa**:
Comissão de valor fechado por Obra, combinado pelo vendedor diretamente com o Profissional antes do orçamento, lançado em "Outras Despesas" e diluído no preço que o Dono da Obra vê.
_Avoid_: Comissão embutida

**Comissão Percentual**:
Comissão calculada como % do valor dos produtos (sem frete) e paga a partir da margem da fábrica, sem alterar o preço do orçamento.

**Tipo de Comissão Padrão**:
O tipo (Fixa ou Percentual) e o valor sugeridos no cadastro do Profissional, que o Operador pode trocar em cada orçamento.
_Avoid_: Porcentagem do pedreiro

**Extrato de Comissões**:
O histórico, por Profissional, das comissões a pagar e já pagas.
_Avoid_: Conta corrente, saldo

## Relacionamento

**Agenda**:
A lista diária de contatos que os Operadores devem fazer com os Profissionais. Cada item abre a conversa no WhatsApp da fábrica e, depois, recebe o registro do contato e a próxima data.
_Avoid_: Tarefas, follow-up

**Alerta de Recompra**:
Aviso na Agenda quando um Profissional passa de um prazo (padrão de 60 dias, ajustável por Profissional) sem Venda Originada por ele.
_Avoid_: Lembrete, inatividade

**Alerta Pós-Entrega**:
Aviso na Agenda poucos dias depois da entrega da laje de uma Obra. Serve também para confirmar com o Dono da Obra quem é o Profissional dela.

**Alerta de Obra sem Laje**:
Aviso na Agenda para acompanhar uma Obra cadastrada que ainda não chegou à etapa da laje.

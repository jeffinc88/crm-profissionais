# Integração com o app comercial (lajes-backend + grill-me)

São **três mudanças pequenas** no app. O resto fica no CRM (ADR 0004).

## 1. Orçamento: marcação "Originado do CRM"

**Banco (tabela de orçamentos do app):**

```sql
alter table public.<sua_tabela_de_orcamentos>
  add column if not exists originado_crm boolean not null default false,
  add column if not exists profissional_informado text;
```

**Tela de orçamento (grill-me), para todos os perfis, incluindo vendedor:**

- Uma caixa de seleção: **"Tem profissional envolvido (Originado do CRM)"**.
- Quando ela estiver marcada, aparecem dois campos:
  - **"Nome do profissional (como o cliente falou)"**: texto livre. O vendedor **não** escolhe numa lista, porque não tem acesso à base (ADR 0001).
  - **"Outras Despesas"**: o campo que já existe. É nele que o vendedor lança a **Gratificação Fixa** que combinou com o profissional (Q32). Se a gratificação for Percentual, o campo fica em zero.

## 2. PDF do cliente: diluir "Outras Despesas" nos itens

O Dono da Obra **nunca** pode ver a gratificação (ADR 0005). Por isso, no PDF do cliente:

- **não** aparece a linha "Outras despesas";
- o valor é diluído nos preços dos itens com `diluirOutrasDespesas(itens, outrasDespesas)` (arquivo nesta pasta);
- o total do PDF é o `total` que a função devolve.

O PDF da **ordem de produção** (interno) não muda e continua mostrando "Outras Despesas" separado.

Cada linha do PDF fecha certinho (unitário × quantidade = total). Como o preço unitário tem 2 casas, o total pode ficar alguns centavos acima ou abaixo do alvo (nos testes, no máximo R$ 0,17). Essa diferença vem em `diferenca` e fica na margem da fábrica. A gratificação continua sendo o valor de "Outras Despesas".

Se o pedido for enviado ao **Bling** com os itens, mande os itens já diluídos. Assim, a nota fiscal também não revela a gratificação.

## 3. Pedido fechado → Fila de Conciliação do CRM

No backend, no ponto em que o orçamento vira pedido (onde hoje o `bling_pedido_id` é gravado), chame:

```js
const { registrarPedidoNoCRM } = require('./crm/registrarPedidoNoCRM')
await registrarPedidoNoCRM(pool, orcamento)
```

Mande **todos** os pedidos fechados, marcados ou não. Os pedidos sem marcação são os que revelam um profissional omitido (ADR 0009).

Uma falha ao gravar no CRM **não deve impedir** o fechamento do pedido. Envolva a chamada em `try/catch` e registre o erro no log.

## O que o CRM faz com isso

1. O pedido aparece na **Conciliação**, com sugestão de obra pelo CPF/telefone do cliente.
2. O operador liga o pedido à obra (ou cria a obra na hora). A gratificação é calculada assim:
   - **Fixa**: o valor de "Outras Despesas". Se ele não bater com o valor combinado na obra, a gratificação fica marcada como **divergente**;
   - **Percentual**: % sobre `valor_produtos` (sem frete).
3. Se o pedido não estava marcado e o profissional era Indicador, a gratificação fica marcada como **profissional omitido**. Nesse caso, o representante não recebe por aquela venda. O que o representante recebe é calculado fora do CRM, então esse aviso é para quem fecha os valores dele.

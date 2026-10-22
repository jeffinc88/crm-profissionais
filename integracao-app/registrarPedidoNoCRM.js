/**
 * Backend do app comercial (lajes-backend): envia um pedido fechado para a
 * Fila de Conciliação do CRM. Chamar no ponto em que o orçamento vira pedido
 * (o mesmo lugar em que hoje o bling_pedido_id é gravado).
 *
 * Usa a mesma conexão `pg` que o backend já tem com o Supabase. Essa conexão
 * não passa pelo RLS, então o vendedor nunca precisa (nem consegue) ler a base
 * de profissionais: ele só marca "Originado do CRM" e digita o nome que o
 * cliente falou. A identificação de verdade é feita na Conciliação (ADR 0004).
 *
 * Idempotente: se o mesmo orçamento for enviado de novo, atualiza os valores
 * enquanto ainda estiver pendente de conciliação.
 *
 * Ajuste os nomes dos campos de `orcamento` para os do seu schema.
 */
async function registrarPedidoNoCRM(pool, orcamento) {
  const sql = `
    insert into public.crm_pedidos_app (
      app_orcamento_id, bling_pedido_id, data_orcamento, data_fechamento,
      cliente_nome, cliente_documento, cliente_telefone, cidade, vendedor_nome,
      valor_produtos, valor_frete, valor_outras_despesas,
      originado_crm, profissional_informado
    ) values ($1,$2,$3,now(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (app_orcamento_id) do update set
      bling_pedido_id        = excluded.bling_pedido_id,
      valor_produtos         = excluded.valor_produtos,
      valor_frete            = excluded.valor_frete,
      valor_outras_despesas  = excluded.valor_outras_despesas,
      originado_crm          = excluded.originado_crm,
      profissional_informado = excluded.profissional_informado
    where crm_pedidos_app.status_conciliacao = 'pendente'`

  const soDigitos = (s) => (s ? String(s).replace(/\D/g, '') || null : null)

  await pool.query(sql, [
    String(orcamento.id),
    orcamento.bling_pedido_id ? String(orcamento.bling_pedido_id) : null,
    orcamento.created_at,                         // data do orçamento → define a Origem (ADR 0006)
    orcamento.cliente_nome,
    soDigitos(orcamento.cliente_cpf),             // CPF/CNPJ só dígitos — ajuda a sugerir a obra
    soDigitos(orcamento.cliente_telefone),
    orcamento.cidade || null,
    orcamento.vendedor_nome || null,
    Number(orcamento.valor_produtos || 0),        // soma dos itens SEM frete e SEM outras despesas
    Number(orcamento.valor_frete || 0),
    Number(orcamento.outras_despesas || 0),       // Comissão Fixa combinada pelo vendedor
    Boolean(orcamento.originado_crm),
    orcamento.profissional_informado || null,
  ])
}

module.exports = { registrarPedidoNoCRM }

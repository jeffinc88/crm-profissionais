/**
 * Dilui o valor de "Outras Despesas" (Comissão Fixa) nos itens do orçamento,
 * para o PDF do cliente — ADR 0005: o Dono da Obra nunca vê a comissão.
 *
 * O valor é distribuído proporcionalmente ao total de cada item, e cada item
 * fica coerente: precoUnitario × quantidade = total (centavo a centavo), para
 * nenhuma conta "não fechar" aos olhos do cliente.
 *
 * Como o preço unitário tem só 2 casas, a soma final pode ficar alguns
 * centavos acima ou abaixo do alvo. Essa diferença é devolvida em
 * `diferenca` (positiva = cliente paga a mais) e fica na margem da fábrica;
 * a comissão registrada continua sendo o valor de "Outras Despesas".
 *
 * Usar só na geração do PDF do cliente (e no envio ao Bling, se o pedido for
 * para lá com os itens). A ordem de produção e o banco continuam com os
 * valores originais + "Outras Despesas" separado.
 *
 * @param {Array<{quantidade:number, precoUnitario:number}>} itens
 * @param {number} outrasDespesas  valor em R$
 * @returns {{ itens: Array, total: number, diferenca: number }}
 */
function diluirOutrasDespesas(itens, outrasDespesas) {
  const cent = (v) => Math.round(v * 100)
  const totaisOrig = itens.map((i) => cent(i.quantidade * i.precoUnitario))
  const somaOrig = totaisOrig.reduce((a, b) => a + b, 0)
  const extra = cent(outrasDespesas || 0)

  if (!extra || !itens.length) {
    return { itens: itens.map((i, k) => ({ ...i, total: totaisOrig[k] / 100 })), total: somaOrig / 100, diferenca: 0 }
  }
  if (somaOrig <= 0) throw new Error('Orçamento sem valor para diluir as outras despesas')

  const alvo = somaOrig + extra
  const novos = itens.map((item, k) => {
    const alvoItem = totaisOrig[k] + (extra * totaisOrig[k]) / somaOrig
    const unitCent = Math.round(alvoItem / item.quantidade)
    return { ...item, unitCent }
  })

  // Ajuste fino: sobe/desce 1 centavo no unitário dos itens de menor quantidade
  // enquanto isso aproximar a soma do alvo.
  const soma = () => novos.reduce((a, i) => a + i.unitCent * i.quantidade, 0)
  const porQtd = [...novos.keys()].sort((a, b) => novos[a].quantidade - novos[b].quantidade)
  for (let tent = 0; tent < 50; tent++) {
    const dif = soma() - alvo
    if (dif === 0) break
    let melhorou = false
    for (const k of porQtd) {
      const passo = dif > 0 ? -1 : 1
      if (Math.abs(dif + passo * novos[k].quantidade) < Math.abs(dif)) {
        novos[k].unitCent += passo
        melhorou = true
        break
      }
    }
    if (!melhorou) break
  }

  const final = novos.map(({ unitCent, ...item }) => ({
    ...item,
    precoUnitario: unitCent / 100,
    total: (unitCent * item.quantidade) / 100,
  }))
  const total = soma()
  return { itens: final, total: total / 100, diferenca: (total - alvo) / 100 }
}

module.exports = { diluirOutrasDespesas }

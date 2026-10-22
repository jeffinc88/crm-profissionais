const assert = require('node:assert')
const { diluirOutrasDespesas } = require('./diluirOutrasDespesas')
const casos = [
  [{ quantidade: 48, precoUnitario: 62.5 }, { quantidade: 320, precoUnitario: 9.9 }, { quantidade: 12, precoUnitario: 41.37 }],
  [{ quantidade: 1, precoUnitario: 4800 }],
  [{ quantidade: 37, precoUnitario: 58.4 }, { quantidade: 412, precoUnitario: 8.75 }],
  [{ quantidade: 3, precoUnitario: 10 }, { quantidade: 7, precoUnitario: 3.33 }, { quantidade: 1, precoUnitario: 120 }],
]
let pior = 0
for (const itens of casos) {
  const orig = diluirOutrasDespesas(itens, 0).total
  for (const extra of [350, 300, 0.01, 1234.56, 999.99, 250]) {
    const r = diluirOutrasDespesas(itens, extra)
    // cada linha fecha: unitário × quantidade = total
    for (const i of r.itens) assert.strictEqual(Math.round(i.precoUnitario * i.quantidade * 100), Math.round(i.total * 100))
    // soma dos itens = total informado
    assert.strictEqual(Math.round(r.itens.reduce((a, i) => a + i.total, 0) * 100), Math.round(r.total * 100))
    // diferença coerente com o alvo
    assert.strictEqual(Math.round((r.total - r.diferenca) * 100), Math.round((orig + extra) * 100))
    pior = Math.max(pior, Math.abs(r.diferenca))
  }
}
const ex = diluirOutrasDespesas(casos[0], 350)
console.log(JSON.stringify(ex, null, 1))
console.log('ok — maior diferença em todos os casos: R$', pior.toFixed(2))

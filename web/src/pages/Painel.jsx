import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando } from '../components/ui'
import { brl, STATUS_OBRA } from '../util'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const PERIODOS = [3, 6, 12]

const compacto = (v) => {
  const n = Number(v || 0)
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (n >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return brl(n)
}

// Venda originada = obra fechada/entregue em que o profissional foi Indicador ou Comprador
const ehVenda = (o) => ['fechada', 'entregue'].includes(o.status) && ['indicador', 'comprador'].includes(o.papel) && o.profissional_id

export default function Painel() {
  const [meses, setMeses] = useState(6)
  const { data, erro, carregando } = useCarregar(async () => {
    const [obras, profs, pedidos] = await Promise.all([
      q(supabase.from('crm_obras').select('id, profissional_id, papel, status, motivo_perda, cidade, data_fechamento, valor_produtos, updated_at, origem_cadastro, created_at')),
      q(supabase.from('crm_v_profissionais').select('id, nome, apelido, categoria, cidade, ativo')),
      q(supabase.from('crm_pedidos_app').select('id, data_fechamento, valor_produtos, status_conciliacao, obra_id')),
    ])
    return { obras, profs, pedidos }
  })

  const r = useMemo(() => (data ? calcular(data, meses) : null), [data, meses])
  if (!r) return <Carregando carregando={carregando} erro={erro} />

  return (
    <>
      <div className="head">
        <div>
          <h1>Painel</h1>
          <p className="sub">O CRM está trazendo venda? Tudo aqui considera vendas originadas por profissionais (Indicador ou Comprador).</p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODOS.map((m) => (
            <button key={m} className={meses === m ? 'on' : ''} onClick={() => setMeses(m)}>{m} meses</button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{r.vendas}</b><span>Vendas originadas em {meses} meses</span></div>
        <div className="kpi"><b>{compacto(r.valor)}</b><span>Em produtos vendidos</span></div>
        <div className="kpi">
          <b>{r.participacao == null ? '—' : `${r.participacao}%`}</b>
          <span>{r.participacao == null ? 'Das vendas da fábrica (aguarda o app enviar os pedidos)' : `Das ${r.pedidosTotal} vendas da fábrica vieram de profissionais`}</span>
        </div>
        <div className="kpi"><b>{r.conversao == null ? '—' : `${r.conversao}%`}</b><span>Conversão: obras fechadas ÷ (fechadas + perdidas)</span></div>
      </div>

      <div className="card chart-card" style={{ marginBottom: 16 }}>
        <h2>Vendas originadas por mês</h2>
        <p className="sub">Quantidade de obras fechadas por indicação ou compra de profissional. Passe o mouse para ver o valor.</p>
        <Colunas dados={r.porMes} />
        <details className="tabela">
          <summary>Ver em tabela</summary>
          <table className="small"><thead><tr><th>Mês</th><th>Vendas</th><th>Valor em produtos</th></tr></thead>
            <tbody>{r.porMes.map((m) => <tr key={m.chave}><td>{m.rotulo}</td><td className="num">{m.qtd}</td><td className="num">{brl(m.valor)}</td></tr>)}</tbody>
          </table>
        </details>
      </div>

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card chart-card">
          <h2>Quem mais traz venda</h2>
          <p className="sub">Top 10 profissionais no período, por número de vendas.</p>
          {r.ranking.length === 0 ? <div className="empty">Nenhuma venda originada no período.</div> : (
            <BarrasH itens={r.ranking.map((p) => ({
              chave: p.id,
              rotulo: <Link to={`/profissionais/${p.id}`}>{p.nome}</Link>,
              valor: p.qtd,
              texto: `${p.qtd} · ${compacto(p.valor)}`,
              dica: `${p.qtd} venda(s) · ${brl(p.valor)} em produtos`,
            }))} />
          )}
        </div>
        <div className="card chart-card">
          <h2>Funil das obras</h2>
          <p className="sub">Situação atual de todas as obras do CRM.</p>
          <BarrasH itens={r.funil.map((f) => ({ chave: f.status, rotulo: STATUS_OBRA[f.status], valor: f.qtd, texto: String(f.qtd), dica: `${f.qtd} obra(s) ${STATUS_OBRA[f.status].toLowerCase()}` }))} />
          <p className="muted small" style={{ marginBottom: 0 }}>
            {r.indicadasLink + r.indicadasWhats > 0 && <>{r.indicadasLink} obra(s) indicadas pelo link e {r.indicadasWhats} por WhatsApp. </>}
            Obras abertas: {r.abertas}.
          </p>
        </div>
      </div>

      <div className="grid3">
        <div className="card chart-card">
          <h2>Por categoria</h2>
          <p className="sub">Vendas no período.</p>
          {r.porCategoria.length ? <BarrasH itens={r.porCategoria.map(itemSimples)} /> : <div className="empty">Sem dados.</div>}
        </div>
        <div className="card chart-card">
          <h2>Por cidade</h2>
          <p className="sub">Vendas no período.</p>
          {r.porCidade.length ? <BarrasH itens={r.porCidade.map(itemSimples)} /> : <div className="empty">Sem dados.</div>}
        </div>
        <div className="card chart-card">
          <h2>Por que perdemos</h2>
          <p className="sub">Motivos das obras perdidas no período.</p>
          {r.perdas.length ? <BarrasH itens={r.perdas.map(itemSimples)} /> : <div className="empty">Nenhuma obra perdida.</div>}
        </div>
      </div>
    </>
  )
}

const itemSimples = (x) => ({ chave: x.nome, rotulo: x.nome, valor: x.qtd, texto: String(x.qtd), dica: `${x.nome}: ${x.qtd}` })

function Colunas({ dados }) {
  const max = Math.max(1, ...dados.map((d) => d.qtd))
  const maiorIdx = dados.reduce((m, d, i) => (d.qtd > dados[m].qtd ? i : m), 0)
  const ultimo = dados.length - 1
  return (
    <>
      <div className="cols" role="img" aria-label="Vendas originadas por mês">
        {dados.map((d, i) => (
          <div className="col" key={d.chave}>
            <span className="tip">{d.rotulo}: {d.qtd} venda(s) · {brl(d.valor)}</span>
            {/* rótulo seletivo: só o maior mês e o mês atual */}
            {(i === maiorIdx || i === ultimo) && d.qtd > 0 && <span className="cap">{d.qtd}</span>}
            <div className="bar" style={{ height: `${(d.qtd / max) * 85}%` }} />
          </div>
        ))}
      </div>
      <div className="col-labels">{dados.map((d) => <span key={d.chave}>{d.rotuloCurto}</span>)}</div>
    </>
  )
}

function BarrasH({ itens }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <div className="hbars">
      {itens.map((i) => (
        <div className="hbar" key={i.chave}>
          <span className="lbl">{i.rotulo}</span>
          <span className="track">
            <span className="fill" style={{ width: `${Math.max(1, (i.valor / max) * 80)}%` }} />
            <span className="val">{i.texto}</span>
          </span>
          <span className="tip">{i.dica}</span>
        </div>
      ))}
    </div>
  )
}

function calcular({ obras, profs, pedidos }, meses) {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1)
  const noPeriodo = (d) => d && new Date(String(d).slice(0, 10) + 'T12:00:00') >= inicio
  const profPorId = Object.fromEntries(profs.map((p) => [p.id, p]))

  const vendas = obras.filter((o) => ehVenda(o) && noPeriodo(o.data_fechamento))

  // por mês
  const porMes = []
  for (let k = meses - 1; k >= 0; k--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const doMes = vendas.filter((o) => String(o.data_fechamento).startsWith(chave))
    porMes.push({
      chave, qtd: doMes.length, valor: doMes.reduce((s, o) => s + Number(o.valor_produtos || 0), 0),
      rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, rotuloCurto: MESES[d.getMonth()],
    })
  }

  // ranking
  const agrupa = (lista, chaveFn) => {
    const m = new Map()
    for (const o of lista) {
      const k = chaveFn(o) || 'Não informado'
      const a = m.get(k) || { nome: k, qtd: 0, valor: 0 }
      a.qtd++; a.valor += Number(o.valor_produtos || 0); m.set(k, a)
    }
    return [...m.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor)
  }
  const ranking = agrupa(vendas, (o) => o.profissional_id).slice(0, 10)
    .map((x) => ({ ...x, id: x.nome, nome: profPorId[x.nome]?.apelido ? `${profPorId[x.nome].nome} (${profPorId[x.nome].apelido})` : profPorId[x.nome]?.nome || '—' }))
  const porCategoria = agrupa(vendas, (o) => profPorId[o.profissional_id]?.categoria).slice(0, 8)
  const porCidade = agrupa(vendas, (o) => o.cidade || profPorId[o.profissional_id]?.cidade).slice(0, 8)

  // perdas e conversão (perdida usa a data da última alteração)
  const perdidas = obras.filter((o) => o.status === 'perdida' && noPeriodo(o.updated_at))
  const fechadasPeriodo = obras.filter((o) => ['fechada', 'entregue'].includes(o.status) && noPeriodo(o.data_fechamento))
  const base = fechadasPeriodo.length + perdidas.length
  const conversao = base ? Math.round((fechadasPeriodo.length / base) * 100) : null
  const perdas = agrupa(perdidas, (o) => o.motivo_perda).slice(0, 8)

  // funil atual
  const funil = ['em_andamento', 'orcada', 'fechada', 'entregue', 'perdida']
    .map((s) => ({ status: s, qtd: obras.filter((o) => o.status === s).length }))

  // participação nas vendas da fábrica (precisa dos pedidos vindos do app)
  const pedidosPeriodo = pedidos.filter((p) => noPeriodo(p.data_fechamento))
  const obraPorId = Object.fromEntries(obras.map((o) => [o.id, o]))
  const pedidosDeProf = pedidosPeriodo.filter((p) => p.obra_id && ehVenda(obraPorId[p.obra_id] || {}))
  const participacao = pedidosPeriodo.length ? Math.round((pedidosDeProf.length / pedidosPeriodo.length) * 100) : null

  return {
    vendas: vendas.length,
    valor: vendas.reduce((s, o) => s + Number(o.valor_produtos || 0), 0),
    porMes, ranking, porCategoria, porCidade, perdas, funil, conversao, participacao,
    pedidosTotal: pedidosPeriodo.length,
    abertas: obras.filter((o) => ['em_andamento', 'orcada'].includes(o.status)).length,
    indicadasLink: obras.filter((o) => o.origem_cadastro === 'link_indicacao').length,
    indicadasWhats: obras.filter((o) => o.origem_cadastro === 'whatsapp').length,
  }
}

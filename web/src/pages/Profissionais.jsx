import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, BotaoWhats } from '../components/ui'
import { ProfissionalModal } from '../components/forms'
import { brl, dataBR, formataTelefone } from '../util'

export default function Profissionais() {
  const nav = useNavigate()
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [inativos, setInativos] = useState(false)
  const [novo, setNovo] = useState(false)
  const { data, erro, carregando, recarregar } = useCarregar(() =>
    q(supabase.from('crm_v_profissionais').select('*').order('nome')))

  const cats = useMemo(() => [...new Set((data || []).map((p) => p.categoria).filter(Boolean))].sort(), [data])
  const lista = (data || []).filter((p) => {
    if (!inativos && !p.ativo) return false
    if (cat && p.categoria !== cat) return false
    const t = busca.trim().toLowerCase()
    if (!t) return true
    return [p.nome, p.apelido, p.cidade, p.telefone].some((v) => (v || '').toLowerCase().includes(t))
  })

  const ativos = (data || []).filter((p) => p.ativo)
  const kpi = {
    total: ativos.length,
    comVenda: ativos.filter((p) => p.vendas_total > 0).length,
    atrasados: ativos.filter((p) => p.dias_sem_venda >= p.prazo_efetivo).length,
    aPagar: ativos.reduce((s, p) => s + Number(p.comissao_a_pagar || 0), 0),
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Profissionais</h1>
          <p className="sub">Pedreiros, mestres, engenheiros e arquitetos que trazem obras para a fábrica.</p>
        </div>
        <button className="btn primary" onClick={() => setNovo(true)}>+ Novo profissional</button>
      </div>

      {data && (
        <div className="kpis">
          <div className="kpi"><b>{kpi.total}</b><span>Ativos</span></div>
          <div className="kpi"><b>{kpi.comVenda}</b><span>Já trouxeram venda</span></div>
          <div className="kpi"><b>{kpi.atrasados}</b><span>Passaram do prazo de recompra</span></div>
          <div className="kpi"><b>{brl(kpi.aPagar)}</b><span>Comissão a pagar</span></div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ flex: '1 1 220px' }} placeholder="Buscar por nome, apelido, cidade ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
      </div>

      <Carregando carregando={carregando && !data} erro={erro} />
      {data && lista.length === 0 && (
        <div className="card empty">{data.length === 0 ? 'Nenhum profissional ainda. Cadastre o primeiro — em todo atendimento, pergunte “quem é o pedreiro da obra?”.' : 'Nenhum resultado.'}</div>
      )}
      {lista.length > 0 && (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr>
              <th>Profissional</th><th className="hide-m">Categoria</th><th className="hide-m">Telefone</th>
              <th>Vendas</th><th>Última venda</th><th className="hide-m">A pagar</th><th className="hide-m"></th>
            </tr></thead>
            <tbody>
              {lista.map((p) => {
                const atrasado = p.dias_sem_venda >= p.prazo_efetivo
                return (
                  <tr key={p.id} className="click" onClick={() => nav(`/profissionais/${p.id}`)}>
                    <td><b>{p.nome}</b>{p.apelido && <span className="muted"> ({p.apelido})</span>}
                      <div className="muted small">{p.cidade || ''}{!p.ativo && ' · inativo'}</div></td>
                    <td className="hide-m">{p.categoria || '—'}</td>
                    <td className="hide-m num">{formataTelefone(p.telefone)}</td>
                    <td className="num">{p.vendas_total}</td>
                    <td>
                      {p.ultima_venda ? dataBR(p.ultima_venda) : <span className="muted">nunca</span>}
                      {atrasado && p.ativo && <div><span className="badge warn">{p.dias_sem_venda} dias</span></div>}
                    </td>
                    <td className="hide-m num">{Number(p.comissao_a_pagar) > 0 ? brl(p.comissao_a_pagar) : '—'}</td>
                    <td className="hide-m" onClick={(e) => e.stopPropagation()}><BotaoWhats telefone={p.telefone} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {novo && <ProfissionalModal onClose={() => setNovo(false)} onDone={(p) => { recarregar(); nav(`/profissionais/${p.id}`) }} />}
    </>
  )
}

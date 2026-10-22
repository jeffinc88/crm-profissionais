import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando } from '../components/ui'
import { ObraModal } from '../components/forms'
import { brl, dataBR, STATUS_OBRA, PAPEL, STATUS_COMISSAO } from '../util'

const COR_OBRA = { em_andamento: 'info', orcada: 'warn', fechada: 'ok', perdida: 'bad', entregue: '' }
const COR_COM = { aguardando_recebimento: 'warn', a_pagar: 'info', paga: 'ok', cancelada: '' }
export const CorStatusObra = ({ s }) => <span className={`badge ${COR_OBRA[s]}`}>{STATUS_OBRA[s]}</span>
export const CorStatusComissao = ({ s }) => <span className={`badge ${COR_COM[s]}`}>{STATUS_COMISSAO[s]}</span>

const FILTROS = ['abertas', 'em_andamento', 'orcada', 'fechada', 'entregue', 'perdida', 'todas']

export default function Obras() {
  const [filtro, setFiltro] = useState('abertas')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const { data, erro, carregando, recarregar } = useCarregar(() =>
    q(supabase.from('crm_obras').select('*, profissional:crm_profissionais(id, nome)').order('created_at', { ascending: false })))

  const conta = (f) => (data || []).filter((o) => passa(o, f)).length
  const lista = (data || []).filter((o) => passa(o, filtro)).filter((o) => {
    const t = busca.trim().toLowerCase()
    return !t || [o.dono_nome, o.endereco, o.cidade, o.profissional?.nome].some((v) => (v || '').toLowerCase().includes(t))
  })

  return (
    <>
      <div className="head">
        <div>
          <h1>Obras</h1>
          <p className="sub">Cada obra ligada a um profissional, do início até a entrega da laje.</p>
        </div>
        <button className="btn primary" onClick={() => setModal({})}>+ Nova obra</button>
      </div>

      <div className="tabs">
        {FILTROS.map((f) => (
          <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>
            {f === 'abertas' ? 'Abertas' : f === 'todas' ? 'Todas' : STATUS_OBRA[f]} ({conta(f)})
          </button>
        ))}
      </div>
      <input style={{ marginBottom: 12 }} placeholder="Buscar por dono, endereço, cidade ou profissional" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <Carregando carregando={carregando && !data} erro={erro} />
      {data && lista.length === 0 && <div className="card empty">Nenhuma obra aqui.</div>}
      {lista.length > 0 && (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Dono da Obra</th><th>Profissional</th><th>Status</th><th className="hide-m">Laje / entrega</th><th className="hide-m">Valor</th></tr></thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} className="click" onClick={() => setModal({ obra: o })}>
                  <td><b>{o.dono_nome || '—'}</b><div className="muted small">{[o.endereco, o.cidade].filter(Boolean).join(' — ')}</div></td>
                  <td>{o.profissional
                    ? <Link to={`/profissionais/${o.profissional.id}`} onClick={(e) => e.stopPropagation()}>{o.profissional.nome}</Link>
                    : <span className="muted">—</span>}
                    <div className="muted small">{PAPEL[o.papel]}</div></td>
                  <td><CorStatusObra s={o.status} />{o.status === 'perdida' && <div className="muted small">{o.motivo_perda}</div>}</td>
                  <td className="hide-m small">{o.status === 'entregue' ? `entregue ${dataBR(o.data_entrega)}` : o.previsao_laje ? `prevista ${dataBR(o.previsao_laje)}` : '—'}</td>
                  <td className="hide-m num">{o.valor_produtos ? brl(o.valor_produtos) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ObraModal inicial={modal.obra} onClose={() => setModal(null)} onDone={recarregar} />}
    </>
  )
}

function passa(o, f) {
  if (f === 'todas') return true
  if (f === 'abertas') return o.status === 'em_andamento' || o.status === 'orcada'
  return o.status === f
}

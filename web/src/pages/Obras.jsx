import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, Modal, Erro, useEnvio, BotaoWhats } from '../components/ui'
import { ObraModal, buscarObrasParecidas, SelectProfissional, useProfissionaisLista, AvisoDuplicado } from '../components/forms'
import { soDigitos } from '../util'
import { brl, dataBR, formataTelefone, STATUS_OBRA, PAPEL, STATUS_COMISSAO, MOTIVOS_PERDA, hoje } from '../util'

const COR_OBRA = { em_andamento: 'info', orcada: 'warn', fechada: 'ok', perdida: 'bad', entregue: '' }
const COR_COM = { aguardando_recebimento: 'warn', a_pagar: 'info', paga: 'ok', cancelada: '' }
export const CorStatusObra = ({ s }) => <span className={`badge ${COR_OBRA[s]}`}>{STATUS_OBRA[s]}</span>
export const CorStatusComissao = ({ s }) => <span className={`badge ${COR_COM[s]}`}>{STATUS_COMISSAO[s]}</span>

const FILTROS = ['abertas', 'em_andamento', 'orcada', 'fechada', 'entregue', 'perdida', 'todas']
const COLUNAS = ['em_andamento', 'orcada', 'fechada', 'entregue', 'perdida']
const FINAIS = ['entregue', 'perdida']
const avisar = () => window.dispatchEvent(new Event('crm:atualizar'))

function lerModo() { try { return localStorage.getItem('crm:obras:modo') || 'quadro' } catch { return 'quadro' } }
function gravarModo(m) { try { localStorage.setItem('crm:obras:modo', m) } catch { /* sem armazenamento */ } }

export default function Obras() {
  const [modo, setModo] = useState(lerModo)
  const [filtro, setFiltro] = useState('abertas')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [perda, setPerda] = useState(null)
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const [obras, indicacoes] = await Promise.all([
      q(supabase.from('crm_obras').select('*, profissional:crm_profissionais(id, nome, apelido)').order('created_at', { ascending: false })),
      q(supabase.from('crm_indicacoes').select('*, profissional:crm_profissionais(id, nome, apelido, telefone)').eq('status', 'pendente').order('recebida_em')),
    ])
    return { obras, indicacoes }
  })
  const trocaModo = (m) => { setModo(m); gravarModo(m) }

  const buscaOk = (o) => {
    const t = busca.trim().toLowerCase()
    return !t || [o.dono_nome, o.endereco, o.cidade, o.profissional?.nome, o.profissional?.apelido].some((v) => (v || '').toLowerCase().includes(t))
  }
  const obras = (data?.obras || []).filter(buscaOk)
  const conta = (f) => obras.filter((o) => passa(o, f)).length
  const lista = obras.filter((o) => passa(o, filtro))
  const nIndic = data?.indicacoes.length || 0

  const mover = async (obra, status) => {
    if (obra.status === status) return
    if (status === 'perdida') { setPerda(obra); return }
    const extra = status === 'entregue' && !obra.data_entrega ? { data_entrega: hoje() } : {}
    await q(supabase.from('crm_obras').update({ status, ...extra }).eq('id', obra.id))
    avisar(); recarregar()
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Obras</h1>
          <p className="sub">Cada obra ligada a um profissional, do início até a entrega da laje.</p>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Visualização">
            <button className={modo === 'quadro' ? 'on' : ''} onClick={() => trocaModo('quadro')}>Quadro</button>
            <button className={modo === 'lista' ? 'on' : ''} onClick={() => trocaModo('lista')}>Lista</button>
            <button className={modo === 'indicacoes' ? 'on' : ''} onClick={() => trocaModo('indicacoes')}>
              Indicações{nIndic > 0 && <> <span className="count">{nIndic}</span></>}
            </button>
          </div>
          <button className="btn primary" onClick={() => setModal({})}>+ Nova obra</button>
        </div>
      </div>

      {modo !== 'indicacoes' && (
        <input style={{ marginBottom: 12 }} placeholder="Buscar por dono, endereço, cidade ou profissional" value={busca} onChange={(e) => setBusca(e.target.value)} />
      )}

      <Carregando carregando={carregando && !data} erro={erro} />

      {data && modo === 'quadro' && <Quadro obras={obras} onAbrir={(o) => setModal({ obra: o })} onMover={mover} />}

      {data && modo === 'lista' && (
        <>
          <div className="tabs">
            {FILTROS.map((f) => (
              <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>
                {f === 'abertas' ? 'Abertas' : f === 'todas' ? 'Todas' : STATUS_OBRA[f]} ({conta(f)})
              </button>
            ))}
          </div>
          {lista.length === 0 ? <div className="card empty">Nenhuma obra aqui.</div> : (
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
        </>
      )}

      {data && modo === 'indicacoes' && <Indicacoes itens={data.indicacoes} onMudou={() => { avisar(); recarregar() }} />}

      {modal && <ObraModal inicial={modal.obra} onClose={() => setModal(null)} onDone={recarregar} />}
      {perda && <PerdaModal obra={perda} onClose={() => setPerda(null)} onDone={() => { avisar(); recarregar() }} />}
    </>
  )
}

// ---------- Item 3: quadro (kanban) ----------
function Quadro({ obras, onAbrir, onMover }) {
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)
  return (
    <div className="kanban">
      {COLUNAS.map((col) => {
        const todas = obras.filter((o) => o.status === col)
        // Entregue e Perdida mostram só os últimos 30 dias; as antigas ficam na Lista
        const limite = Date.now() - 30 * 864e5
        const daColuna = FINAIS.includes(col) ? todas.filter((o) => new Date(o.updated_at).getTime() >= limite) : todas
        const ocultas = todas.length - daColuna.length
        return (
          <div key={col} className={`kcol ${sobre === col ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setSobre(col) }}
            onDragLeave={() => setSobre((s) => (s === col ? null : s))}
            onDrop={(e) => { e.preventDefault(); setSobre(null); const id = e.dataTransfer.getData('text/plain') || arrastando; const o = obras.find((x) => x.id === id); if (o) onMover(o, col) }}>
            <h3><span>{STATUS_OBRA[col]}</span><span className="badge">{todas.length}</span></h3>
            {ocultas > 0 && <div className="muted small" style={{ padding: '0 4px' }}>Últimos 30 dias · {ocultas} mais antiga(s) na Lista</div>}
            {daColuna.length === 0 && <div className="muted small" style={{ padding: '10px 4px' }}>Arraste uma obra para cá</div>}
            {daColuna.map((o) => (
              <div key={o.id} className={`kcard ${arrastando === o.id ? 'dragging' : ''}`} draggable
                onDragStart={(e) => { setArrastando(o.id); e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => setArrastando(null)}
                onClick={() => onAbrir(o)}>
                <b>{o.dono_nome || 'Sem dono'}</b>
                <div className="muted small">{[o.endereco, o.cidade].filter(Boolean).join(' — ') || 'Sem endereço'}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  👷 {o.profissional ? (o.profissional.apelido || o.profissional.nome) : <span className="muted">sem profissional</span>}
                  <span className="muted"> · {PAPEL[o.papel]}</span>
                </div>
                <div className="muted small">
                  {o.status === 'perdida' ? o.motivo_perda
                    : o.status === 'entregue' ? `entregue ${dataBR(o.data_entrega)}`
                      : o.valor_produtos ? brl(o.valor_produtos)
                        : o.previsao_laje ? `laje prevista ${dataBR(o.previsao_laje)}` : ''}
                </div>
                {o.origem_cadastro === 'link_indicacao' && <span className="badge info" style={{ marginTop: 4 }}>via link</span>}
                {o.origem_cadastro === 'whatsapp' && <span className="badge info" style={{ marginTop: 4 }}>via WhatsApp</span>}
                {/* No celular não dá para arrastar: menu para mover */}
                <select value="" onClick={(e) => e.stopPropagation()} onChange={(e) => e.target.value && onMover(o, e.target.value)} aria-label="Mover obra">
                  <option value="">Mover para…</option>
                  {COLUNAS.filter((c) => c !== col).map((c) => <option key={c} value={c}>{STATUS_OBRA[c]}</option>)}
                </select>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function PerdaModal({ obra, onClose, onDone }) {
  const [motivo, setMotivo] = useState('')
  const { ocupado, erro, enviar } = useEnvio()
  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      await q(supabase.from('crm_obras').update({ status: 'perdida', motivo_perda: motivo }).eq('id', obra.id))
      onDone(); onClose()
    })
  }
  return (
    <Modal titulo={`Obra perdida — ${obra.dono_nome || ''}`} onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        <label>Por que perdemos?
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} required autoFocus>
            <option value="">Selecione…</option>
            {MOTIVOS_PERDA.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <div className="foot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado}>Marcar como perdida</button></div>
      </form>
    </Modal>
  )
}

// ---------- Item 2: indicações recebidas pelo link ----------
function Indicacoes({ itens, onMudou }) {
  const [revisar, setRevisar] = useState(null)
  const [porWhats, setPorWhats] = useState(false)
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="sub" style={{ margin: 0, flex: '1 1 320px' }}>Indicações que chegaram pelo link. Aprove para virar uma obra do Indicador, com a data da indicação registrada.</p>
        <button className="btn whats" onClick={() => setPorWhats(true)}>+ Indicação recebida por WhatsApp</button>
      </div>
      {itens.length === 0 && <div className="card empty">Nenhuma indicação pelo link esperando aprovação. Indicação que chegar por áudio ou mensagem: use o botão verde acima.</div>}
      {itens.length > 0 && <div className="card" style={{ padding: 0 }}>
        {itens.map((i) => (
          <div className="item" key={i.id}>
            <div className="stack" style={{ gap: 3 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge info">Indicação</span><b>{i.dono_nome}</b>
                <span className="muted small">por {i.profissional
                  ? <Link to={`/profissionais/${i.profissional.id}`}>{i.profissional.nome}</Link>
                  : <><b>{i.indicador_nome}</b> ({formataTelefone(i.indicador_telefone)}) <span className="badge warn">sem cadastro</span></>} em {new Date(i.recebida_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                {i.origem === 'link_geral' && <span className="badge">link geral</span>}
              </div>
              <div className="small">{[i.endereco, i.cidade].filter(Boolean).join(' — ') || 'Sem endereço'} · {formataTelefone(i.dono_telefone)}</div>
              <div className="muted small">{[i.etapa && `Etapa: ${i.etapa}`, i.previsao_laje && `Laje: ${i.previsao_laje}`].filter(Boolean).join(' · ')}</div>
              {i.observacao && <div className="muted small">“{i.observacao}”</div>}
            </div>
            <div className="acts">
              <BotaoWhats telefone={i.dono_telefone} />
              <button className="btn sm primary" onClick={() => setRevisar(i)}>Revisar</button>
            </div>
          </div>
        ))}
      </div>}
      {revisar && <RevisarIndicacao ind={revisar} onClose={() => setRevisar(null)} onDone={onMudou} />}
      {porWhats && <IndicacaoWhats onClose={() => setPorWhats(false)} onDone={onMudou} />}
    </>
  )
}

function RevisarIndicacao({ ind, onClose, onDone }) {
  const { ocupado, erro, enviar } = useEnvio()
  const { data: parecidas } = useCarregar(() => buscarObrasParecidas(ind.dono_telefone, null, null), [ind.id])
  const [ligarA, setLigarA] = useState('')
  const lista = useProfissionaisLista()
  const [profId, setProfId] = useState(ind.profissional?.id || null)
  const prof = ind.profissional || (lista || []).find((p) => p.id === profId)
  const quemNome = prof?.nome || ind.indicador_nome

  const aprovar = () => enviar(async () => {
    if (!profId) throw new Error('Escolha quem indicou. Se a pessoa ainda não tem cadastro, cadastre em Profissionais e volte aqui.')
    await q(supabase.rpc('crm_aprovar_indicacao', { p_indicacao_id: ind.id, p_obra_existente: ligarA || null, p_profissional_id: profId }))
    onDone(); onClose()
  })
  const recusar = () => enviar(async () => {
    await q(supabase.from('crm_indicacoes').update({ status: 'recusada', revisada_em: new Date().toISOString() }).eq('id', ind.id))
    onDone(); onClose()
  })

  return (
    <Modal titulo={`Indicação de ${quemNome}`} onClose={onClose}>
      <div className="stack">
        <Erro msg={erro} />
        {!ind.profissional && (
          <div className="alert warn">
            Veio pelo <b>link geral</b>, de <b>{ind.indicador_nome}</b> · {formataTelefone(ind.indicador_telefone)}. O telefone não bate com nenhum profissional cadastrado.
            <label style={{ marginTop: 8 }}>Quem indicou<SelectProfissional value={profId} onChange={setProfId} lista={lista} /></label>
            <span className="small">Não está na lista? Cadastre em <Link to="/profissionais">Profissionais</Link> com esse telefone e volte aqui.</span>
          </div>
        )}
        <div className="small"><b>{ind.dono_nome}</b> · {formataTelefone(ind.dono_telefone)}<br />{[ind.endereco, ind.cidade].filter(Boolean).join(' — ')}</div>
        {parecidas?.length > 0 && (
          <div className="alert warn">
            <b>Já existe obra com este telefone.</b> Pode ser a mesma:
            <label style={{ marginTop: 8 }}>O que fazer?
              <select value={ligarA} onChange={(e) => setLigarA(e.target.value)}>
                <option value="">Criar uma obra nova</option>
                {parecidas.map((o) => <option key={o.id} value={o.id}>Ligar à obra de {o.dono_nome} — {o.endereco || o.cidade || ''} ({o.profissional?.nome || 'sem profissional'})</option>)}
              </select>
            </label>
          </div>
        )}
        <p className="muted small" style={{ margin: 0 }}>Ao aprovar, a obra entra como <b>Em andamento</b>, com {quemNome || 'o profissional escolhido'} como Indicador e a data da indicação guardada.</p>
        <div className="foot">
          <button className="btn danger" disabled={ocupado} onClick={recusar}>Recusar</button>
          <button className="btn primary" disabled={ocupado} onClick={aprovar}>{ligarA ? 'Ligar à obra existente' : 'Aprovar e criar obra'}</button>
        </div>
      </div>
    </Modal>
  )
}

// Atalho: o pedreiro mandou áudio/mensagem; o operador registra em segundos
function IndicacaoWhats({ onClose, onDone }) {
  const lista = useProfissionaisLista()
  const [f, setF] = useState({ profissional_id: null, dono: '', telefone: '', onde: '' })
  const [duplicadas, setDuplicadas] = useState(null)
  const { ocupado, erro, enviar } = useEnvio()
  const set = (k) => (e) => { setDuplicadas(null); setF({ ...f, [k]: e.target.value }) }
  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      if (!f.profissional_id) throw new Error('Escolha quem indicou.')
      if (!duplicadas) {
        const achadas = await buscarObrasParecidas(soDigitos(f.telefone), null, null)
        if (achadas.length) { setDuplicadas(achadas); return }
      }
      await q(supabase.from('crm_obras').insert({
        profissional_id: f.profissional_id, papel: 'indicador', dono_nome: f.dono.trim(),
        dono_telefone: soDigitos(f.telefone) || null, endereco: f.onde.trim() || null,
        status: 'em_andamento', indicado_em: new Date().toISOString(), origem_cadastro: 'whatsapp',
      }))
      onDone(); onClose()
    })
  }
  return (
    <Modal titulo="Indicação recebida por WhatsApp" onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        <label>Quem indicou<SelectProfissional value={f.profissional_id} onChange={(v) => { setDuplicadas(null); setF({ ...f, profissional_id: v }) }} lista={lista} /></label>
        <div className="grid2">
          <label>Nome do dono da obra<input value={f.dono} onChange={set('dono')} required /></label>
          <label>Telefone do dono<input value={f.telefone} onChange={set('telefone')} inputMode="tel" /></label>
        </div>
        <label>Onde é (opcional)<input value={f.onde} onChange={set('onde')} placeholder="Bairro, rua ou cidade" /></label>
        <p className="muted small" style={{ margin: 0 }}>A obra entra como Em andamento, com a data e a hora de agora como data da indicação.</p>
        {duplicadas && <AvisoDuplicado itens={duplicadas.map((o) => ({ id: o.id, texto: `${o.dono_nome || 'Sem dono'} — ${o.endereco || o.cidade || ''} · ${o.profissional?.nome || 'sem profissional'} (${STATUS_OBRA[o.status]})` }))} />}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>{duplicadas ? 'Registrar mesmo assim' : 'Registrar indicação'}</button>
        </div>
      </form>
    </Modal>
  )
}

function passa(o, f) {
  if (f === 'todas') return true
  if (f === 'abertas') return o.status === 'em_andamento' || o.status === 'orcada'
  return o.status === f
}

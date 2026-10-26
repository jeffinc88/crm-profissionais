import { useMemo, useState } from 'react'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, Modal, Erro, useEnvio } from '../components/ui'
import { SelectProfissional, useProfissionaisLista } from '../components/forms'
import { brl, dataBR, formataTelefone, PAPEL, STATUS_OBRA } from '../util'

const avisar = () => window.dispatchEvent(new Event('crm:atualizar'))

export default function Conciliacao() {
  const [sel, setSel] = useState(null)
  const { ocupado, erro: erroSem, enviar } = useEnvio()
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const [fila, usadas, obras] = await Promise.all([
      q(supabase.from('crm_v_fila_conciliacao').select('*').order('data_fechamento')),
      q(supabase.from('crm_pedidos_app').select('obra_id').not('obra_id', 'is', null)),
      q(supabase.from('crm_obras').select('*, profissional:crm_profissionais(id, nome, tipo_comissao_padrao, valor_comissao_padrao)')
        .neq('status', 'perdida').order('created_at', { ascending: false })),
    ])
    const ocupadas = new Set(usadas.map((u) => u.obra_id))
    return { fila, obrasLivres: obras.filter((o) => !ocupadas.has(o.id)) }
  })

  const semProfissional = (p) => enviar(async () => {
    await q(supabase.rpc('crm_marcar_sem_profissional', { p_pedido_id: p.id }))
    avisar(); recarregar()
  })

  return (
    <>
      <div className="head">
        <div>
          <h1>Conciliação</h1>
          <p className="sub">Pedidos fechados no app que precisam ser ligados a uma obra do CRM. Inclui os pedidos <b>sem</b> marcação, para achar pedreiros omitidos.</p>
        </div>
      </div>
      <Erro msg={erroSem} />
      <Carregando carregando={carregando && !data} erro={erro} />
      {data && data.fila.length === 0 && <div className="card empty">Fila vazia: todos os pedidos estão conciliados.</div>}
      {data && data.fila.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {data.fila.map((p) => (
            <div className="item" key={p.id}>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  {p.originado_crm
                    ? <span className="badge ok">Vendedor marcou: veio de profissional</span>
                    : <span className="badge warn">Sem marcação</span>}
                  <b>{p.cliente_nome || 'Cliente sem nome'}</b>
                  <span className="muted small">orçamento {p.app_orcamento_id}</span>
                </div>
                <div className="small">
                  Produtos {brl(p.valor_produtos)} · Frete {brl(p.valor_frete)} · Outras despesas <b>{brl(p.valor_outras_despesas)}</b>
                </div>
                <div className="muted small">
                  Fechado em {dataBR(p.data_fechamento)} · vendedor {p.vendedor_nome || '—'} · {formataTelefone(p.cliente_telefone)} {p.cidade && `· ${p.cidade}`}
                  {p.profissional_informado && <> · profissional informado: <b>{p.profissional_informado}</b></>}
                </div>
                {p.sugestoes?.length > 0 && <div className="small">💡 {p.sugestoes.length} obra(s) do CRM com o mesmo CPF/telefone do cliente</div>}
              </div>
              <div className="acts">
                <button className="btn sm primary" onClick={() => setSel(p)}>Conciliar</button>
                <button className="btn sm" disabled={ocupado} onClick={() => semProfissional(p)}>Sem profissional</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {sel && <ConciliarModal pedido={sel} obrasLivres={data.obrasLivres} onClose={() => setSel(null)} onDone={recarregar} />}
    </>
  )
}

function ConciliarModal({ pedido, obrasLivres, onClose, onDone }) {
  const lista = useProfissionaisLista()
  const sugeridas = new Set((pedido.sugestoes || []).map((s) => s.obra_id))
  const ordenadas = useMemo(
    () => [...obrasLivres].sort((a, b) => (sugeridas.has(b.id) ? 1 : 0) - (sugeridas.has(a.id) ? 1 : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obrasLivres])
  const [modo, setModo] = useState(sugeridas.size ? 'existente' : 'nova')
  const [obraId, setObraId] = useState(ordenadas.find((o) => sugeridas.has(o.id))?.id || '')
  const [profId, setProfId] = useState(null)
  const [papel, setPapel] = useState('indicador')
  const [tipo, setTipo] = useState(Number(pedido.valor_outras_despesas) > 0 ? 'fixa' : '')
  const [valorFixo, setValorFixo] = useState(Number(pedido.valor_outras_despesas) > 0 ? pedido.valor_outras_despesas : '')
  const [perc, setPerc] = useState('')
  const { ocupado, erro, enviar } = useEnvio()

  const obra = modo === 'existente' ? ordenadas.find((o) => o.id === obraId) : null
  const papelFinal = obra ? obra.papel : papel
  const prof = obra ? obra.profissional : lista.find((p) => p.id === profId)
  const tipoFinal = tipo || obra?.tipo_comissao || prof?.tipo_comissao_padrao || 'fixa'
  const geraComissao = prof && papelFinal === 'indicador'
  const valorPrevisto = tipoFinal === 'percentual'
    ? (Number(pedido.valor_produtos) * Number(perc || (prof?.tipo_comissao_padrao === 'percentual' ? prof.valor_comissao_padrao : 0)) / 100)
    : Number(valorFixo || obra?.valor_comissao_combinado || (prof?.tipo_comissao_padrao === 'fixa' ? prof.valor_comissao_padrao : 0) || 0)
  const combinado = obra?.valor_comissao_combinado
  const diverge = tipoFinal === 'fixa' && combinado != null && Number(combinado) !== Number(valorPrevisto)

  const confirmar = (e) => {
    e.preventDefault()
    enviar(async () => {
      let id = obraId
      if (modo === 'nova') {
        if (!profId) throw new Error('Escolha o profissional da obra.')
        const nova = await q(supabase.from('crm_obras').insert({
          profissional_id: profId, papel, dono_nome: pedido.cliente_nome, dono_telefone: pedido.cliente_telefone,
          dono_documento: pedido.cliente_documento, cidade: pedido.cidade, status: 'fechada',
          data_fechamento: String(pedido.data_fechamento).slice(0, 10),
        }).select().single())
        id = nova.id
      }
      if (!id) throw new Error('Escolha a obra.')
      await q(supabase.rpc('crm_conciliar', {
        p_pedido_id: pedido.id, p_obra_id: id, p_tipo: tipo || null,
        p_percentual: tipoFinal === 'percentual' && perc !== '' ? Number(perc) : null,
        p_valor_fixo: tipoFinal === 'fixa' && valorFixo !== '' ? Number(valorFixo) : null,
      }))
      avisar(); onDone(); onClose()
    })
  }

  return (
    <Modal titulo={`Conciliar — ${pedido.cliente_nome || pedido.app_orcamento_id}`} onClose={onClose} wide>
      <form className="stack" onSubmit={confirmar}>
        <Erro msg={erro} />
        <div className="tabs" style={{ marginBottom: 4 }}>
          <button type="button" className={modo === 'existente' ? 'on' : ''} onClick={() => setModo('existente')}>Obra já cadastrada</button>
          <button type="button" className={modo === 'nova' ? 'on' : ''} onClick={() => setModo('nova')}>Criar obra agora</button>
        </div>

        {modo === 'existente' ? (
          <label>Obra
            <select value={obraId} onChange={(e) => setObraId(e.target.value)} required>
              <option value="">Selecione…</option>
              {ordenadas.map((o) => (
                <option key={o.id} value={o.id}>
                  {sugeridas.has(o.id) ? '💡 ' : ''}{o.dono_nome || 'Sem dono'} — {o.endereco || o.cidade || ''} · {o.profissional?.nome || 'sem profissional'} ({STATUS_OBRA[o.status]})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid2">
            <label>Profissional<SelectProfissional value={profId} onChange={setProfId} lista={lista} /></label>
            <label>Papel
              <select value={papel} onChange={(e) => setPapel(e.target.value)}>
                {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
        )}

        {geraComissao ? (
          <>
            <div className="grid3">
              <label>Tipo de gratificação
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Automático ({tipoFinal === 'fixa' ? 'Fixa' : 'Percentual'})</option>
                  <option value="fixa">Fixa</option>
                  <option value="percentual">Percentual</option>
                </select>
              </label>
              {tipoFinal === 'fixa' ? (
                <label>Valor fixo (R$)
                  <input type="number" step="0.01" min="0" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} placeholder="Outras despesas do pedido" />
                </label>
              ) : (
                <label>Percentual (%)
                  <input type="number" step="0.01" min="0" value={perc} onChange={(e) => setPerc(e.target.value)} placeholder={prof?.valor_comissao_padrao ?? ''} />
                </label>
              )}
              <div><span className="muted small">Gratificação prevista</span><div style={{ fontSize: '1.3rem', fontWeight: 700 }} className="num">{brl(valorPrevisto)}</div></div>
            </div>
            {tipoFinal === 'percentual' && <div className="muted small">Calculada sobre os produtos ({brl(pedido.valor_produtos)}), sem o frete.</div>}
            {diverge && <div className="alert warn">O valor combinado na obra era {brl(combinado)}, mas o pedido traz {brl(valorPrevisto)}. A gratificação será marcada como <b>divergente</b> para o Gerencial revisar.</div>}
            {!pedido.originado_crm && <div className="alert bad"><b>Profissional omitido:</b> o orçamento não foi marcado como vindo de profissional. O profissional recebe a gratificação e o representante <b>não recebe por esta venda</b>.</div>}
          </>
        ) : prof ? (
          <div className="alert info">
            {papelFinal === 'comprador'
              ? 'Comprador — a venda conta como originada pelo profissional, mas não gera gratificação.'
              : 'Profissional da Obra — ele fica ligado à obra, mas a venda não conta como originada por ele e não gera gratificação (a não ser que a regra esteja ligada nas Configurações).'}
          </div>
        ) : null}

        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>Confirmar conciliação</button>
        </div>
      </form>
    </Modal>
  )
}

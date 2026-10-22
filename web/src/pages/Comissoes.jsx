import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useSessao } from '../App'
import { useCarregar, Carregando, Modal, Erro, useEnvio } from '../components/ui'
import { brl, dataBR, hoje, STATUS_COMISSAO } from '../util'
import { CorStatusComissao } from './Obras'

const avisar = () => window.dispatchEvent(new Event('crm:atualizar'))
const ABAS = ['aguardando_recebimento', 'a_pagar', 'paga', 'cancelada']

export default function Comissoes() {
  const { gerencial } = useSessao()
  const [aba, setAba] = useState('a_pagar')
  const [modal, setModal] = useState(null)
  const { data, erro, carregando, recarregar } = useCarregar(() =>
    q(supabase.from('crm_comissoes')
      .select('*, profissional:crm_profissionais(id, nome, chave_pix), obra:crm_obras(dono_nome, endereco, cidade)')
      .order('created_at', { ascending: false })))

  const lista = (data || []).filter((k) => k.status === aba)
  const soma = (s) => (data || []).filter((k) => k.status === s).reduce((t, k) => t + Number(k.valor), 0)

  const verComprovante = async (path) => {
    const { data: d, error } = await supabase.storage.from('crm-comprovantes').createSignedUrl(path, 300)
    if (!error) window.open(d.signedUrl, '_blank')
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Comissões</h1>
          <p className="sub">Extrato geral. A comissão só fica liberada para pagamento depois que o Dono da Obra quita o pedido.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{brl(soma('aguardando_recebimento'))}</b><span>Aguardando o cliente quitar</span></div>
        <div className="kpi"><b>{brl(soma('a_pagar'))}</b><span>A pagar</span></div>
        <div className="kpi"><b>{brl(soma('paga'))}</b><span>Pagas</span></div>
        <div className="kpi"><b>{(data || []).filter((k) => k.divergente && k.status !== 'cancelada').length}</b><span>Com valor divergente</span></div>
      </div>

      <div className="tabs">
        {ABAS.map((a) => (
          <button key={a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>
            {STATUS_COMISSAO[a]} ({(data || []).filter((k) => k.status === a).length})
          </button>
        ))}
      </div>

      <Carregando carregando={carregando && !data} erro={erro} />
      {data && lista.length === 0 && <div className="card empty">Nenhuma comissão aqui.</div>}
      {lista.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {lista.map((k) => (
            <div className="item" key={k.id}>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Link to={`/profissionais/${k.profissional.id}`}><b>{k.profissional.nome}</b></Link>
                  <CorStatusComissao s={k.status} />
                  {k.divergente && <span className="badge warn">Divergente: combinado {brl(k.valor_combinado)}</span>}
                  {k.profissional_omitido && <span className="badge bad">Omitido — representante perde comissão</span>}
                </div>
                <div className="small">Obra de {k.obra?.dono_nome || '—'} {k.obra?.endereco && `· ${k.obra.endereco}`}</div>
                <div className="muted small">
                  {k.tipo === 'fixa' ? 'Fixa' : `${k.percentual}% sobre ${brl(k.base_calculo)}`}
                  {k.cliente_quitou_em && ` · cliente quitou em ${dataBR(k.cliente_quitou_em)}`}
                  {k.pago_em && ` · paga em ${dataBR(k.pago_em)}`}
                  {k.profissional.chave_pix && ` · PIX: ${k.profissional.chave_pix}`}
                </div>
                {k.observacoes && <div className="muted small">{k.observacoes}</div>}
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                <b className="num" style={{ fontSize: '1.15rem' }}>{brl(k.valor)}</b>
                <div className="acts">
                  {k.status === 'aguardando_recebimento' && <button className="btn sm" onClick={() => setModal({ tipo: 'quitou', k })}>Cliente quitou</button>}
                  {gerencial && k.status === 'a_pagar' && <button className="btn sm primary" onClick={() => setModal({ tipo: 'pagar', k })}>Registrar pagamento</button>}
                  {gerencial && ['aguardando_recebimento', 'a_pagar'].includes(k.status) && <button className="btn sm" onClick={() => setModal({ tipo: 'editar', k })}>Ajustar</button>}
                  {k.comprovante_path && <button className="btn sm" onClick={() => verComprovante(k.comprovante_path)}>Comprovante</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.tipo === 'quitou' && <QuitouModal k={modal.k} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'pagar' && <PagarModal k={modal.k} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'editar' && <AjustarModal k={modal.k} onClose={() => setModal(null)} onDone={recarregar} />}
    </>
  )
}

function QuitouModal({ k, onClose, onDone }) {
  const [data, setData] = useState(hoje())
  const { ocupado, erro, enviar } = useEnvio()
  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      await q(supabase.from('crm_comissoes').update({ cliente_quitou_em: data }).eq('id', k.id))
      avisar(); onDone(); onClose()
    })
  }
  return (
    <Modal titulo="Cliente quitou o pedido" onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        <p className="muted" style={{ margin: 0 }}>Confirme que {k.obra?.dono_nome || 'o Dono da Obra'} pagou tudo. A comissão de {brl(k.valor)} passa para “A pagar”.</p>
        <label>Data da quitação<input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} required /></label>
        <div className="foot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado}>Confirmar</button></div>
      </form>
    </Modal>
  )
}

function PagarModal({ k, onClose, onDone }) {
  const [data, setData] = useState(hoje())
  const [arquivo, setArquivo] = useState(null)
  const [obs, setObs] = useState('')
  const { ocupado, erro, enviar } = useEnvio()
  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      let path = null
      if (arquivo) {
        const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase()
        path = `${k.profissional.id}/${k.id}.${ext}`
        const { error } = await supabase.storage.from('crm-comprovantes').upload(path, arquivo, { upsert: true })
        if (error) throw new Error('Falha ao enviar o comprovante: ' + error.message)
      }
      await q(supabase.from('crm_comissoes').update({
        status: 'paga', pago_em: data, comprovante_path: path,
        observacoes: [k.observacoes, obs].filter(Boolean).join('\n') || null,
      }).eq('id', k.id))
      avisar(); onDone(); onClose()
    })
  }
  return (
    <Modal titulo={`Pagar ${brl(k.valor)} a ${k.profissional.nome}`} onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        {k.profissional.chave_pix ? <div className="alert info">Chave PIX: <b>{k.profissional.chave_pix}</b></div> : <div className="alert warn">Este profissional não tem chave PIX cadastrada.</div>}
        <label>Data do pagamento<input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} required /></label>
        <label>Comprovante do PIX (imagem ou PDF)<input type="file" accept="image/*,application/pdf" onChange={(e) => setArquivo(e.target.files[0] || null)} /></label>
        <label>Observação<input value={obs} onChange={(e) => setObs(e.target.value)} /></label>
        <div className="foot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado}>Registrar pagamento</button></div>
      </form>
    </Modal>
  )
}

function AjustarModal({ k, onClose, onDone }) {
  const [valor, setValor] = useState(k.valor)
  const [obs, setObs] = useState('')
  const { ocupado, erro, enviar } = useEnvio()
  const salvar = (status) => enviar(async () => {
    await q(supabase.from('crm_comissoes').update({
      valor: Number(valor), status,
      observacoes: [k.observacoes, obs].filter(Boolean).join('\n') || null,
    }).eq('id', k.id))
    avisar(); onDone(); onClose()
  })
  return (
    <Modal titulo={`Ajustar comissão — ${k.profissional.nome}`} onClose={onClose}>
      <div className="stack">
        <Erro msg={erro} />
        {k.divergente && <div className="alert warn">Valor combinado na obra: {brl(k.valor_combinado)}. Valor do pedido: {brl(k.valor)}.</div>}
        <label>Valor (R$)<input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>Motivo do ajuste<input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: conferido com o vendedor" /></label>
        <div className="foot">
          <button className="btn danger" disabled={ocupado} onClick={() => salvar('cancelada')}>Cancelar comissão</button>
          <button className="btn primary" disabled={ocupado} onClick={() => salvar(k.status)}>Salvar valor</button>
        </div>
      </div>
    </Modal>
  )
}

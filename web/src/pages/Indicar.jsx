import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { linkWhats, WHATS_FABRICA } from '../util'

// Página pública: o profissional abre pelo link e indica uma obra.
// Tem que custar menos de 15 segundos: poucos campos, ou um toque para mandar áudio.
// token = link pessoal do profissional; token null = link GERAL (cartão de visita, cartaz),
// onde a pessoa informa o próprio nome e telefone. No link geral não se fala em
// gratificação: o cartão também chega à mão do dono da obra.
const ETAPAS = ['Começando', 'Levantando paredes', 'Pronta pra laje']
const VAZIO = { eu: '', meuTel: '', dono: '', telefone: '', onde: '', etapa: '' }

export default function Indicar({ token }) {
  const geral = !token
  const [nome, setNome] = useState(geral ? '' : undefined)
  const [f, setF] = useState(VAZIO)
  const [estado, setEstado] = useState('form') // form | enviando | ok
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (geral) return
    supabase.rpc('crm_indicacao_info', { p_token: token }).then(({ data }) => setNome(data || null))
  }, [token, geral])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const quem = geral ? f.eu.trim().split(' ')[0] : nome
  const audio = linkWhats(WHATS_FABRICA, quem ? `Oi, aqui é o ${quem}, tenho uma obra pra indicar` : 'Oi, tenho uma obra pra indicar')

  const enviar = async (e) => {
    e.preventDefault()
    setErro(''); setEstado('enviando')
    const { error } = geral
      ? await supabase.rpc('crm_enviar_indicacao_geral', {
          p_indicador_nome: f.eu, p_indicador_telefone: f.meuTel,
          p_dono_nome: f.dono, p_dono_telefone: f.telefone, p_endereco: f.onde, p_etapa: f.etapa,
        })
      : await supabase.rpc('crm_enviar_indicacao', {
          p_token: token, p_dono_nome: f.dono, p_dono_telefone: f.telefone, p_endereco: f.onde,
          p_cidade: '', p_etapa: f.etapa, p_previsao_laje: '', p_observacao: '',
        })
    if (error) { setErro(error.message); setEstado('form'); return }
    setEstado('ok')
  }

  const pronto = geral || nome

  return (
    <div className="publico">
      <header className="pub-head">
        <img src="./icon.svg" width="40" height="40" alt="" />
        <div><b>Carvalho Pré-Moldados</b><span>Lajes treliçadas · Franca/SP</span></div>
      </header>

      {nome === undefined && <div className="empty">Carregando…</div>}

      {nome === null && (
        <div className="card stack">
          <h1>Link inválido</h1>
          <p className="muted">Este link não funciona mais. Manda um áudio pra fábrica que a gente resolve.</p>
          <a className="btn whats grande" href={linkWhats(WHATS_FABRICA, 'Oi, tenho uma obra pra indicar')}>Falar com a fábrica no WhatsApp</a>
        </div>
      )}

      {pronto && estado === 'ok' && (
        <div className="card stack" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.6rem' }}>✅</div>
          <h1>Valeu{quem ? `, ${quem}` : ''}!</h1>
          <p className="muted">
            {geral
              ? 'Recebemos a indicação. A fábrica vai falar com o dono da obra e te dá um retorno.'
              : 'A fábrica vai ligar pro dono da obra. Fechou, sua gratificação tá garantida.'}
          </p>
          <button className="btn grande" onClick={() => { setF(geral ? { ...VAZIO, eu: f.eu, meuTel: f.meuTel } : VAZIO); setEstado('form') }}>Indicar outra obra</button>
        </div>
      )}

      {pronto && estado !== 'ok' && (
        <>
          {!geral && <div className="incentivo">💰 Indicou e fechou, <b>você ganha sua gratificação</b>. Quanto antes indicar, melhor.</div>}

          <form className="card stack" onSubmit={enviar}>
            <h1 style={{ margin: 0 }}>{geral ? 'Indique uma obra' : `Oi, ${nome}! Qual a obra?`}</h1>
            {geral && <p className="muted small" style={{ margin: 0 }}>É pedreiro, mestre de obras ou trabalha com construção? Conta pra gente de uma obra que vai precisar de laje.</p>}
            {erro && <div className="alert bad">{erro}</div>}
            {geral && (
              <div className="grid2">
                <label>Seu nome<input value={f.eu} onChange={set('eu')} required autoComplete="name" /></label>
                <label>Seu telefone<input value={f.meuTel} onChange={set('meuTel')} required inputMode="tel" autoComplete="tel" placeholder="(16) 99999-9999" /></label>
              </div>
            )}
            <label>Nome do dono da obra<input value={f.dono} onChange={set('dono')} required autoComplete="off" /></label>
            <label>Telefone do dono<input value={f.telefone} onChange={set('telefone')} inputMode="tel" placeholder="(16) 99999-9999" /></label>
            <label><span>Onde é? <span className="opc">(opcional)</span></span><input value={f.onde} onChange={set('onde')} placeholder="Bairro ou rua" /></label>
            <div>
              <div className="lbl-etapa">Em que pé está? <span className="opc">(opcional)</span></div>
              <div className="etapas">
                {ETAPAS.map((x) => (
                  <button type="button" key={x} className={f.etapa === x ? 'on' : ''} onClick={() => setF({ ...f, etapa: f.etapa === x ? '' : x })}>{x}</button>
                ))}
              </div>
            </div>
            <button className="btn primary grande" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar indicação'}
            </button>
          </form>

          <div className="ou"><span>ou</span></div>
          <a className="btn whats grande" href={audio}>🎤 Prefiro mandar áudio</a>
          <p className="muted small" style={{ textAlign: 'center' }}>Abre o WhatsApp da fábrica. Pode mandar áudio ou encaminhar o contato do dono.</p>
        </>
      )}
    </div>
  )
}

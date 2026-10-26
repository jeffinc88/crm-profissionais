import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, BotaoWhats } from '../components/ui'
import { ContatoModal } from '../components/forms'
import { TIPO_AGENDA, MOTIVO_POR_TIPO, dataBR, formataTelefone } from '../util'

// data de hoje no fuso de quem está usando (Brasília)
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const ORDEM_FILTRO = ['todos', 'aniversario', 'pos_entrega', 'recompra', 'agendado', 'obra_sem_laje']

export default function Agenda() {
  const [filtro, setFiltro] = useState('todos')
  const [contato, setContato] = useState(null)
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const itens = await q(supabase.from('crm_v_agenda').select('*').order('prioridade').order('data_ref'))
    const obraIds = itens.filter((i) => i.obra_id).map((i) => i.obra_id)
    const obras = obraIds.length ? await q(supabase.from('crm_obras').select('*').in('id', obraIds)) : []
    const porId = Object.fromEntries(obras.map((o) => [o.id, o]))
    return itens.map((i) => ({ ...i, obra: porId[i.obra_id] }))
  })

  const itens = (data || []).filter((i) => filtro === 'todos' || i.tipo === filtro)
  const conta = (t) => (data || []).filter((i) => t === 'todos' || i.tipo === t).length

  const textoWhats = (i) =>
    i.tipo === 'recompra' ? `Olá ${i.profissional_nome.split(' ')[0]}, tudo bem? Aqui é da Carvalho Pré-Moldados. Tem alguma obra chegando na laje?`
      : i.tipo === 'pos_entrega' ? 'Olá, tudo bem? Aqui é da Carvalho Pré-Moldados. A laje chegou certinho? Ficou tudo bem na obra?'
        : i.tipo === 'aniversario' && i.data_ref === hojeLocal() ? `Fala ${i.profissional_nome.split(' ')[0]}! Feliz aniversário! Muita saúde e muita obra pra você. Um abraço de todo mundo aqui da Carvalho Pré-Moldados!`
        : ''

  return (
    <>
      <div className="head">
        <div>
          <h1>Agenda de hoje</h1>
          <p className="sub">Com quem falar hoje: aniversários da semana, profissionais sem venda, pós-entregas e obras para acompanhar.</p>
        </div>
      </div>

      <div className="tabs">
        {ORDEM_FILTRO.map((t) => (
          <button key={t} className={filtro === t ? 'on' : ''} onClick={() => setFiltro(t)}>
            {t === 'todos' ? 'Tudo' : TIPO_AGENDA[t].label} ({conta(t)})
          </button>
        ))}
      </div>

      <Carregando carregando={carregando && !data} erro={erro} />
      {data && itens.length === 0 && <div className="card empty">Nada pendente aqui. 🎉</div>}
      {itens.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {itens.map((i, idx) => (
            <div className="item" key={`${i.tipo}-${i.profissional_id}-${i.obra_id}-${idx}`}>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge ${TIPO_AGENDA[i.tipo].cor}`}>{TIPO_AGENDA[i.tipo].label}</span>
                  {i.profissional_id
                    ? <Link to={`/profissionais/${i.profissional_id}`}><b>{i.profissional_nome}</b></Link>
                    : <b>{i.profissional_nome}</b>}
                </div>
                <div>{i.descricao}</div>
                <div className="muted small">
                  {formataTelefone(i.telefone)} · {i.tipo === 'aniversario' ? `dia ${dataBR(i.data_ref)}` : `desde ${dataBR(i.data_ref)}`}
                  {i.tipo === 'aniversario' && i.data_ref !== hojeLocal() && ' · separe o presente'}
                  {i.tipo === 'pos_entrega' && ' · confirme com o Dono da Obra quem é o pedreiro'}
                </div>
              </div>
              <div className="acts">
                <BotaoWhats telefone={i.telefone} texto={textoWhats(i)} />
                <button className="btn sm primary" onClick={() => setContato(i)}>Registrar contato</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {contato && (
        <ContatoModal
          profissional={contato.profissional_id ? { id: contato.profissional_id, nome: contato.profissional_nome } : null}
          obra={contato.obra}
          motivo={MOTIVO_POR_TIPO[contato.tipo]}
          onClose={() => setContato(null)}
          onDone={recarregar}
        />
      )}
    </>
  )
}

import { useEffect, useState } from 'react'
import { supabase, q } from '../supabase'
import { Modal, Erro, useEnvio } from './ui'
import Historico from './Historico'
import { CANAIS, STATUS_OBRA, PAPEL, MOTIVOS_PERDA, somaDias, soDigitos, hoje } from '../util'

const avisar = () => window.dispatchEvent(new Event('crm:atualizar'))

// ---------- Seletor de Profissional ----------
export function useProfissionaisLista() {
  const [lista, setLista] = useState([])
  useEffect(() => {
    supabase.from('crm_profissionais').select('id, nome, apelido, cidade, tipo_comissao_padrao, valor_comissao_padrao')
      .eq('ativo', true).order('nome').then(({ data }) => setLista(data || []))
  }, [])
  return lista
}

export function SelectProfissional({ value, onChange, lista, vazio = 'Selecione…' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{vazio}</option>
      {lista.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}{p.apelido ? ` (${p.apelido})` : ''}{p.cidade ? ` — ${p.cidade}` : ''}
        </option>
      ))}
    </select>
  )
}

// ---------- Registrar contato ----------
export function ContatoModal({ profissional, obra, motivo = 'avulso', onClose, onDone }) {
  const precisaProf = !profissional && obra
  const lista = useProfissionaisLista()
  const [profId, setProfId] = useState(profissional?.id || null)
  const [canal, setCanal] = useState('whatsapp')
  const [resumo, setResumo] = useState('')
  const [proxima, setProxima] = useState(somaDias(motivo === 'pos_entrega' ? 30 : 15))
  const { ocupado, erro, enviar } = useEnvio()

  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      if (obra && !obra.profissional_id && profId) {
        await q(supabase.from('crm_obras').update({ profissional_id: profId }).eq('id', obra.id))
      }
      if (profId) {
        await q(supabase.from('crm_contatos').insert({
          profissional_id: profId, obra_id: obra?.id || null, canal, motivo, resumo, proxima_data: proxima || null,
        }))
      } else if (obra) {
        // Pós-entrega sem Profissional identificado: só marca como verificado
        const campo = motivo === 'pos_entrega' ? { pos_entrega_feito: true } : { proximo_acompanhamento: proxima || somaDias(30) }
        await q(supabase.from('crm_obras').update({ ...campo, observacoes: [obra.observacoes, resumo].filter(Boolean).join('\n') }).eq('id', obra.id))
      }
      avisar(); onDone?.(); onClose()
    })
  }

  return (
    <Modal titulo={`Registrar contato${profissional ? ` — ${profissional.nome}` : ''}`} onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        {precisaProf && (
          <label>Profissional desta obra (se o Dono da Obra informou)
            <SelectProfissional value={profId} onChange={setProfId} lista={lista} vazio="Ninguém / não informado" />
            <span className="muted small" style={{ fontWeight: 400 }}>
              Se o profissional não estava no orçamento, ligue-o aqui e reveja a obra na Conciliação (profissional omitido).
            </span>
          </label>
        )}
        <div className="grid2">
          <label>Canal
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
              {Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Próximo contato
            <input type="date" value={proxima} min={hoje()} onChange={(e) => setProxima(e.target.value)} />
          </label>
        </div>
        <label>O que aconteceu
          <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} required placeholder="Ex.: tem obra nova no Jd. Paulista, laje prevista para dezembro" />
        </label>
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>Salvar contato</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------- Cadastro de Profissional ----------
export function ProfissionalModal({ inicial, onClose, onDone }) {
  const [cats, setCats] = useState([])
  const [f, setF] = useState(() => ({
    nome: '', apelido: '', telefone: '', cidade: '', categoria_id: '', tipo_comissao_padrao: 'fixa',
    valor_comissao_padrao: '', prazo_recompra_dias: '', chave_pix: '', data_nascimento: '', observacoes: '', ativo: true,
    ...(inicial || {}),
  }))
  const { ocupado, erro, enviar } = useEnvio()
  const [duplicados, setDuplicados] = useState(null)
  useEffect(() => { supabase.from('crm_categorias').select('*').order('ordem').then(({ data }) => setCats(data || [])) }, [])
  const set = (k) => (e) => { setDuplicados(null); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }) }

  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      // Item 4: avisa se já existe alguém com o mesmo telefone ou o mesmo nome
      const mudouIdentidade = !inicial?.id || soDigitos(f.telefone) !== soDigitos(inicial.telefone) || f.nome.trim() !== (inicial.nome || '').trim()
      if (!duplicados && mudouIdentidade) {
        const achados = await buscarProfissionaisParecidos(f.nome, soDigitos(f.telefone), inicial?.id)
        if (achados.length) { setDuplicados(achados); return }
      }
      const dados = {
        nome: f.nome.trim(), apelido: f.apelido || null, telefone: soDigitos(f.telefone) || null,
        cidade: f.cidade || null, categoria_id: f.categoria_id ? Number(f.categoria_id) : null,
        tipo_comissao_padrao: f.tipo_comissao_padrao,
        valor_comissao_padrao: f.valor_comissao_padrao === '' || f.valor_comissao_padrao == null ? null : Number(f.valor_comissao_padrao),
        prazo_recompra_dias: f.prazo_recompra_dias ? Number(f.prazo_recompra_dias) : null,
        chave_pix: f.chave_pix || null, data_nascimento: f.data_nascimento || null,
        observacoes: f.observacoes || null, ativo: f.ativo,
      }
      const r = inicial?.id
        ? await q(supabase.from('crm_profissionais').update(dados).eq('id', inicial.id).select().single())
        : await q(supabase.from('crm_profissionais').insert(dados).select().single())
      avisar(); onDone?.(r); onClose()
    })
  }

  return (
    <Modal titulo={inicial?.id ? 'Editar profissional' : 'Novo profissional'} onClose={onClose}>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        <div className="grid2">
          <label>Nome<input value={f.nome} onChange={set('nome')} required /></label>
          <label>Apelido<input value={f.apelido || ''} onChange={set('apelido')} placeholder="Como é conhecido" /></label>
          <label>WhatsApp / telefone<input value={f.telefone || ''} onChange={set('telefone')} inputMode="tel" placeholder="(16) 99999-9999" /></label>
          <label>Cidade<input value={f.cidade || ''} onChange={set('cidade')} /></label>
          <label>Categoria
            <select value={f.categoria_id || ''} onChange={set('categoria_id')} required>
              <option value="">Selecione…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Chave PIX<input value={f.chave_pix || ''} onChange={set('chave_pix')} /></label>
          <label>Data de nascimento<input type="date" value={f.data_nascimento || ''} onChange={set('data_nascimento')} max={new Date().toISOString().slice(0, 10)} /></label>
        </div>
        <div className="grid3">
          <label>Gratificação padrão
            <select value={f.tipo_comissao_padrao} onChange={set('tipo_comissao_padrao')}>
              <option value="fixa">Fixa (R$ por obra)</option>
              <option value="percentual">Percentual (%)</option>
            </select>
          </label>
          <label>{f.tipo_comissao_padrao === 'fixa' ? 'Valor (R$)' : 'Percentual (%)'}
            <input type="number" step="0.01" min="0" value={f.valor_comissao_padrao ?? ''} onChange={set('valor_comissao_padrao')} />
          </label>
          <label>Alerta de recompra (dias)
            <input type="number" min="1" value={f.prazo_recompra_dias || ''} onChange={set('prazo_recompra_dias')} placeholder="Padrão" />
          </label>
        </div>
        <label>Observações<textarea value={f.observacoes || ''} onChange={set('observacoes')} /></label>
        {inicial?.id && <label className="check"><input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> Ativo</label>}
        {duplicados && <AvisoDuplicado itens={duplicados.map((p) => ({ id: p.id, link: `#/profissionais/${p.id}`,
          texto: `${p.nome}${p.apelido ? ` (${p.apelido})` : ''} · ${p.motivo}` }))} />}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>{duplicados ? 'Salvar mesmo assim' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------- Cadastro de Obra ----------
export function ObraModal({ inicial, profissionalFixo, onClose, onDone }) {
  const lista = useProfissionaisLista()
  const [f, setF] = useState(() => ({
    profissional_id: profissionalFixo?.id || null, papel: 'indicador', dono_nome: '', dono_telefone: '',
    dono_documento: '', endereco: '', cidade: '', status: 'em_andamento', motivo_perda: '', previsao_laje: '',
    proximo_acompanhamento: '', data_entrega: '', tipo_comissao: '', valor_comissao_combinado: '', observacoes: '',
    ...(inicial || {}),
  }))
  const { ocupado, erro, enviar } = useEnvio()
  const [duplicados, setDuplicados] = useState(null)
  const [verHistorico, setVerHistorico] = useState(false)
  const set = (k) => (e) => { setDuplicados(null); setF({ ...f, [k]: e.target.value }) }
  const nul = (v) => (v === '' || v == null ? null : v)

  const salvar = (e) => {
    e.preventDefault()
    enviar(async () => {
      const mudouIdentidade = !inicial?.id || soDigitos(f.dono_telefone) !== soDigitos(inicial.dono_telefone) || soDigitos(f.dono_documento) !== soDigitos(inicial.dono_documento)
      if (!duplicados && mudouIdentidade) {
        const achadas = await buscarObrasParecidas(soDigitos(f.dono_telefone), soDigitos(f.dono_documento), inicial?.id)
        if (achadas.length) { setDuplicados(achadas); return }
      }
      const dados = {
        profissional_id: f.profissional_id || null, papel: f.papel,
        dono_nome: nul(f.dono_nome), dono_telefone: nul(soDigitos(f.dono_telefone)),
        dono_documento: nul(soDigitos(f.dono_documento)), endereco: nul(f.endereco), cidade: nul(f.cidade),
        status: f.status, motivo_perda: f.status === 'perdida' ? nul(f.motivo_perda) : null,
        previsao_laje: nul(f.previsao_laje), proximo_acompanhamento: nul(f.proximo_acompanhamento),
        data_entrega: f.status === 'entregue' ? nul(f.data_entrega) : nul(inicial?.data_entrega),
        tipo_comissao: nul(f.tipo_comissao),
        valor_comissao_combinado: nul(f.valor_comissao_combinado) == null ? null : Number(f.valor_comissao_combinado),
        observacoes: nul(f.observacoes),
      }
      const r = inicial?.id
        ? await q(supabase.from('crm_obras').update(dados).eq('id', inicial.id).select().single())
        : await q(supabase.from('crm_obras').insert(dados).select().single())
      avisar(); onDone?.(r); onClose()
    })
  }

  return (
    <Modal titulo={inicial?.id ? 'Editar obra' : 'Nova obra'} onClose={onClose} wide>
      <form className="stack" onSubmit={salvar}>
        <Erro msg={erro} />
        <div className="grid2">
          <label>Profissional
            {profissionalFixo
              ? <input value={profissionalFixo.nome} disabled />
              : <SelectProfissional value={f.profissional_id} onChange={(v) => setF({ ...f, profissional_id: v })} lista={lista} vazio="Sem profissional" />}
          </label>
          <label>Papel do profissional nesta obra
            <select value={f.papel} onChange={set('papel')}>
              {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Dono da Obra<input value={f.dono_nome || ''} onChange={set('dono_nome')} /></label>
          <label>Telefone do dono<input value={f.dono_telefone || ''} onChange={set('dono_telefone')} inputMode="tel" /></label>
          <label>CPF/CNPJ do dono<input value={f.dono_documento || ''} onChange={set('dono_documento')} inputMode="numeric" placeholder="Ajuda a conciliar com o app" /></label>
          <label>Cidade<input value={f.cidade || ''} onChange={set('cidade')} /></label>
        </div>
        <label>Endereço<input value={f.endereco || ''} onChange={set('endereco')} /></label>
        <div className="grid3">
          <label>Status
            <select value={f.status} onChange={set('status')}>
              {Object.entries(STATUS_OBRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {f.status === 'perdida' ? (
            <label>Motivo da perda
              <select value={f.motivo_perda || ''} onChange={set('motivo_perda')} required>
                <option value="">Selecione…</option>
                {MOTIVOS_PERDA.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          ) : f.status === 'entregue' ? (
            <label>Data de entrega<input type="date" value={f.data_entrega || ''} onChange={set('data_entrega')} /></label>
          ) : (
            <label>Previsão da laje<input type="date" value={f.previsao_laje || ''} onChange={set('previsao_laje')} /></label>
          )}
          <label>Próximo acompanhamento<input type="date" value={f.proximo_acompanhamento || ''} onChange={set('proximo_acompanhamento')} /></label>
        </div>
        {f.papel === 'indicador' && (
          <div className="grid2">
            <label>Tipo de gratificação combinada
              <select value={f.tipo_comissao || ''} onChange={set('tipo_comissao')}>
                <option value="">Padrão do profissional</option>
                <option value="fixa">Fixa (R$ por obra)</option>
                <option value="percentual">Percentual</option>
              </select>
            </label>
            <label>Valor fixo combinado (R$)
              <input type="number" step="0.01" min="0" value={f.valor_comissao_combinado ?? ''} onChange={set('valor_comissao_combinado')}
                placeholder="Para checar com o orçamento" disabled={f.tipo_comissao === 'percentual'} />
            </label>
          </div>
        )}
        <label>Observações<textarea value={f.observacoes || ''} onChange={set('observacoes')} /></label>
        {duplicados && <AvisoDuplicado itens={duplicados.map((o) => ({ id: o.id,
          texto: `${o.dono_nome || 'Sem dono'} — ${o.endereco || o.cidade || 'sem endereço'} · ${o.profissional?.nome || 'sem profissional'} (${STATUS_OBRA[o.status]})` }))} />}
        {inicial?.id && (
          <div>
            <button type="button" className="btn sm ghost" onClick={() => setVerHistorico(!verHistorico)}>
              {verHistorico ? '▾' : '▸'} Histórico de alterações
            </button>
            {verHistorico && <div style={{ marginTop: 10 }}><Historico obraId={inicial.id} /></div>}
          </div>
        )}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>{duplicados ? 'Salvar mesmo assim' : 'Salvar obra'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------- Duplicados (item 4) ----------
export async function buscarProfissionaisParecidos(nome, telefone, ignorarId) {
  const filtros = []
  if (telefone && telefone.length >= 10) filtros.push(`telefone.eq.${telefone}`)
  if (nome && nome.trim().length >= 3) filtros.push(`nome.ilike.${nome.trim().replace(/[,()]/g, ' ')}`)
  if (!filtros.length) return []
  const lista = await q(supabase.from('crm_profissionais').select('id, nome, apelido, telefone').or(filtros.join(',')).limit(5))
  return lista.filter((p) => p.id !== ignorarId).map((p) => ({
    ...p, motivo: telefone && p.telefone === telefone ? 'mesmo telefone' : 'mesmo nome',
  }))
}

export async function buscarObrasParecidas(telefone, documento, ignorarId) {
  const filtros = []
  if (telefone && telefone.length >= 10) filtros.push(`dono_telefone.eq.${telefone}`)
  if (documento && documento.length >= 11) filtros.push(`dono_documento.eq.${documento}`)
  if (!filtros.length) return []
  const lista = await q(supabase.from('crm_obras').select('id, dono_nome, endereco, cidade, status, profissional:crm_profissionais(nome)')
    .or(filtros.join(',')).neq('status', 'perdida').limit(5))
  return lista.filter((o) => o.id !== ignorarId)
}

export function AvisoDuplicado({ itens }) {
  return (
    <div className="alert warn">
      <b>Pode ser duplicado.</b> Já existe no CRM:
      <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
        {itens.map((i) => <li key={i.id}>{i.link ? <a href={i.link}>{i.texto}</a> : i.texto}</li>)}
      </ul>
      Confira antes de salvar. Se for outra pessoa/obra, clique em “Salvar mesmo assim”.
    </div>
  )
}

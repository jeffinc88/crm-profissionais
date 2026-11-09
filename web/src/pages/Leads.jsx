import { useState } from 'react'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, BotaoWhats } from '../components/ui'
import { dataBR, formataTelefone } from '../util'
import { useSessao } from '../App'

// Contatos que chegam pela calculadora de laje do site
export const STATUS_LEAD = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  orcado: 'Orçado',
  virou_pedido: 'Virou pedido',
  perdido: 'Perdido',
}
const COR = { novo: 'warn', em_atendimento: 'info', orcado: 'info', virou_pedido: 'ok', perdido: 'bad' }
const FILTROS = ['abertos', 'novo', 'em_atendimento', 'orcado', 'virou_pedido', 'perdido', 'todos']
const ABERTOS = ['novo', 'em_atendimento', 'orcado']
const avisar = () => window.dispatchEvent(new Event('crm:atualizar'))

export const LINK_CALC_VENDEDOR = 'https://carvalholajes.com.br/calculadora/?interno=cv7k2m'

export default function Leads() {
  const [filtro, setFiltro] = useState('abertos')
  const [aberto, setAberto] = useState(null)
  const { gerencial, vendedor } = useSessao()
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const [leads, ops] = await Promise.all([
      q(supabase.from('crm_leads_site').select('*').order('recebido_em', { ascending: false }).limit(500)),
      q(supabase.from('crm_operadores').select('user_id, nome, ativo').order('nome')),
    ])
    return { leads, ops }
  })

  const leads = data?.leads || []
  const ops = data?.ops || []
  const passa = (l, f) => f === 'todos' || (f === 'abertos' ? ABERTOS.includes(l.status) : l.status === f)
  const lista = leads.filter((l) => passa(l, filtro))

  const salvar = async (l, campos) => {
    await q(supabase.from('crm_leads_site').update(campos).eq('id', l.id))
    avisar(); recarregar()
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>{vendedor ? 'Meus leads do site' : 'Leads do site'}</h1>
          <p className="sub">{vendedor
            ? 'Contatos da calculadora de laje que a gerência passou para você.'
            : 'Quem informou nome e WhatsApp na calculadora de laje. Escolha o vendedor responsável e acompanhe.'}</p>
        </div>
        <a className="btn" href={LINK_CALC_VENDEDOR} target="_blank" rel="noreferrer">Abrir calculadora (modo vendedor)</a>
      </div>

      <div className="tabs">
        {FILTROS.map((f) => (
          <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>
            {f === 'abertos' ? 'Abertos' : f === 'todos' ? 'Todos' : STATUS_LEAD[f]} ({leads.filter((l) => passa(l, f)).length})
          </button>
        ))}
      </div>

      <Carregando carregando={carregando && !data} erro={erro} />
      {data && !lista.length && <div className="empty">Nenhum contato aqui.</div>}


      <div className="stack">
        {lista.map((l) => (
          <div key={l.id} className="card stack">
            <div className="row between">
              <div>
                <strong>{l.nome}</strong> <span className={`badge ${COR[l.status]}`}>{STATUS_LEAD[l.status]}</span>
                {l.chamou_whatsapp && <span className="badge ok" style={{ marginLeft: 6 }}>Chamou no WhatsApp</span>}
                <div className="muted" style={{ fontSize: '.85rem', marginTop: 4 }}>
                  {formataTelefone(l.telefone)} · {l.cidade || 'cidade não informada'}
                  {l.area_m2 ? ` · ${Number(l.area_m2).toLocaleString('pt-BR')} m²` : ''}
                  {l.previsao ? ` · ${l.previsao}` : ''} · {dataBR(l.recebido_em)}
                  {l.simulacoes > 1 ? ` · ${l.simulacoes} simulações` : ''}
                </div>
              </div>
              <BotaoWhats telefone={l.telefone} texto={`Olá, ${l.nome.split(' ')[0]}! Aqui é da Carvalho Pré-Moldados. Vi a simulação da sua laje no nosso site e já posso te passar o orçamento.`} />
            </div>
            <div className="grid2">
              <label>Vendedor responsável
                <select value={l.responsavel_id || ''} disabled={!gerencial}
                  title={gerencial ? '' : 'Só a gerência designa o vendedor'}
                  onChange={(e) => { const v = e.target.value || null; salvar(l, { responsavel_id: v, ...(v && l.status === 'novo' ? { status: 'em_atendimento' } : {}) }) }}>
                  <option value="">{gerencial ? 'Escolher…' : 'Ainda não designado'}</option>
                  {ops.filter((o) => o.ativo || o.user_id === l.responsavel_id).map((o) => <option key={o.user_id} value={o.user_id}>{o.nome}</option>)}
                </select>
              </label>
              <label>Situação
                <select value={l.status} onChange={(e) => salvar(l, { status: e.target.value })}>
                  {Object.entries(STATUS_LEAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <label>Observação
              <input defaultValue={l.observacao || ''} placeholder="Ex.: pediu para ligar depois das 18h"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.observacao || '')) salvar(l, { observacao: v || null }) }} />
            </label>
            {l.resumo && (
              <div>
                <button className="btn ghost sm" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                  {aberto === l.id ? 'Esconder simulação' : 'Ver simulação'}
                </button>
                {aberto === l.id && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.82rem', margin: '8px 0 0' }}>{l.resumo}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

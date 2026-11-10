import { useEffect, useState } from 'react'
import { supabase, q } from '../supabase'
import { PERFIS } from '../App'
import { useCarregar, Carregando, Erro, useEnvio } from '../components/ui'

export default function Config() {
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const [cfg, ops, cats] = await Promise.all([
      q(supabase.from('crm_config').select('*').eq('id', 1).single()),
      q(supabase.from('crm_operadores').select('*').order('nome')),
      q(supabase.from('crm_categorias').select('*').order('ordem')),
    ])
    return { cfg, ops, cats }
  })
  const [f, setF] = useState(null)
  const [novaCat, setNovaCat] = useState('')
  const [ok, setOk] = useState(false)
  const { ocupado, erro: erroSalvar, enviar } = useEnvio()
  useEffect(() => { if (data) setF(data.cfg) }, [data])

  if (!data || !f) return <Carregando carregando={carregando} erro={erro} />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const salvar = (e) => {
    e.preventDefault()
    setOk(false)
    enviar(async () => {
      await q(supabase.from('crm_config').update({
        prazo_recompra_dias: Number(f.prazo_recompra_dias), dias_pos_entrega: Number(f.dias_pos_entrega),
        dias_carteira_parada: Number(f.dias_carteira_parada || 90),
        comissao_profissional_obra: f.comissao_profissional_obra, percentual_padrao: Number(f.percentual_padrao),
      }).eq('id', 1))
      setOk(true); recarregar()
    })
  }
  const addCat = () => enviar(async () => {
    if (!novaCat.trim()) return
    await q(supabase.from('crm_categorias').insert({ nome: novaCat.trim(), ordem: 50 }))
    setNovaCat(''); recarregar()
  })

  return (
    <>
      <div className="head"><div><h1>Configurações</h1><p className="sub">Regras do CRM. Só o perfil Gerencial vê esta tela.</p></div></div>
      <Erro msg={erroSalvar} />
      <form className="card stack" onSubmit={salvar} style={{ marginBottom: 16 }}>
        <h2>Regras</h2>
        <div className="grid3">
          <label>Alerta de recompra (dias sem venda)<input type="number" min="1" value={f.prazo_recompra_dias} onChange={set('prazo_recompra_dias')} /></label>
          <label>Pós-entrega (dias após a entrega)<input type="number" min="0" value={f.dias_pos_entrega} onChange={set('dias_pos_entrega')} /></label>
          <label>Carteira parada (dias sem contato)<input type="number" min="1" value={f.dias_carteira_parada ?? 90} onChange={set('dias_carteira_parada')} /></label>
          <label>Percentual padrão de gratificação (%)<input type="number" step="0.01" min="0" value={f.percentual_padrao} onChange={set('percentual_padrao')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.comissao_profissional_obra} onChange={set('comissao_profissional_obra')} />
          Pagar gratificação também ao Profissional da Obra (quando ele não indicou)</label>
        <div className="row"><button className="btn primary" disabled={ocupado}>Salvar regras</button>{ok && <span className="badge ok">Salvo</span>}</div>
      </form>

      <div className="grid2">
        <div className="card">
          <h2>Categorias</h2>
          <div className="row" style={{ gap: 6, marginBottom: 12 }}>{data.cats.map((c) => <span key={c.id} className="badge">{c.nome}</span>)}</div>
          <div className="row"><input style={{ flex: 1 }} value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nova categoria" />
            <button className="btn" type="button" onClick={addCat}>Adicionar</button></div>
        </div>
        <div className="card">
          <h2>Operadores</h2>
          {data.ops.map((o) => <OperadorLinha key={o.user_id} o={o} base={baseLink(f)} onDone={recarregar} />)}
          <p className="muted small">Marque “Entrega cartão de visita” para o vendedor aparecer na pergunta “Quem te entregou o cartão?” da página de indicação. Os cartões já impressos continuam valendo.</p>
          <p className="muted small">Para incluir alguém: crie o usuário em Supabase › Authentication e rode o comando de “Adicionar operador” do LEIA-ME.</p>
        </div>
      </div>
    </>
  )
}

const baseLink = (cfg) => ((cfg.link_publico || '').trim().replace(/\/+$/, '') || (window.location.origin + window.location.pathname.replace(/\/+$/, '')))

// Linha do operador: código do cartão de visita e se aparece na pergunta "Quem te entregou o cartão?"
function OperadorLinha({ o, base, onDone }) {
  const [codigo, setCodigo] = useState(o.codigo || '')
  const [noCartao, setNoCartao] = useState(!!o.no_cartao)
  const [copiado, setCopiado] = useState(false)
  const { ocupado, erro, enviar } = useEnvio()
  const limpo = codigo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const mudou = limpo !== (o.codigo || '') || noCartao !== !!o.no_cartao
  const link = limpo ? `${base}/#/indicar?v=${limpo}` : ''
  const salvar = () => enviar(async () => {
    if (noCartao && !limpo) throw new Error('Defina um código para quem aparece no cartão.')
    await q(supabase.from('crm_operadores').update({ codigo: limpo || null, no_cartao: noCartao }).eq('user_id', o.user_id))
    onDone()
  })
  const copiar = async () => { try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch {} }
  return (
    <div className="op-linha">
      <div className="row between small">
        <b>{o.nome}</b>
        <span className={`badge ${o.perfil === 'gerencial' ? 'info' : ''}`}>{PERFIS[o.perfil] || o.perfil}{!o.ativo && ' · inativo'}</span>
      </div>
      <div className="row small" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <label className="check"><input type="checkbox" checked={noCartao} onChange={(e) => setNoCartao(e.target.checked)} /> Entrega cartão de visita</label>
        <input style={{ width: 120 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="código" aria-label="Código do cartão" />
        {mudou && <button className="btn" type="button" disabled={ocupado} onClick={salvar}>Salvar</button>}
      </div>
      {link && noCartao && !mudou && (
        <div className="small muted" style={{ marginTop: 4 }}>
          Link para os próximos cartões dele: <code>{link.replace(/^https?:\/\//, '')}</code>{' '}
          <button className="btn small-btn" type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
        </div>
      )}
      {erro && <div className="alert bad small" style={{ marginTop: 4 }}>{erro}</div>}
    </div>
  )
}

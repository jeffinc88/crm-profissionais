import { useEffect, useState } from 'react'
import { supabase, q } from '../supabase'
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
          <label>Percentual padrão de comissão (%)<input type="number" step="0.01" min="0" value={f.percentual_padrao} onChange={set('percentual_padrao')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.comissao_profissional_obra} onChange={set('comissao_profissional_obra')} />
          Pagar comissão também ao Profissional da Obra (quando ele não indicou)</label>
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
          {data.ops.map((o) => (
            <div key={o.user_id} className="row between small" style={{ padding: '4px 0' }}>
              <span>{o.nome}</span>
              <span className={`badge ${o.perfil === 'gerencial' ? 'info' : ''}`}>{o.perfil === 'gerencial' ? 'Gerencial' : 'Operacional'}{!o.ativo && ' · inativo'}</span>
            </div>
          ))}
          <p className="muted small">Para incluir alguém: crie o usuário em Supabase › Authentication e rode o comando de “Adicionar operador” do LEIA-ME.</p>
        </div>
      </div>
    </>
  )
}

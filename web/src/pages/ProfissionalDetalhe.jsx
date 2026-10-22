import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, q } from '../supabase'
import { useCarregar, Carregando, BotaoWhats } from '../components/ui'
import { ContatoModal, ProfissionalModal, ObraModal } from '../components/forms'
import { brl, dataBR, formataTelefone, PAPEL, CANAIS } from '../util'
import { CorStatusObra, CorStatusComissao } from './Obras'

export default function ProfissionalDetalhe() {
  const { id } = useParams()
  const [aba, setAba] = useState('obras')
  const [modal, setModal] = useState(null)
  const { data, erro, carregando, recarregar } = useCarregar(async () => {
    const [p, obras, contatos, comissoes] = await Promise.all([
      q(supabase.from('crm_v_profissionais').select('*').eq('id', id).single()),
      q(supabase.from('crm_obras').select('*').eq('profissional_id', id).order('created_at', { ascending: false })),
      q(supabase.from('crm_contatos').select('*').eq('profissional_id', id).order('data', { ascending: false }).limit(100)),
      q(supabase.from('crm_comissoes').select('*, obra:crm_obras(dono_nome, endereco)').eq('profissional_id', id).order('created_at', { ascending: false })),
    ])
    return { p, obras, contatos, comissoes }
  }, [id])

  if (!data) return <Carregando carregando={carregando} erro={erro} />
  const { p, obras, contatos, comissoes } = data

  return (
    <>
      <div className="muted small" style={{ marginBottom: 6 }}><Link to="/profissionais">← Profissionais</Link></div>
      <div className="head">
        <div>
          <h1>{p.nome}{p.apelido && <span className="muted" style={{ fontWeight: 400 }}> ({p.apelido})</span>}</h1>
          <div className="row small muted" style={{ gap: 8 }}>
            <span className="badge info">{p.categoria || 'Sem categoria'}</span>
            <span>{p.cidade || '—'}</span>·<span className="num">{formataTelefone(p.telefone)}</span>
            {!p.ativo && <span className="badge">Inativo</span>}
          </div>
        </div>
        <div className="row">
          <BotaoWhats telefone={p.telefone} sm={false} />
          <button className="btn" onClick={() => setModal('contato')}>Registrar contato</button>
          <button className="btn" onClick={() => setModal('editar')}>Editar</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{p.vendas_total}</b><span>Vendas originadas</span></div>
        <div className="kpi"><b>{p.ultima_venda ? `${p.dias_sem_venda} d` : '—'}</b><span>Desde a última venda (alerta em {p.prazo_efetivo} d)</span></div>
        <div className="kpi"><b>{brl(p.comissao_a_pagar)}</b><span>Comissão a pagar</span></div>
        <div className="kpi"><b>{brl(p.comissao_aguardando)}</b><span>Aguardando o cliente quitar</span></div>
      </div>

      <div className="card small" style={{ marginBottom: 16 }}>
        <div className="grid3">
          <div><span className="muted">Comissão padrão</span><br />
            {p.tipo_comissao_padrao === 'fixa' ? `Fixa · ${brl(p.valor_comissao_padrao)} por obra` : `Percentual · ${p.valor_comissao_padrao ?? '—'}%`}</div>
          <div><span className="muted">Chave PIX</span><br />{p.chave_pix || '—'}</div>
          <div><span className="muted">Próximo contato</span><br />{dataBR(p.proximo_contato)}</div>
        </div>
        {p.observacoes && <p style={{ marginBottom: 0 }}>{p.observacoes}</p>}
      </div>

      <div className="tabs">
        <button className={aba === 'obras' ? 'on' : ''} onClick={() => setAba('obras')}>Obras ({obras.length})</button>
        <button className={aba === 'contatos' ? 'on' : ''} onClick={() => setAba('contatos')}>Contatos ({contatos.length})</button>
        <button className={aba === 'comissoes' ? 'on' : ''} onClick={() => setAba('comissoes')}>Extrato de comissões ({comissoes.length})</button>
      </div>

      {aba === 'obras' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}><button className="btn primary sm" onClick={() => setModal('obra')}>+ Nova obra</button></div>
          {obras.length === 0 ? <div className="card empty">Nenhuma obra ligada a este profissional.</div> : (
            <div className="card" style={{ padding: 0 }}>
              {obras.map((o) => (
                <div className="item" key={o.id}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <CorStatusObra s={o.status} /><span className="badge">{PAPEL[o.papel]}</span>
                      <b>{o.dono_nome || 'Dono não informado'}</b>
                    </div>
                    <div className="muted small">{[o.endereco, o.cidade].filter(Boolean).join(' — ') || 'Sem endereço'}
                      {o.previsao_laje && ` · laje prevista ${dataBR(o.previsao_laje)}`}
                      {o.status === 'perdida' && ` · perdida: ${o.motivo_perda}`}
                      {o.valor_produtos && ` · ${brl(o.valor_produtos)}`}
                    </div>
                  </div>
                  <div className="acts"><button className="btn sm" onClick={() => setModal({ obra: o })}>Editar</button></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'contatos' && (
        contatos.length === 0 ? <div className="card empty">Nenhum contato registrado.</div> : (
          <div className="card" style={{ padding: 0 }}>
            {contatos.map((c) => (
              <div className="item" key={c.id}>
                <div>
                  <div className="muted small">{new Date(c.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {CANAIS[c.canal]}{c.motivo && c.motivo !== 'avulso' ? ` · ${c.motivo.replace('_', ' ')}` : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{c.resumo}</div>
                </div>
                {c.proxima_data && <div className="muted small">próximo: {dataBR(c.proxima_data)}</div>}
              </div>
            ))}
          </div>
        )
      )}

      {aba === 'comissoes' && (
        comissoes.length === 0 ? <div className="card empty">Nenhuma comissão ainda.</div> : (
          <div className="card tablewrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Obra</th><th>Tipo</th><th>Valor</th><th>Status</th><th className="hide-m">Pago em</th></tr></thead>
              <tbody>
                {comissoes.map((k) => (
                  <tr key={k.id}>
                    <td>{k.obra?.dono_nome || '—'}<div className="muted small">{k.obra?.endereco}</div></td>
                    <td>{k.tipo === 'fixa' ? 'Fixa' : `${k.percentual}%`}</td>
                    <td className="num"><b>{brl(k.valor)}</b></td>
                    <td><CorStatusComissao s={k.status} /></td>
                    <td className="hide-m">{dataBR(k.pago_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modal === 'contato' && <ContatoModal profissional={p} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal === 'editar' && <ProfissionalModal inicial={p} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal === 'obra' && <ObraModal profissionalFixo={p} inicial={{ tipo_comissao: p.tipo_comissao_padrao, valor_comissao_combinado: p.tipo_comissao_padrao === 'fixa' ? p.valor_comissao_padrao : '' }} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.obra && <ObraModal inicial={modal.obra} onClose={() => setModal(null)} onDone={recarregar} />}
    </>
  )
}

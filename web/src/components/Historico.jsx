import { supabase, q } from '../supabase'
import { useCarregar, Carregando } from './ui'
import { brl, dataBR, formataTelefone, STATUS_OBRA, PAPEL, STATUS_COMISSAO } from '../util'

const CAMPOS = {
  profissional_id: 'Profissional', papel: 'Papel', status: 'Status', motivo_perda: 'Motivo da perda',
  dono_nome: 'Dono da obra', dono_telefone: 'Telefone do dono', dono_documento: 'CPF/CNPJ do dono',
  endereco: 'Endereço', cidade: 'Cidade', previsao_laje: 'Previsão da laje', data_fechamento: 'Data de fechamento',
  data_entrega: 'Data de entrega', tipo_comissao: 'Tipo de gratificação', valor_comissao_combinado: 'Gratificação combinada',
  valor_produtos: 'Valor dos produtos', nome: 'Nome', apelido: 'Apelido', telefone: 'Telefone',
  categoria_id: 'Categoria', tipo_comissao_padrao: 'Gratificação padrão', valor_comissao_padrao: 'Valor da gratificação padrão',
  prazo_recompra_dias: 'Prazo de recompra', chave_pix: 'Chave PIX', ativo: 'Ativo', tipo: 'Tipo',
  percentual: 'Percentual', valor: 'Valor', cliente_quitou_em: 'Cliente quitou em', pago_em: 'Pago em',
  comprovante_path: 'Comprovante',
}
const DINHEIRO = ['valor_comissao_combinado', 'valor_produtos', 'valor']
const DATAS = ['previsao_laje', 'data_fechamento', 'data_entrega', 'cliente_quitou_em', 'pago_em']
const TABELA = { obra: 'Obra', profissional: 'Cadastro', comissao: 'Gratificação' }

function formata(campo, v, ctx) {
  if (v == null || v === '') return '—'
  if (DINHEIRO.includes(campo)) return brl(v)
  if (DATAS.includes(campo)) return dataBR(v)
  if (campo === 'status') return STATUS_OBRA[v] || STATUS_COMISSAO[v] || v
  if (campo === 'papel') return PAPEL[v] || v
  if (campo === 'profissional_id') return ctx.profs[v] || 'outro profissional'
  if (campo === 'categoria_id') return ctx.cats[v] || v
  if (campo === 'telefone' || campo === 'dono_telefone') return formataTelefone(v)
  if (campo === 'percentual') return `${v}%`
  if (campo === 'ativo') return v ? 'sim' : 'não'
  if (campo === 'comprovante_path') return 'anexado'
  if (campo === 'tipo' || campo === 'tipo_comissao' || campo === 'tipo_comissao_padrao') return v === 'fixa' ? 'Fixa' : 'Percentual'
  return String(v)
}

// Linha do tempo das alterações de uma obra ou de um profissional
export default function Historico({ obraId, profissionalId }) {
  const { data, erro, carregando } = useCarregar(async () => {
    let consulta = supabase.from('crm_historico').select('*').order('data', { ascending: false }).limit(200)
    consulta = obraId ? consulta.eq('obra_id', obraId) : consulta.eq('profissional_id', profissionalId)
    const [itens, profs, cats] = await Promise.all([
      q(consulta),
      q(supabase.from('crm_profissionais').select('id, nome')),
      q(supabase.from('crm_categorias').select('id, nome')),
    ])
    return {
      itens,
      ctx: {
        profs: Object.fromEntries(profs.map((p) => [p.id, p.nome])),
        cats: Object.fromEntries(cats.map((c) => [c.id, c.nome])),
      },
    }
  }, [obraId, profissionalId])

  if (!data) return <Carregando carregando={carregando} erro={erro} />
  if (data.itens.length === 0) return <div className="empty">Nenhuma alteração registrada ainda.</div>

  return (
    <ul className="timeline">
      {data.itens.map((h) => (
        <li key={h.id}>
          <div className="quando">
            {new Date(h.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {h.usuario_nome || 'Usuário'}
            {!obraId && <> · {TABELA[h.tabela]}</>}
          </div>
          <div className="mud">
            {h.acao === 'criou' && <b>Criou {TABELA[h.tabela].toLowerCase()}</b>}
            {h.acao === 'excluiu' && <b>Excluiu {TABELA[h.tabela].toLowerCase()}</b>}
            {h.acao === 'alterou' && Object.entries(h.mudancas).map(([campo, [antes, depois]]) => (
              <div key={campo}>
                {CAMPOS[campo] || campo}: <span className="muted">{formata(campo, antes, data.ctx)}</span> → <b>{formata(campo, depois, data.ctx)}</b>
              </div>
            ))}
            {h.acao === 'criou' && h.tabela === 'obra' && h.mudancas.dono_nome && <div className="muted small">{formata('dono_nome', h.mudancas.dono_nome[1], data.ctx)}</div>}
            {h.acao === 'excluiu' && (h.mudancas.dono_nome || h.mudancas.nome) && <div className="muted small">{String(h.mudancas.dono_nome || h.mudancas.nome)}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

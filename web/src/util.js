export const brl = (v) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const dataBR = (d) => {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [y, m, dd] = s.split('-')
  return `${dd}/${m}/${y}`
}

export const hoje = () => new Date().toISOString().slice(0, 10)

export const somaDias = (n, base = new Date()) => {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const diaMes = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')

export const soDigitos = (s) => (s || '').replace(/\D/g, '')

export const formataTelefone = (t) => {
  const d = soDigitos(t)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || '—'
}

// Link do WhatsApp (ADR: sem API, abre a conversa no número da fábrica)
export const linkWhats = (tel, texto = '') => {
  let d = soDigitos(tel)
  if (!d) return null
  if (!d.startsWith('55')) d = '55' + d
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

export const STATUS_OBRA = {
  em_andamento: 'Em andamento',
  orcada: 'Orçada',
  fechada: 'Fechada',
  perdida: 'Perdida',
  entregue: 'Entregue',
}

export const PAPEL = {
  indicador: 'Indicador',
  comprador: 'Comprador',
  profissional_da_obra: 'Profissional da Obra',
}

export const STATUS_COMISSAO = {
  aguardando_recebimento: 'Aguardando recebimento',
  a_pagar: 'A pagar',
  paga: 'Paga',
  cancelada: 'Cancelada',
}

export const TIPO_AGENDA = {
  recompra: { label: 'Recompra', cor: 'warn' },
  agendado: { label: 'Agendado', cor: 'info' },
  pos_entrega: { label: 'Pós-entrega', cor: 'ok' },
  obra_sem_laje: { label: 'Obra sem laje', cor: 'muted' },
  aniversario: { label: 'Aniversário', cor: 'bad' },
}

export const MOTIVO_POR_TIPO = {
  recompra: 'recompra',
  agendado: 'agendado',
  pos_entrega: 'pos_entrega',
  obra_sem_laje: 'acompanhamento',
  aniversario: 'avulso',
}

export const CANAIS = { whatsapp: 'WhatsApp', ligacao: 'Ligação', visita: 'Visita', outro: 'Outro' }

export const MOTIVOS_PERDA = ['Preço', 'Concorrente', 'Desistiu da obra', 'Prazo de entrega', 'Sem retorno', 'Outro']

// WhatsApp da fábrica (mesmo número do telefone fixo)
export const WHATS_FABRICA = '16992914461'

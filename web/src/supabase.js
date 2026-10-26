import { createClient } from '@supabase/supabase-js'

// Limpa espaços/quebras de linha que vêm de copiar e colar nos segredos do GitHub
const limpa = (v) => (v || '').trim().replace(/^['"]|['"]$/g, '')

const urlOriginal = limpa(import.meta.env.VITE_SUPABASE_URL)
let url = urlOriginal
const key = limpa(import.meta.env.VITE_SUPABASE_ANON_KEY)

// Aceita "xxxx.supabase.co" sem https e remove barra no final
if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url
url = url.replace(/\/+$/, '')

// Mostra o começo do valor recebido, para diagnosticar sem expor a chave inteira
const amostra = (v) => (v ? `"${v.slice(0, 40)}${v.length > 40 ? '…' : ''}" (${v.length} caracteres)` : '(vazio)')

function urlValida(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') || x.hostname === 'localhost' } catch { return false }
}

let cliente = null
let erro = ''
if (!url || !key) {
  erro = `Faltam os segredos do Supabase. URL recebida: ${amostra(url)} · chave recebida: ${key ? 'sim' : '(vazia)'}.`
} else if (!urlValida(url)) {
  erro = `O segredo VITE_SUPABASE_URL não parece um endereço do Supabase. Valor recebido: ${amostra(urlOriginal)}. O correto é https://<id-do-projeto>.supabase.co`
} else if (/^https?:\/\//i.test(key) || key.includes('supabase.co')) {
  erro = 'O segredo VITE_SUPABASE_ANON_KEY contém um endereço, não uma chave. Os dois segredos parecem estar trocados.'
} else if (key.startsWith('sb_secret_')) {
  erro = 'Foi usada a Secret key no site. Use a Publishable key (sb_publishable_…) ou a anon public.'
} else {
  try {
    cliente = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  } catch (e) {
    erro = `Não foi possível iniciar o Supabase (${e.message}). URL recebida: ${amostra(url)}.`
  }
}

export const configurado = Boolean(cliente)
export const erroConfig = erro
export const supabase = cliente

// Executa uma consulta e lança erro legível em português
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(traduzErro(error.message))
  return data
}

function traduzErro(msg = '') {
  if (msg.includes('row-level security')) return 'Você não tem permissão para esta ação.'
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('Invalid API key')) return 'Chave do Supabase inválida: confira o segredo VITE_SUPABASE_ANON_KEY.'
  if (msg.includes('crm_obras_motivo_perda_chk')) return 'Informe o motivo da perda.'
  return msg
}

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && key)

export const supabase = configurado
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Executa uma consulta e lança erro legível em português
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(traduzErro(error.message))
  return data
}

function traduzErro(msg = '') {
  if (msg.includes('row-level security')) return 'Você não tem permissão para esta ação.'
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('crm_obras_motivo_perda_chk')) return 'Informe o motivo da perda.'
  return msg
}

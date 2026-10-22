import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase, configurado, q } from './supabase'
import { Erro } from './components/ui'
import Agenda from './pages/Agenda'
import Profissionais from './pages/Profissionais'
import ProfissionalDetalhe from './pages/ProfissionalDetalhe'
import Obras from './pages/Obras'
import Conciliacao from './pages/Conciliacao'
import Comissoes from './pages/Comissoes'
import Config from './pages/Config'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

export default function App() {
  const [sessao, setSessao] = useState(undefined)
  const [operador, setOperador] = useState(undefined)

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao) { setOperador(sessao === null ? null : undefined); return }
    supabase.from('crm_operadores').select('*').eq('user_id', sessao.user.id).maybeSingle()
      .then(({ data }) => setOperador(data && data.ativo ? data : null))
  }, [sessao])

  if (!configurado) return <SemConfig />
  if (sessao === undefined) return <div className="empty">Carregando…</div>
  if (!sessao) return <Login />
  if (operador === undefined) return <div className="empty">Carregando…</div>
  if (!operador) return <SemAcesso email={sessao.user.email} />

  return (
    <Ctx.Provider value={{ operador, gerencial: operador.perfil === 'gerencial' }}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </Ctx.Provider>
  )
}

function Shell() {
  const { operador, gerencial } = useSessao()
  const [contagem, setContagem] = useState({ agenda: 0, fila: 0 })

  const atualizar = useCallback(async () => {
    const [a, f] = await Promise.all([
      supabase.from('crm_v_agenda').select('tipo', { count: 'exact', head: true }),
      supabase.from('crm_v_fila_conciliacao').select('id', { count: 'exact', head: true }),
    ])
    setContagem({ agenda: a.count || 0, fila: f.count || 0 })
  }, [])

  useEffect(() => {
    atualizar()
    const t = setInterval(atualizar, 60000)
    window.addEventListener('crm:atualizar', atualizar)
    return () => { clearInterval(t); window.removeEventListener('crm:atualizar', atualizar) }
  }, [atualizar])

  const links = [
    { to: '/agenda', label: 'Agenda', ico: '📅', n: contagem.agenda },
    { to: '/profissionais', label: 'Profissionais', ico: '👷' },
    { to: '/obras', label: 'Obras', ico: '🏗️' },
    { to: '/conciliacao', label: 'Conciliação', ico: '🔗', n: contagem.fila },
    { to: '/comissoes', label: 'Comissões', ico: '💰' },
  ]

  return (
    <div className="shell">
      <nav className="side">
        <div className="logo">
          <img src="./icon.svg" width="30" height="30" alt="" />
          <div>CRM Profissionais<small>Carvalho Pré-Moldados</small></div>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to}>
            <span>{l.label}</span>
            {l.n > 0 && <span className="count">{l.n}</span>}
          </NavLink>
        ))}
        {gerencial && <NavLink to="/config"><span>Configurações</span></NavLink>}
        <div className="grow" />
        <div className="me">{operador.nome} · {operador.perfil === 'gerencial' ? 'Gerencial' : 'Operacional'}</div>
        <a href="#/" onClick={(e) => { e.preventDefault(); supabase.auth.signOut() }}><span>Sair</span></a>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/agenda" replace />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/profissionais" element={<Profissionais />} />
          <Route path="/profissionais/:id" element={<ProfissionalDetalhe />} />
          <Route path="/obras" element={<Obras />} />
          <Route path="/conciliacao" element={<Conciliacao />} />
          <Route path="/comissoes" element={<Comissoes />} />
          <Route path="/config" element={gerencial ? <Config /> : <Navigate to="/agenda" />} />
          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Routes>
      </main>

      <nav className="bottomnav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to}>
            <span className="ico">{l.ico}</span>{l.label}
            {l.n > 0 && <span className="count">{l.n}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const entrar = async (e) => {
    e.preventDefault()
    setOcupado(true); setErro('')
    try {
      await q(supabase.auth.signInWithPassword({ email, password: senha }))
    } catch (err) { setErro(err.message) } finally { setOcupado(false) }
  }
  return (
    <div className="login">
      <form className="card stack" onSubmit={entrar}>
        <div className="row"><img src="./icon.svg" width="36" height="36" alt="" />
          <div><h1 style={{ margin: 0 }}>CRM Profissionais</h1><div className="muted small">Carvalho Pré-Moldados</div></div>
        </div>
        <Erro msg={erro} />
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" /></label>
        <button className="btn primary" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function SemAcesso({ email }) {
  return (
    <div className="login"><div className="card stack">
      <h1>Acesso não liberado</h1>
      <p className="muted">O usuário <b>{email}</b> entrou, mas não está cadastrado como operador do CRM. Peça ao perfil Gerencial para liberar o acesso.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
    </div></div>
  )
}

function SemConfig() {
  return (
    <div className="login"><div className="card stack">
      <h1>Falta configurar o Supabase</h1>
      <p className="muted">Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> ou segredos do GitHub) e gere o site de novo.</p>
    </div></div>
  )
}

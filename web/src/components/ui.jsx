import { useEffect, useState, useCallback } from 'react'
import { linkWhats } from '../util'

export function Modal({ titulo, onClose, children, wide }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={titulo}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Erro({ msg }) {
  if (!msg) return null
  return <div className="alert bad" style={{ marginBottom: 12 }}>{msg}</div>
}

export function BotaoWhats({ telefone, texto, sm = true }) {
  const href = linkWhats(telefone, texto)
  if (!href) return null
  return (
    <a className={`btn whats ${sm ? 'sm' : ''}`} href={href} target="_blank" rel="noreferrer">
      WhatsApp
    </a>
  )
}

// Hook simples para carregar dados com recarregamento
export function useCarregar(fn, deps = []) {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setData(await fn())
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { recarregar() }, [recarregar])
  return { data, erro, carregando, recarregar }
}

// Envio de formulário com estado de erro/ocupado
export function useEnvio() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const enviar = async (fn) => {
    setOcupado(true)
    setErro('')
    try {
      await fn()
      return true
    } catch (e) {
      setErro(e.message)
      return false
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, erro, enviar, setErro }
}

export function Carregando({ carregando, erro }) {
  if (erro) return <Erro msg={erro} />
  if (carregando) return <div className="empty">Carregando…</div>
  return null
}

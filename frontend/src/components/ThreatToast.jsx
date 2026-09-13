import { useState, useEffect, useCallback, useRef } from 'react'

const FLAG_URL = (code) =>
  code && code.length === 2
    ? `https://flagcdn.com/16x12/${code.toLowerCase()}.png`
    : null

const TYPE_LABEL = (t) =>
  (t || '').replace(/^(cowrie|opencanary)\./, '')

function Toast({ id, event, onDismiss }) {
  const isKnown = event.known_threat
  const accent = isKnown ? '#ef4444' : '#fb923c'
  const flagUrl = FLAG_URL(event.src_country_code)

  useEffect(() => {
    const t = setTimeout(() => onDismiss(id), 6000)
    return () => clearTimeout(t)
  }, [id, onDismiss])

  return (
    <div
      onClick={() => onDismiss(id)}
      style={{
        background: 'rgba(15,17,23,0.95)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: '5px',
        padding: '10px 12px',
        cursor: 'pointer',
        fontFamily: "'Courier New', monospace",
        minWidth: '240px',
        maxWidth: '300px',
        animation: 'toastIn 0.2s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
        <span style={{
          background: accent, color: '#0f1117',
          fontSize: '8px', fontWeight: 'bold', letterSpacing: '1.5px',
          padding: '2px 6px', borderRadius: '3px',
        }}>
          {isKnown ? 'KNOWN THREAT' : 'HIGH ABUSE'}
        </span>
        {flagUrl && (
          <img src={flagUrl} alt={event.src_country_code} style={{ verticalAlign: 'middle' }} />
        )}
        <span style={{ color: '#94a3b8', fontSize: '10px' }}>
          {event.src_country || 'Unknown'}
        </span>
      </div>
      <div style={{ color: '#f1f5f9', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '3px' }}>
        {event.src_ip}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#64748b', fontSize: '10px' }}>
          {TYPE_LABEL(event.event_type)}
        </span>
        {event.abuse_score != null && (
          <span style={{ color: accent, fontSize: '10px', fontWeight: 'bold' }}>
            abuse {event.abuse_score}
          </span>
        )}
      </div>
    </div>
  )
}

export function useThreatToasts() {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((event) => {
    if (!event.known_threat && (event.abuse_score == null || event.abuse_score < 80)) return
    const id = `toast-${++counterRef.current}`
    setToasts((prev) => [...prev, { id, event }].slice(-4))
  }, [])

  return { toasts, push, dismiss }
}

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: '24px', right: '330px',
        display: 'flex', flexDirection: 'column-reverse', gap: '8px',
        zIndex: 20,
      }}>
        {toasts.map((t) => (
          <Toast key={t.id} id={t.id} event={t.event} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  )
}

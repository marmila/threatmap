import { useEffect, useRef, useState } from 'react'

const ANSI_RE = [
  /\x1b\[[0-9;]*[A-Za-z]/g,         // CSI: color, cursor, erase
  /\x1b\][^\x07]*\x07/g,             // OSC: window title etc.
  /\x1b[^[\]]/g,                     // other ESC sequences
  /[\x00-\x08\x0b\x0c\x0e-\x1f]/g,  // control chars (keep \n \r \t)
]
function stripAnsi(s) {
  for (const re of ANSI_RE) s = s.replace(re, '')
  return s
}

const SPEEDS = [1, 2, 5, 10]

const btn = (active) => ({
  background: active ? '#1e2535' : 'none',
  border: `1px solid ${active ? '#334155' : '#1e2535'}`,
  color: active ? '#e2e8f0' : '#475569',
  cursor: 'pointer', padding: '2px 8px', borderRadius: '4px',
  fontSize: '9px', fontFamily: "'Courier New', monospace", letterSpacing: '1px',
})

export default function SessionPlayer({ sessionId, onClose }) {
  const [frames, setFrames]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed]     = useState(2)
  const [cursor, setCursor]   = useState(0)
  const [output, setOutput]   = useState('')
  const termRef = useRef(null)

  // Load frames once
  useEffect(() => {
    setLoading(true)
    fetch(`/api/session/${sessionId}/frames`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No replay available for this session.' : `HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setFrames(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [sessionId])

  // Playback loop — one frame per tick
  useEffect(() => {
    if (!playing || cursor >= frames.length) {
      if (cursor >= frames.length && frames.length > 0) setPlaying(false)
      return
    }
    const frame = frames[cursor]
    const prevT = cursor > 0 ? frames[cursor - 1].t : 0
    const delay = Math.max(8, ((frame.t - prevT) * 1000) / speed)
    const id = setTimeout(() => {
      try {
        const raw = atob(frame.d)
        const bytes = Uint8Array.from(raw, c => c.charCodeAt(0))
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
        setOutput(prev => prev + stripAnsi(text))
      } catch (_) {}
      setCursor(c => c + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [playing, cursor, frames, speed])

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [output])

  // ESC to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const play = () => { setOutput(''); setCursor(0); setPlaying(true) }
  const pause = () => setPlaying(false)
  const resume = () => setPlaying(true)
  const ended = cursor >= frames.length && frames.length > 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 'min(700px, 96vw)', maxHeight: '85vh',
        background: '#0a0d14', border: '1px solid #1e2535', borderRadius: '8px',
        fontFamily: "'Courier New', monospace", display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: '1px solid #1e2535',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#4ade80', fontSize: '9px', letterSpacing: '2px' }}>
              SESSION REPLAY
            </span>
            <span style={{ color: '#334155', fontSize: '9px' }}>·</span>
            <span style={{ color: '#64748b', fontSize: '9px', letterSpacing: '1px' }}>
              {sessionId}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Terminal area */}
        <div ref={termRef} style={{
          flex: 1, overflowY: 'auto', padding: '14px 16px',
          color: '#e2e8f0', fontSize: '11px', lineHeight: '1.6',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          minHeight: '260px', maxHeight: '55vh',
        }}>
          {loading && (
            <span style={{ color: '#475569' }}>Loading session data...</span>
          )}
          {error && (
            <span style={{ color: '#ef4444' }}>{error}</span>
          )}
          {!loading && !error && !output && (
            <span style={{ color: '#334155' }}>Press PLAY to start replay ▶</span>
          )}
          {output}
          {playing && <span style={{ animation: 'blink 1s step-end infinite', color: '#4ade80' }}>█</span>}
        </div>

        {/* Controls */}
        {!loading && !error && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center',
            padding: '10px 14px', borderTop: '1px solid #1e2535', flexWrap: 'wrap',
          }}>
            {playing ? (
              <button onClick={pause} style={{ ...btn(false), color: '#94a3b8', border: '1px solid #334155' }}>
                ⏸ PAUSE
              </button>
            ) : ended ? (
              <button onClick={play} style={{ ...btn(true), background: '#14532d', color: '#4ade80', border: '1px solid #166534' }}>
                ↺ REPLAY
              </button>
            ) : cursor > 0 ? (
              <button onClick={resume} style={{ ...btn(true), background: '#14532d', color: '#4ade80', border: '1px solid #166534' }}>
                ▶ RESUME
              </button>
            ) : (
              <button onClick={play} style={{ ...btn(true), background: '#14532d', color: '#4ade80', border: '1px solid #166534' }}>
                ▶ PLAY
              </button>
            )}
            {cursor > 0 && !playing && (
              <button onClick={play} style={btn(false)}>↺ RESTART</button>
            )}

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: 'auto' }}>
              <span style={{ color: '#334155', fontSize: '9px', letterSpacing: '1px' }}>SPEED</span>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={btn(speed === s)}>
                  {s}×
                </button>
              ))}
            </div>

            {frames.length > 0 && (
              <span style={{ color: '#334155', fontSize: '9px' }}>
                {cursor}/{frames.length}
              </span>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  )
}

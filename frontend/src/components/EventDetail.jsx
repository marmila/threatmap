import { useEffect } from 'react'

const EVENT_LABELS = {
  'cowrie.login.success':   'LOGIN SUCCESS',
  'cowrie.login.failed':    'LOGIN ATTEMPT',
  'cowrie.session.connect': 'CONNECTION',
  'cowrie.log.closed':      'SESSION CLOSED',
  'cowrie.command.input':   'COMMAND EXECUTED',
}

const EVENT_BADGE = {
  'cowrie.login.success':   { bg: '#450a0a', color: '#ef4444' },
  'cowrie.login.failed':    { bg: '#3d2700', color: '#fbbf24' },
  'cowrie.command.input':   { bg: '#431407', color: '#f97316' },
  'cowrie.session.connect': { bg: '#0f172a', color: '#64748b' },
  'cowrie.log.closed':      { bg: '#0f172a', color: '#64748b' },
}
const DEFAULT_BADGE = { bg: '#3d2700', color: '#fbbf24' }

const abuseColor = (score) => {
  if (score >= 75) return '#ef4444'
  if (score >= 50) return '#f97316'
  if (score >= 25) return '#fbbf24'
  return '#4ade80'
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    zIndex: 20, cursor: 'pointer',
  },
  modal: {
    position: 'fixed', top: '50%', left: 'calc(50% - 140px)',
    transform: 'translate(-50%, -50%)',
    width: '380px', maxHeight: '80vh', overflowY: 'auto',
    background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(12px)',
    border: '1px solid #1e2535', borderRadius: '8px',
    padding: '20px', zIndex: 21,
    fontFamily: "'Courier New', monospace",
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '12px',
  },
  title: { color: '#f1f5f9', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' },
  closeBtn: {
    background: 'none', border: 'none', color: '#94a3b8',
    cursor: 'pointer', fontSize: '16px', padding: '0 4px',
  },
  section: { marginBottom: '14px' },
  sectionLabel: {
    color: '#4ade80', fontSize: '9px', letterSpacing: '2px',
    marginBottom: '6px', borderBottom: '1px solid #1e2535', paddingBottom: '4px',
  },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' },
  key: { color: '#4a5568', fontSize: '10px', flexShrink: 0 },
  val: { color: '#f1f5f9', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' },
  ip: { color: '#60a5fa', fontSize: '10px', textAlign: 'right' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '14px',
  },
  scoreBar: { height: '3px', background: '#1e2535', borderRadius: '2px', margin: '2px 0 6px' },
  scoreBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.5s' },
  threatBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    background: '#450a0a', color: '#f87171',
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', marginTop: '4px',
  },
  password: { color: '#fb923c', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' },
}

function Row({ label, value, valueStyle }) {
  return (
    <div style={s.row}>
      <span style={s.key}>{label}</span>
      <span style={{ ...s.val, ...valueStyle }}>{value || '—'}</span>
    </div>
  )
}

export default function EventDetail({ event, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!event) return null

  const time = event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'
  const badge = EVENT_BADGE[event.event_type] || DEFAULT_BADGE
  const label = EVENT_LABELS[event.event_type] || event.event_type

  return (
    <>
      <div style={s.overlay} onClick={onClose} />
      <div style={s.modal}>
        <div style={s.header}>
          <span style={s.title}>ATTACK DETAIL</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ ...s.badge, background: badge.bg, color: badge.color }}>
          {label}
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>SOURCE</div>
          <Row label="IP" value={event.src_ip} valueStyle={s.ip} />
          <Row label="COUNTRY" value={event.src_country_code
            ? `${event.src_country} (${event.src_country_code})`
            : event.src_country}
          />
          <Row label="CITY" value={event.src_city} />
          <Row label="COORDS" value={
            event.src_lat != null
              ? `${Number(event.src_lat).toFixed(3)}, ${Number(event.src_lon).toFixed(3)}`
              : null
          } />
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>ATTACK</div>
          <Row label="USERNAME" value={event.username} />
          <Row label="PASSWORD" value={event.password} valueStyle={s.password} />
          <Row label="RAW TYPE" value={event.event_type} />
        </div>

        {(event.abuse_score > 0 || event.known_threat) && (
          <div style={s.section}>
            <div style={s.sectionLabel}>THREAT INTEL</div>
            {event.abuse_score > 0 && (
              <>
                <Row
                  label="ABUSEIPDB"
                  value={`${event.abuse_score}/100`}
                  valueStyle={{ color: abuseColor(event.abuse_score) }}
                />
                <div style={s.scoreBar}>
                  <div style={{
                    ...s.scoreBarFill,
                    width: `${event.abuse_score}%`,
                    background: abuseColor(event.abuse_score),
                  }} />
                </div>
              </>
            )}
            {event.known_threat && (
              <div style={s.threatBadge}>⚠ KNOWN THREAT ACTOR</div>
            )}
          </div>
        )}

        <div style={s.section}>
          <div style={s.sectionLabel}>SENSOR</div>
          <Row label="HONEYPOT" value={event.honeypot} />
          <Row label="TIME" value={time} />
        </div>
      </div>
    </>
  )
}

import { useState } from 'react'
import EventDetail from './EventDetail.jsx'

const eventColor = (t) => {
  if (!t) return '#fbbf24'
  if (t.includes('login.success')) return '#ef4444'
  if (t.includes('command.input')) return '#f97316'
  if (t.includes('session.connect') || t.includes('log.closed')) return '#64748b'
  return '#fbbf24'
}

const s = {
  panel: {
    position: 'fixed', top: 0, right: 0, width: '280px', height: '100vh',
    background: 'rgba(15,17,23,0.85)', backdropFilter: 'blur(8px)',
    borderLeft: '1px solid #1e2535', padding: '20px 16px',
    display: 'flex', flexDirection: 'column', gap: '20px',
    fontFamily: "'Courier New', monospace", zIndex: 10,
  },
  title: { color: '#f1f5f9', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { color: '#4ade80', fontSize: '10px', letterSpacing: '2px' },
  bigNum: { color: '#f1f5f9', fontSize: '28px', fontWeight: 'bold' },
  bar: { height: '2px', background: '#1e2535', borderRadius: '2px', margin: '2px 0' },
  barFill: { height: '100%', borderRadius: '2px', background: '#fbbf24', transition: 'width 0.5s' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' },
  country: { color: '#94a3b8' },
  count: { color: '#fbbf24', fontWeight: 'bold' },
  feed: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' },
  event: {
    padding: '6px 8px', background: '#13161f', borderRadius: '4px',
    borderLeft: '2px solid #fbbf24', fontSize: '10px',
  },
  eventThreat: { borderLeft: '2px solid #ef4444' },
  ip: { color: '#60a5fa' },
  detail: { color: '#94a3b8', marginTop: '2px' },
}

export default function StatsPanel({ events, total, topCountries, connected }) {
  const maxCount = topCountries[0]?.count || 1
  const [selected, setSelected] = useState(null)

  return (
    <>
    <div style={s.panel}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={s.title}>THREATMAP</div>
          <div style={{ color: '#334155', fontSize: '9px', letterSpacing: '1px' }}>
            {import.meta.env.VITE_APP_VERSION || 'dev'}
          </div>
        </div>
        <div style={{ marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ ...s.badge, background: connected ? '#14532d' : '#450a0a', color: connected ? '#4ade80' : '#f87171' }}>
            {connected ? '● LIVE' : '○ RECONNECTING'}
          </span>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>TOTAL ATTACKS</div>
        <div style={s.bigNum}>{total.toLocaleString()}</div>
      </div>

      {topCountries.length > 0 && (
        <div style={s.section}>
          <div style={s.label}>TOP SOURCES</div>
          {topCountries.slice(0, 7).map((c) => (
            <div key={c.country}>
              <div style={s.row}>
                <span style={s.country}>{c.country || 'Unknown'}</span>
                <span style={s.count}>{c.count}</span>
              </div>
              <div style={s.bar}>
                <div style={{ ...s.barFill, width: `${(c.count / maxCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.section}>
        <div style={s.label}>LIVE FEED</div>
      </div>
      <div style={s.feed}>
        {events.slice(0, 30).map((e, i) => (
          <div key={i} style={{ ...s.event, borderLeft: `2px solid ${eventColor(e.event_type)}`, cursor: 'pointer' }}
            onClick={() => setSelected(e)}>
            <div style={s.ip}>
              {e.src_ip}
              {e.known_threat && (
                <span style={{ ...s.badge, background: '#450a0a', color: '#f87171', marginLeft: '6px' }}>
                  KNOWN THREAT
                </span>
              )}
            </div>
            <div style={s.detail}>
              {e.src_country} {e.src_city ? `· ${e.src_city}` : ''}
            </div>
            <div style={s.detail}>
              {e.event_type}{e.username ? ` · user: ${e.username}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>

    <EventDetail event={selected} onClose={() => setSelected(null)} />
    </>
  )
}

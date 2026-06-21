import { useState, useMemo, useCallback } from 'react'
import EventDetail from './EventDetail.jsx'

const eventColor = (t) => {
  if (!t) return '#fbbf24'
  if (t.includes('login.success')) return '#ef4444'
  if (t.includes('command.input')) return '#f97316'
  if (t.includes('session.connect') || t.includes('session.closed')) return '#64748b'
  return '#fbbf24'
}

const s = {
  // Desktop panel
  panel: {
    position: 'fixed', top: 0, right: 0, width: '280px', height: '100vh',
    background: 'rgba(15,17,23,0.85)', backdropFilter: 'blur(8px)',
    borderLeft: '1px solid #1e2535', padding: '20px 16px',
    display: 'flex', flexDirection: 'column', gap: '16px',
    fontFamily: "'Courier New', monospace", zIndex: 10,
    overflowY: 'auto',
  },
  // Mobile bottom sheet
  sheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    maxHeight: '50vh',
    background: 'rgba(15,17,23,0.97)', backdropFilter: 'blur(12px)',
    borderTop: '1px solid #1e2535', borderRadius: '14px 14px 0 0',
    padding: '8px 16px 20px',
    display: 'flex', flexDirection: 'column', gap: '10px',
    fontFamily: "'Courier New', monospace", zIndex: 10,
    overflowY: 'auto',
  },
  handle: {
    width: '36px', height: '4px', background: '#334155',
    borderRadius: '2px', margin: '0 auto 4px', flexShrink: 0,
  },
  title: { color: '#f1f5f9', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: '#4ade80', fontSize: '10px', letterSpacing: '2px' },
  bigNum: { color: '#f1f5f9', fontSize: '28px', fontWeight: 'bold' },
  bigNumMobile: { color: '#f1f5f9', fontSize: '20px', fontWeight: 'bold' },
  bar: { height: '2px', background: '#1e2535', borderRadius: '2px', margin: '2px 0' },
  barFill: { height: '100%', borderRadius: '2px', background: '#fbbf24', transition: 'width 0.5s' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' },
  country: { color: '#94a3b8' },
  ipAddr: { color: '#60a5fa', fontSize: '10px', fontFamily: 'monospace' },
  count: { color: '#fbbf24', fontWeight: 'bold' },
  feed: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0 },
  event: {
    padding: '6px 8px', background: '#13161f', borderRadius: '4px',
    fontSize: '10px', cursor: 'pointer',
  },
  ip: { color: '#60a5fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  detail: { color: '#94a3b8', marginTop: '2px' },
  countBadge: {
    fontSize: '9px', color: '#475569', background: '#1e2535',
    borderRadius: '3px', padding: '1px 5px', flexShrink: 0,
  },
}

function HourlyChart({ data }) {
  const [hovered, setHovered] = useState(null)
  const W = 248
  const H = 44
  const barW = W / 24

  if (!data || data.length === 0) return null

  const max = Math.max(...data.map(d => d.count), 1)
  const now = new Date()
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now)
    h.setUTCMinutes(0, 0, 0)
    h.setUTCHours(h.getUTCHours() - 23 + i)
    const prefix = h.toISOString().substring(0, 13)
    const found = data.find(d => d.hour && d.hour.startsWith(prefix))
    const label = `${String(h.getUTCHours()).padStart(2, '0')}:00`
    return { count: found ? found.count : 0, label }
  })

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = Math.max(0, Math.min(23, Math.floor(x / barW)))
    setHovered(idx)
  }

  const tip = hovered !== null ? hours[hovered] : null
  const tipX = hovered !== null ? Math.min(hovered * barW, W - 72) : 0
  const tipBarH = tip ? Math.max(2, (tip.count / max) * (H - 4)) : 0
  const tipY = tip ? Math.max(0, H - tipBarH - 20) : 0

  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={s.label}>ATTACKS / HOUR (24H)</div>
      <svg width={W} height={H} style={{ display: 'block', marginTop: '4px', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}>
        {hours.map(({ count }, i) => {
          const barH = Math.max(2, (count / max) * (H - 4))
          const isHov = hovered === i
          return (
            <rect key={i} x={i * barW + 1} y={H - barH}
              width={Math.max(1, barW - 2)} height={barH}
              fill={`rgba(251,191,36,${isHov ? 1 : 0.25 + 0.75 * (count / max)})`}
              rx={1} />
          )
        })}
        {tip && (
          <g>
            <rect x={tipX} y={tipY} width={70} height={15} rx={2}
              fill="#0f1117" stroke="#334155" strokeWidth={0.5} />
            <text x={tipX + 4} y={tipY + 10}
              fill="#fbbf24" fontSize="8" fontFamily="Courier New,monospace">
              {tip.label} · {tip.count.toLocaleString()}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

export default function StatsPanel({ events, total, topCountries, topIps = [], connected, isMobile = false, hourlyData = [], credentialsData = { top_usernames: [], top_passwords: [] }, commandsData = [], protocolBreakdown = [], honeypotBreakdown = [] }) {
  const maxCountryCount = topCountries[0]?.count || 1
  const maxIpCount = topIps[0]?.count || 1
  const [selected, setSelected] = useState(null)

  const dedupedFeed = useMemo(() => {
    const seen = new Set()
    const result = []
    const ipCounts = {}
    for (const e of events) ipCounts[e.src_ip] = (ipCounts[e.src_ip] || 0) + 1
    for (const e of events) {
      if (!seen.has(e.src_ip)) {
        result.push({ ...e, _count: ipCounts[e.src_ip] })
        seen.add(e.src_ip)
      }
      if (result.length >= (isMobile ? 15 : 25)) break
    }
    return result
  }, [events, isMobile])

  const liveBadge = (
    <span style={{ ...s.badge, background: connected ? '#14532d' : '#450a0a', color: connected ? '#4ade80' : '#f87171' }}>
      {connected ? '● LIVE' : '○ OFF'}
    </span>
  )

  return (
    <>
    <div style={isMobile ? s.sheet : s.panel}>

      {/* Mobile: drag handle + compact header */}
      {isMobile ? (
        <>
          <div style={s.handle} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={s.title}>THREATMAP</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={s.bigNumMobile}>{total.toLocaleString()}</span>
              {liveBadge}
            </div>
          </div>
          {protocolBreakdown.length > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {protocolBreakdown.map(p => (
                <span key={p.protocol} style={{
                  fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
                  background: p.protocol === 'telnet' ? '#2e1065' : '#0f172a',
                  color: p.protocol === 'telnet' ? '#a78bfa' : '#60a5fa',
                  border: `1px solid ${p.protocol === 'telnet' ? '#4c1d95' : '#1e3a5f'}`,
                }}>
                  {(p.protocol || 'unknown').toUpperCase()} {p.count.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Desktop: full header */
        <>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={s.title}>THREATMAP</div>
              <div style={{ color: '#334155', fontSize: '9px', letterSpacing: '1px' }}>
                {import.meta.env.VITE_APP_VERSION || 'dev'}
              </div>
            </div>
            <div style={{ marginTop: '4px' }}>{liveBadge}</div>
          </div>

          <div style={s.section}>
            <div style={s.label}>TOTAL ATTACKS</div>
            <div style={s.bigNum}>{total.toLocaleString()}</div>
            {protocolBreakdown.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {protocolBreakdown.map(p => (
                  <span key={p.protocol} style={{
                    fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
                    background: p.protocol === 'telnet' ? '#2e1065' : '#0f172a',
                    color: p.protocol === 'telnet' ? '#a78bfa' : '#60a5fa',
                    border: `1px solid ${p.protocol === 'telnet' ? '#4c1d95' : '#1e3a5f'}`,
                  }}>
                    {(p.protocol || 'unknown').toUpperCase()} {p.count.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {topCountries.length > 0 && (
            <div style={s.section}>
              <div style={s.label}>TOP SOURCES</div>
              {topCountries.slice(0, 5).map((c) => (
                <div key={c.country}>
                  <div style={s.row}>
                    <span style={s.country}>{c.country || 'Unknown'}</span>
                    <span style={s.count}>{c.count.toLocaleString()}</span>
                  </div>
                  <div style={s.bar}>
                    <div style={{ ...s.barFill, width: `${(c.count / maxCountryCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {topIps.length > 0 && (
            <div style={s.section}>
              <div style={s.label}>TOP IPs</div>
              {topIps.slice(0, 5).map((entry) => (
                <div key={entry.ip}>
                  <div style={s.row}>
                    <a href={`https://www.abuseipdb.com/check/${entry.ip}`}
                       target="_blank" rel="noreferrer"
                       style={{ ...s.ipAddr, textDecoration: 'none' }}>
                      {entry.ip}
                      {entry.known_threat && <span style={{ color: '#ef4444', marginLeft: '4px' }}>●</span>}
                    </a>
                    <span style={s.count}>{entry.count.toLocaleString()}</span>
                  </div>
                  <div style={s.bar}>
                    <div style={{ ...s.barFill, width: `${(entry.count / maxIpCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Hourly chart — desktop only */}
      {!isMobile && <HourlyChart data={hourlyData} />}

      {/* Sensor breakdown — desktop only */}
      {!isMobile && honeypotBreakdown.length > 0 && (
        <div style={s.section}>
          <div style={s.label}>SENSORS</div>
          {honeypotBreakdown.map(h => (
            <div key={h.honeypot} style={s.row}>
              <span style={s.country}>{h.honeypot || 'unknown'}</span>
              <span style={s.count}>{h.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Credentials leaderboard — desktop only */}
      {!isMobile && (credentialsData.top_usernames?.length > 0 || credentialsData.top_passwords?.length > 0) && (
        <div style={s.section}>
          <div style={s.label}>TOP CREDENTIALS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
            <div>
              <div style={{ color: '#60a5fa', fontSize: '8px', letterSpacing: '1px', marginBottom: '4px' }}>USERNAMES</div>
              {credentialsData.top_usernames?.slice(0, 6).map((u, i) => (
                <div key={i} style={{ ...s.row, marginBottom: '3px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                  <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{u.count}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ color: '#fb923c', fontSize: '8px', letterSpacing: '1px', marginBottom: '4px' }}>PASSWORDS</div>
              {credentialsData.top_passwords?.slice(0, 6).map((p, i) => (
                <div key={i} style={{ ...s.row, marginBottom: '3px' }}>
                  <span style={{ color: '#fb923c', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.password}</span>
                  <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top commands — desktop only */}
      {!isMobile && commandsData.length > 0 && (
        <div style={s.section}>
          <div style={s.label}>TOP COMMANDS</div>
          {commandsData.slice(0, 5).map((c, i) => (
            <div key={i} style={{ ...s.row, marginBottom: '3px' }}>
              <span style={{ color: '#f97316', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{c.command}</span>
              <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live feed — shown on both mobile and desktop */}
      {!isMobile && <div style={s.section}><div style={s.label}>LIVE FEED</div></div>}
      {isMobile && <div style={s.label}>LIVE FEED</div>}
      <div style={s.feed}>
        {dedupedFeed.map((e, i) => (
          <div key={i}
            style={{ ...s.event, borderLeft: `2px solid ${eventColor(e.event_type)}` }}
            onClick={() => setSelected(e)}>
            <div style={s.ip}>
              <span>{e.src_ip}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {e._count > 1 && <span style={s.countBadge}>×{e._count}</span>}
                {e.is_returning && (
                  <span style={{ ...s.badge, background: '#1c1917', color: '#a8a29e' }}>RPT</span>
                )}
                {e.protocol === 'telnet' && (
                  <span style={{ ...s.badge, background: '#2e1065', color: '#a78bfa' }}>TEL</span>
                )}
                {e.known_threat && (
                  <span style={{ ...s.badge, background: '#450a0a', color: '#f87171' }}>THREAT</span>
                )}
              </div>
            </div>
            <div style={s.detail}>{e.src_country}{e.src_city ? ` · ${e.src_city}` : ''}</div>
            <div style={s.detail}>{e.event_type}{e.username ? ` · ${e.username}` : ''}</div>
          </div>
        ))}
      </div>
    </div>

    <EventDetail event={selected} onClose={() => setSelected(null)} />
    </>
  )
}

import { useState, useMemo, useEffect, useRef } from 'react'
import EventDetail from './EventDetail.jsx'

const eventColor = (t) => {
  if (!t) return '#fbbf24'
  if (t.includes('login.success')) return '#ef4444'
  if (t.includes('command.input')) return '#f97316'
  if (t.includes('file_download')) return '#f97316'
  if (t.includes('session.connect') || t.includes('session.closed')) return '#64748b'
  if (t.includes('http')) return '#a78bfa'
  if (t.includes('ftp')) return '#22d3ee'
  if (t.includes('mysql')) return '#4ade80'
  if (t.includes('redis')) return '#fb923c'
  return '#fbbf24'
}

const flag = (code) => {
  if (!code || code.length !== 2) return ''
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

const TYPE_LABEL = (t) => {
  const m = { 'cowrie.session.file_download': 'file.download' }
  return m[t] || (t || '').replace(/^(cowrie|opencanary)\./, '')
}

const s = {
  panel: {
    position: 'fixed', top: 0, right: 0, width: '280px', height: '100vh',
    background: 'rgba(15,17,23,0.85)', backdropFilter: 'blur(8px)',
    borderLeft: '1px solid #1e2535',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Courier New', monospace", zIndex: 10,
    overflow: 'hidden',
  },
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
  header: {
    padding: '14px 16px 0',
    flexShrink: 0,
  },
  title: { color: '#f1f5f9', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px',
  },
  tabBar: {
    display: 'flex', borderBottom: '1px solid #1e2535',
    margin: '10px 16px 0', flexShrink: 0,
  },
  tabContent: {
    flex: 1, overflowY: 'auto', padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: '#4ade80', fontSize: '9px', letterSpacing: '2px', marginBottom: '2px' },
  subLabel: { fontSize: '8px', letterSpacing: '1px', marginBottom: '4px' },
  bigNum: { color: '#f1f5f9', fontSize: '26px', fontWeight: 'bold', lineHeight: 1 },
  bigNumMobile: { color: '#f1f5f9', fontSize: '20px', fontWeight: 'bold' },
  bar: { height: '2px', background: '#1e2535', borderRadius: '2px', margin: '2px 0' },
  barFill: { height: '100%', borderRadius: '2px', background: '#fbbf24', transition: 'width 0.5s' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', gap: '8px' },
  country: { color: '#94a3b8' },
  ipAddr: { color: '#60a5fa', fontSize: '10px', fontFamily: 'monospace' },
  count: { color: '#fbbf24', fontWeight: 'bold', flexShrink: 0 },
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
  dimVal: { color: '#64748b', fontSize: '10px' },
}

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '6px 0', background: 'transparent', border: 'none',
      borderBottom: active ? '2px solid #4ade80' : '2px solid transparent',
      color: active ? '#f1f5f9' : '#475569',
      cursor: 'pointer', fontSize: '9px', letterSpacing: '1.5px',
      fontFamily: "'Courier New', monospace",
    }}>
      {label}
    </button>
  )
}

function HourlyChart({ data, dailyData = [] }) {
  const [hovered, setHovered] = useState(null)
  const [period, setPeriod] = useState('24h')
  const W = 248, H = 44

  const bars = period === '7d'
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setUTCHours(0, 0, 0, 0)
        d.setUTCDate(d.getUTCDate() - 6 + i)
        const prefix = d.toISOString().substring(0, 10)
        const found = dailyData.find(r => r.day && r.day.startsWith(prefix))
        return { count: found ? found.count : 0, label: prefix.substring(5) }
      })
    : Array.from({ length: 24 }, (_, i) => {
        const h = new Date()
        h.setUTCMinutes(0, 0, 0)
        h.setUTCHours(h.getUTCHours() - 23 + i)
        const prefix = h.toISOString().substring(0, 13)
        const found = data.find(r => r.hour && r.hour.startsWith(prefix))
        return { count: found ? found.count : 0, label: `${String(h.getUTCHours()).padStart(2, '0')}:00` }
      })

  const barW = W / bars.length
  const max = Math.max(...bars.map(b => b.count), 1)
  const peakIdx = bars.reduce((pi, b, i) => b.count > bars[pi].count ? i : pi, 0)
  const tip = hovered !== null ? bars[hovered] : null
  const tipX = hovered !== null ? Math.min(hovered * barW, W - 72) : 0
  const tipBarH = tip ? Math.max(2, (tip.count / max) * (H - 4)) : 0
  const tipY = tip ? Math.max(0, H - tipBarH - 20) : 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <div style={s.label}>{period === '7d' ? 'ATTACKS / DAY (7D)' : 'ATTACKS / HOUR (24H)'}</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['24h', '7d'].map(p => (
            <button key={p} onClick={() => { setPeriod(p); setHovered(null) }} style={{
              background: period === p ? '#1e2535' : 'none',
              border: `1px solid ${period === p ? '#334155' : '#1e2535'}`,
              color: period === p ? '#f1f5f9' : '#475569',
              cursor: 'pointer', fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
              fontFamily: "'Courier New', monospace", letterSpacing: '0.5px',
            }}>{p}</button>
          ))}
        </div>
      </div>
      <svg width={W} height={H} style={{ display: 'block', marginTop: '2px', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHovered(Math.max(0, Math.min(bars.length - 1, Math.floor((e.clientX - rect.left) / barW))))
        }}
        onMouseLeave={() => setHovered(null)}>
        {bars.map(({ count }, i) => {
          const barH = Math.max(2, (count / max) * (H - 4))
          const isPeak = i === peakIdx && count > 0
          return (
            <rect key={i} x={i * barW + 1} y={H - barH}
              width={Math.max(1, barW - 2)} height={barH}
              fill={isPeak ? '#ffffff' : `rgba(251,191,36,${hovered === i ? 1 : 0.25 + 0.75 * (count / max)})`} rx={1} />
          )
        })}
        {tip && (
          <g>
            <rect x={tipX} y={tipY} width={70} height={15} rx={2} fill="#0f1117" stroke="#334155" strokeWidth={0.5} />
            <text x={tipX + 4} y={tipY + 10} fill="#fbbf24" fontSize="8" fontFamily="Courier New,monospace">
              {tip.label} · {tip.count.toLocaleString()}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

const TYPE_COLOR = (t) => {
  if (!t) return '#fbbf24'
  if (t.includes('login.success') || t.includes('ssh.login')) return '#ef4444'
  if (t.includes('command.input')) return '#f97316'
  if (t.includes('session')) return '#64748b'
  if (t.includes('http')) return '#a78bfa'
  if (t.includes('ftp')) return '#22d3ee'
  if (t.includes('mysql')) return '#4ade80'
  if (t.includes('redis')) return '#fb923c'
  if (t.includes('file_download')) return '#f97316'
  return '#fbbf24'
}

const PROTOCOL_COLORS = {
  ssh:    { bg: '#1e3a5f', color: '#60a5fa', border: '#1e3a5f' },
  telnet: { bg: '#2e1065', color: '#a78bfa', border: '#4c1d95' },
  http:   { bg: '#2e1065', color: '#a78bfa', border: '#4c1d95' },
  ftp:    { bg: '#083344', color: '#22d3ee', border: '#164e63' },
  mysql:  { bg: '#052e16', color: '#4ade80', border: '#14532d' },
  redis:  { bg: '#431407', color: '#fb923c', border: '#7c2d12' },
}

export default function StatsPanel({
  events, total, topCountries, topIps = [], connected, isMobile = false,
  hourlyData = [], credentialsData = { top_usernames: [], top_passwords: [] },
  commandsData = [], protocolBreakdown = [], honeypotBreakdown = [], eventTypeBreakdown = [],
  httpPathsData = [], redisCommandsData = [], uniqueIps = 0,
  dailyData = [], orgsData = [], vulnsData = [],
}) {
  const [activeTab, setActiveTab] = useState('feed')
  const [selected, setSelected] = useState(null)
  const [countryFilter, setCountryFilter] = useState(null)
  const [protocolFilter, setProtocolFilter] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  const [frozenEvents, setFrozenEvents] = useState([])
  const [newEventCount, setNewEventCount] = useState(0)
  const pauseFirstTsRef = useRef(null)
  const [nowTs, setNowTs] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const lastAgo = useMemo(() => {
    const ts = events[0]?.timestamp
    if (!ts) return null
    const diff = Math.floor((nowTs - new Date(ts).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }, [events, nowTs])

  const attacksPerMin = useMemo(() => {
    const cutoff = nowTs - 60000
    return events.filter(e => new Date(e.timestamp).getTime() > cutoff).length
  }, [events, nowTs])

  const togglePause = () => {
    if (!paused) {
      setFrozenEvents([...events])
      pauseFirstTsRef.current = events[0]?.timestamp || null
      setNewEventCount(0)
    }
    setPaused(p => !p)
  }

  useEffect(() => {
    if (!paused || !pauseFirstTsRef.current) return
    const pauseTs = new Date(pauseFirstTsRef.current).getTime()
    setNewEventCount(events.filter(e => new Date(e.timestamp).getTime() > pauseTs).length)
  }, [events, paused])
  const maxCountryCount = topCountries[0]?.count || 1
  const maxIpCount = topIps[0]?.count || 1
  const maxTypeCount = eventTypeBreakdown[0]?.count || 1

  const dedupedFeed = useMemo(() => {
    const base = paused ? frozenEvents : events
    const source = base.filter(e =>
      (!countryFilter || e.src_country === countryFilter) &&
      (!protocolFilter || e.protocol === protocolFilter)
    )
    const seen = new Set()
    const result = []
    const ipCounts = {}
    for (const e of source) ipCounts[e.src_ip] = (ipCounts[e.src_ip] || 0) + 1
    for (const e of source) {
      if (!seen.has(e.src_ip)) {
        result.push({ ...e, _count: ipCounts[e.src_ip] })
        seen.add(e.src_ip)
      }
      if (result.length >= (isMobile ? 15 : 25)) break
    }
    return result
  }, [events, isMobile, countryFilter, protocolFilter, paused, frozenEvents])

  const filteredProtocol = protocolBreakdown.filter(p => p.protocol && p.protocol !== 'unknown')

  const liveBadge = (
    <span style={{ ...s.badge, background: connected ? '#14532d' : '#450a0a', color: connected ? '#4ade80' : '#f87171' }}>
      {connected ? '● LIVE' : '○ OFF'}
    </span>
  )

  const feedItems = (
    <div style={s.feed}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexShrink: 0 }}>
        <span style={{ color: paused ? '#fbbf24' : '#475569', fontSize: '9px', letterSpacing: '1px' }}>
          {paused ? `⏸ PAUSED${newEventCount > 0 ? ` · +${newEventCount} new` : ''}` : `${attacksPerMin}/min`}
        </span>
        <button onClick={togglePause} style={{ background: 'none', border: '1px solid #1e2535', color: '#94a3b8', cursor: 'pointer', fontSize: '8px', padding: '2px 6px', borderRadius: '3px', letterSpacing: '1px', fontFamily: "'Courier New', monospace" }}>
          {paused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
      </div>
      {(countryFilter || protocolFilter) && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
          {countryFilter && (
            <span style={{ color: '#94a3b8', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              ▶ {countryFilter}
              <button onClick={() => setCountryFilter(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', padding: 0, lineHeight: 1 }}>✕</button>
            </span>
          )}
          {protocolFilter && (
            <span style={{ color: '#94a3b8', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              ▶ {protocolFilter.toUpperCase()}
              <button onClick={() => setProtocolFilter(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', padding: 0, lineHeight: 1 }}>✕</button>
            </span>
          )}
        </div>
      )}
      {dedupedFeed.map((e, i) => (
        <div key={i}
          style={{ ...s.event, borderLeft: `2px solid ${eventColor(e.event_type)}` }}
          onClick={() => setSelected(e)}>
          <div style={s.ip}>
            <span>{e.src_ip}</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {e._count > 1 && <span style={s.countBadge}>×{e._count}</span>}
              {e.is_hot && <span style={{ ...s.badge, background: '#7c2d12', color: '#fb923c' }}>HOT</span>}
              {e.is_multi && <span style={{ ...s.badge, background: '#1e1b4b', color: '#818cf8' }}>MULTI</span>}
              {e.is_returning && <span style={{ ...s.badge, background: '#1c1917', color: '#a8a29e' }}>RPT</span>}
              {e.protocol === 'telnet' && <span style={{ ...s.badge, background: '#2e1065', color: '#a78bfa' }}>TEL</span>}
              {e.protocol === 'http' && <span style={{ ...s.badge, background: '#2e1065', color: '#a78bfa' }}>HTTP</span>}
              {e.protocol === 'ftp' && <span style={{ ...s.badge, background: '#083344', color: '#22d3ee' }}>FTP</span>}
              {e.protocol === 'mysql' && <span style={{ ...s.badge, background: '#052e16', color: '#4ade80' }}>SQL</span>}
              {e.protocol === 'redis' && <span style={{ ...s.badge, background: '#431407', color: '#fb923c' }}>RDB</span>}
              {e.known_threat && <span style={{ ...s.badge, background: '#450a0a', color: '#f87171' }}>THREAT</span>}
            </div>
          </div>
          <div style={s.detail}>{flag(e.src_country_code)}{flag(e.src_country_code) ? ' ' : ''}{e.src_country}{e.src_city ? ` · ${e.src_city}` : ''}</div>
          <div style={s.detail}>{e.event_type}{e.username ? ` · ${e.username}` : ''}</div>
          {e.vuln_hint && (
            <div style={{ fontSize: '8px', marginTop: '2px', color: e.vuln_hint.tier === 'cve' ? '#ef4444' : '#818cf8', letterSpacing: '0.5px' }}>
              {e.vuln_hint.tier === 'cve' ? '⚠ ' : '◉ '}{e.vuln_hint.label}{e.vuln_hint.cve ? ` · ${e.vuln_hint.cve}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  if (isMobile) {
    const sheetHeight = !mobileOpen ? '28px' : activeTab === 'feed' ? '50vh' : '85vh'
    return (
      <>
        <div style={{ ...s.sheet, maxHeight: sheetHeight, overflow: mobileOpen ? undefined : 'hidden' }}>
          <div style={{ ...s.handle, cursor: 'pointer' }} onClick={() => setMobileOpen(o => !o)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={s.title}>THREATMAP</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={s.bigNumMobile}>{total.toLocaleString()}</span>
                {uniqueIps > 0 && <div style={{ color: '#475569', fontSize: '8px', letterSpacing: '1px' }}>{uniqueIps.toLocaleString()} IPs{lastAgo ? ` · ${lastAgo}` : ''}{attacksPerMin > 0 ? ` · ${attacksPerMin}/min` : ''}</div>}
              </div>
              {liveBadge}
            </div>
          </div>
          {filteredProtocol.length > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {filteredProtocol.map(p => (
                <span key={p.protocol}
                  onClick={() => { setProtocolFilter(f => f === p.protocol ? null : p.protocol); setActiveTab('feed') }}
                  style={{
                    fontSize: '9px', padding: '2px 7px', borderRadius: '3px', cursor: 'pointer',
                    background: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).bg,
                    color: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color,
                    border: `1px solid ${(PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).border}`,
                    opacity: protocolFilter && protocolFilter !== p.protocol ? 0.35 : 1,
                    outline: protocolFilter === p.protocol ? `1px solid ${(PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color}` : 'none',
                    outlineOffset: '1px',
                  }}>
                  {p.protocol.toUpperCase()} {p.count.toLocaleString()}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e2535', marginBottom: '4px', flexShrink: 0 }}>
            <Tab label="FEED" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
            <Tab label="STATS" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
            <Tab label="INTEL" active={activeTab === 'intel'} onClick={() => setActiveTab('intel')} />
          </div>

          {activeTab === 'feed' && feedItems}

          {activeTab === 'stats' && (
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {topCountries.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>TOP SOURCES</div>
                  {topCountries.slice(0, 5).map((c) => (
                    <div key={c.country} style={{ cursor: 'pointer' }} onClick={() => { setCountryFilter(c.country); setActiveTab('feed') }}>
                      <div style={s.row}>
                        <span style={{ ...s.country, color: countryFilter === c.country ? '#4ade80' : undefined }}>{flag(c.country_code)}{flag(c.country_code) ? ' ' : ''}{c.country || 'Unknown'}</span>
                        <span style={s.count}>{c.count.toLocaleString()}</span>
                      </div>
                      <div style={s.bar}><div style={{ ...s.barFill, width: `${(c.count / maxCountryCount) * 100}%` }} /></div>
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
                        <span style={s.ipAddr}>{entry.ip}{entry.known_threat && <span style={{ color: '#ef4444', marginLeft: '4px' }}>●</span>}{entry.country_code && <span style={{ color: '#475569', fontSize: '8px', marginLeft: '5px' }}>({entry.country_code})</span>}</span>
                        <span style={s.count}>{entry.count.toLocaleString()}</span>
                      </div>
                      <div style={s.bar}><div style={{ ...s.barFill, width: `${(entry.count / maxIpCount) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              <HourlyChart data={hourlyData} dailyData={dailyData} />
              {honeypotBreakdown.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>SENSORS</div>
                  {honeypotBreakdown.map(h => (
                    <div key={h.honeypot} style={{ marginBottom: '6px' }}>
                      <div style={s.row}>
                        <span style={s.country}>{h.honeypot || 'unknown'}</span>
                        <span style={s.count}>{h.count.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px', paddingLeft: '4px' }}>
                        {(h.protocols || [])
                          .filter(p => p.protocol && p.protocol !== 'unknown')
                          .sort((a, b) => b.count - a.count)
                          .map(p => (
                            <span key={p.protocol} style={{
                              fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                              background: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).bg,
                              color: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color,
                            }}>
                              {p.protocol.toUpperCase()} {p.count.toLocaleString()}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {eventTypeBreakdown.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>ATTACK TYPES</div>
                  {eventTypeBreakdown.map(e => (
                    <div key={e.event_type}>
                      <div style={s.row}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: TYPE_COLOR(e.event_type), flexShrink: 0 }} />
                          <span style={{ color: '#94a3b8', fontSize: '9px' }}>{TYPE_LABEL(e.event_type)}</span>
                        </span>
                        <span style={s.count}>{e.count.toLocaleString()}</span>
                      </div>
                      <div style={s.bar}><div style={{ ...s.barFill, width: `${(e.count / maxTypeCount) * 100}%`, background: TYPE_COLOR(e.event_type) }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'intel' && (
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {(credentialsData.top_usernames?.length > 0 || credentialsData.top_passwords?.length > 0) && (
                <div style={s.section}>
                  <div style={s.label}>TOP CREDENTIALS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                    <div>
                      <div style={{ ...s.subLabel, color: '#60a5fa' }}>USERNAMES</div>
                      {credentialsData.top_usernames?.slice(0, 6).map((u, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                          <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{u.count}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ ...s.subLabel, color: '#fb923c' }}>PASSWORDS</div>
                      {credentialsData.top_passwords?.slice(0, 6).map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#fb923c', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.password}</span>
                          <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{p.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {commandsData.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>TOP COMMANDS</div>
                  {commandsData.slice(0, 6).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#f97316', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.command}</span>
                      <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {httpPathsData.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>TOP PATHS PROBED</div>
                  {httpPathsData.slice(0, 6).map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#a78bfa', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                      <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {redisCommandsData.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>TOP REDIS COMMANDS</div>
                  {redisCommandsData.slice(0, 6).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#fb923c', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.command}</span>
                      <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {orgsData.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>TOP PROVIDERS</div>
                  {orgsData.slice(0, 6).map((o, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.org}</span>
                      <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{o.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {vulnsData.length > 0 && (
                <div style={s.section}>
                  <div style={s.label}>PROBES DETECTED</div>
                  {vulnsData.slice(0, 6).map((v, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                        <span style={{ flexShrink: 0, fontSize: '8px', padding: '1px 4px', borderRadius: '3px', background: v.tier === 'cve' ? '#450a0a' : '#3d2700', color: v.tier === 'cve' ? '#ef4444' : '#fbbf24' }}>
                          {v.tier === 'cve' ? 'CVE' : 'TEC'}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
                      </span>
                      <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{v.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <EventDetail event={selected} onClose={() => setSelected(null)} />
      </>
    )
  }

  return (
    <>
      <div style={s.panel}>
        {/* Persistent header */}
        <div style={s.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={s.title}>THREATMAP</div>
            <div style={{ color: '#334155', fontSize: '9px', letterSpacing: '1px' }}>
              {import.meta.env.VITE_APP_VERSION || 'dev'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px' }}>
            <div>
              {liveBadge}
              {lastAgo && <div style={{ color: '#475569', fontSize: '8px', marginTop: '3px', letterSpacing: '1px' }}>{lastAgo}{attacksPerMin > 0 ? ` · ${attacksPerMin}/min` : ''}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={s.bigNum}>{total.toLocaleString()}</div>
              {uniqueIps > 0 && <div style={{ color: '#475569', fontSize: '8px', letterSpacing: '1px', marginTop: '2px' }}>{uniqueIps.toLocaleString()} IPs</div>}
            </div>
          </div>
          {filteredProtocol.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {filteredProtocol.map(p => (
                <span key={p.protocol}
                  onClick={() => { setProtocolFilter(f => f === p.protocol ? null : p.protocol); setActiveTab('feed') }}
                  style={{
                    fontSize: '9px', padding: '2px 7px', borderRadius: '3px', cursor: 'pointer',
                    background: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).bg,
                    color: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color,
                    border: `1px solid ${(PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).border}`,
                    opacity: protocolFilter && protocolFilter !== p.protocol ? 0.35 : 1,
                    outline: protocolFilter === p.protocol ? `1px solid ${(PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color}` : 'none',
                    outlineOffset: '1px',
                  }}>
                  {p.protocol.toUpperCase()} {p.count.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={s.tabBar}>
          <Tab label="FEED" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <Tab label="STATS" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
          <Tab label="INTEL" active={activeTab === 'intel'} onClick={() => setActiveTab('intel')} />
        </div>

        {/* FEED tab */}
        {activeTab === 'feed' && (
          <div style={{ ...s.tabContent, gap: '6px' }}>
            {feedItems}
          </div>
        )}

        {/* STATS tab */}
        {activeTab === 'stats' && (
          <div style={s.tabContent}>
            {topCountries.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>TOP SOURCES</div>
                {topCountries.slice(0, 5).map((c) => (
                  <div key={c.country} style={{ cursor: 'pointer' }} onClick={() => { setCountryFilter(c.country); setActiveTab('feed') }}>
                    <div style={s.row}>
                      <span style={{ ...s.country, color: countryFilter === c.country ? '#4ade80' : undefined }}>{flag(c.country_code)}{flag(c.country_code) ? ' ' : ''}{c.country || 'Unknown'}</span>
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
                        {entry.country_code && <span style={{ color: '#475569', fontSize: '8px', marginLeft: '5px' }}>({entry.country_code})</span>}
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

            <HourlyChart data={hourlyData} dailyData={dailyData} />

            {honeypotBreakdown.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>SENSORS</div>
                {honeypotBreakdown.map(h => (
                  <div key={h.honeypot} style={{ marginBottom: '6px' }}>
                    <div style={s.row}>
                      <span style={s.country}>{h.honeypot || 'unknown'}</span>
                      <span style={s.count}>{h.count.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px', paddingLeft: '4px' }}>
                      {(h.protocols || [])
                        .filter(p => p.protocol && p.protocol !== 'unknown')
                        .sort((a, b) => b.count - a.count)
                        .map(p => (
                          <span key={p.protocol} style={{
                            fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                            background: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).bg,
                            color: (PROTOCOL_COLORS[p.protocol] || PROTOCOL_COLORS.ssh).color,
                          }}>
                            {p.protocol.toUpperCase()} {p.count.toLocaleString()}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {eventTypeBreakdown.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>ATTACK TYPES</div>
                {eventTypeBreakdown.map(e => (
                  <div key={e.event_type}>
                    <div style={s.row}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: TYPE_COLOR(e.event_type), flexShrink: 0 }} />
                        <span style={{ color: '#94a3b8', fontSize: '9px' }}>{TYPE_LABEL(e.event_type)}</span>
                      </span>
                      <span style={s.count}>{e.count.toLocaleString()}</span>
                    </div>
                    <div style={s.bar}><div style={{ ...s.barFill, width: `${(e.count / maxTypeCount) * 100}%`, background: TYPE_COLOR(e.event_type) }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INTEL tab */}
        {activeTab === 'intel' && (
          <div style={s.tabContent}>
            {(credentialsData.top_usernames?.length > 0 || credentialsData.top_passwords?.length > 0) && (
              <div style={s.section}>
                <div style={s.label}>TOP CREDENTIALS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                  <div>
                    <div style={{ ...s.subLabel, color: '#60a5fa' }}>USERNAMES</div>
                    {credentialsData.top_usernames?.slice(0, 8).map((u, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                        <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{u.count}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ ...s.subLabel, color: '#fb923c' }}>PASSWORDS</div>
                    {credentialsData.top_passwords?.slice(0, 8).map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#fb923c', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.password}</span>
                        <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0, marginLeft: '4px' }}>{p.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {commandsData.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>TOP COMMANDS</div>
                {commandsData.slice(0, 8).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ color: '#f97316', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.command}</span>
                    <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{c.count}</span>
                  </div>
                ))}
              </div>
            )}
            {httpPathsData.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>TOP PATHS PROBED</div>
                {httpPathsData.slice(0, 8).map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ color: '#a78bfa', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                    <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{p.count}</span>
                  </div>
                ))}
              </div>
            )}
            {redisCommandsData.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>TOP REDIS COMMANDS</div>
                {redisCommandsData.slice(0, 8).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ color: '#fb923c', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.command}</span>
                    <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{c.count}</span>
                  </div>
                ))}
              </div>
            )}
            {orgsData.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>TOP PROVIDERS</div>
                {orgsData.slice(0, 8).map((o, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.org}</span>
                    <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{o.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {vulnsData.length > 0 && (
              <div style={s.section}>
                <div style={s.label}>PROBES DETECTED</div>
                {vulnsData.slice(0, 8).map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                      <span style={{ flexShrink: 0, fontSize: '8px', padding: '1px 4px', borderRadius: '3px', background: v.tier === 'cve' ? '#450a0a' : '#3d2700', color: v.tier === 'cve' ? '#ef4444' : '#fbbf24' }}>
                        {v.tier === 'cve' ? 'CVE' : 'TEC'}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
                    </span>
                    <span style={{ color: '#fbbf24', fontSize: '9px', flexShrink: 0 }}>{v.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <EventDetail event={selected} onClose={() => setSelected(null)} />
    </>
  )
}

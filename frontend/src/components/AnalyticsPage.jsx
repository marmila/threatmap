import { useState, useEffect } from 'react'
import { useWindowSize } from '../hooks/useWindowSize.js'

const BG = '#0a0d14'
const CARD = { background: '#0f1117', border: '1px solid #1e2535', borderRadius: '6px', padding: '16px' }
const MONO = "'Courier New', monospace"
const SECTION = {
  fontSize: '10px', letterSpacing: '3px', color: '#4ade80',
  borderBottom: '1px solid #1e2535', paddingBottom: '8px',
  marginBottom: '20px', marginTop: '36px',
}

function StatCard({ label, value, sub, color = '#4ade80', warn = false, trend = null }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '2px', marginBottom: '10px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <div style={{ fontSize: '26px', fontWeight: 'bold', color: warn ? '#f97316' : color }}>
          {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
        </div>
        {trend && (
          <span style={{ fontSize: '11px', color: trend.up ? '#4ade80' : '#f87171', flexShrink: 0 }}>
            {trend.up ? '↑' : '↓'}{trend.pct}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: '10px', color: '#475569' }}>{sub}</div>}
    </div>
  )
}

function HBarChart({ data, labelKey = 'label', valueKey = 'count', color = '#4ade80' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div>
      {data.map((item, i) => {
        const pct = (item[valueKey] / max) * 100
        return (
          <div key={i} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item[labelKey]}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                {Number(item[valueKey]).toLocaleString()}
              </span>
            </div>
            <div style={{ height: '4px', background: '#1e2535', borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HourlyBarChart({ data }) {
  const slots = Array.from({ length: 24 }, (_, h) => ({ h, count: 0 }))
  data.forEach(d => {
    const h = new Date(d.hour).getUTCHours()
    if (h >= 0 && h < 24) slots[h].count = d.count
  })
  const max = Math.max(...slots.map(s => s.count), 1)
  const MAX_H = 80
  const total = slots.reduce((s, x) => s + x.count, 0)
  const peak = slots.reduce((best, x) => x.count > best.count ? x : best, slots[0])

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>LAST 24H TOTAL</div>
          <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>{total.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK HOUR (UTC)</div>
          <div style={{ fontSize: '20px', color: '#f97316', fontWeight: 'bold' }}>{String(peak.h).padStart(2, '0')}:00</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK COUNT</div>
          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{peak.count.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', minWidth: '480px', height: `${MAX_H + 28}px` }}>
          {slots.map(({ h, count }) => {
            const barH = count > 0 ? Math.max(2, (count / max) * MAX_H) : 0
            const isPeak = count === max && count > 0
            return (
              <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                  <div
                    style={{ width: '100%', height: `${barH}px`, background: isPeak ? '#f97316' : '#4ade80', borderRadius: '2px 2px 0 0', opacity: 0.85 }}
                    title={`${String(h).padStart(2, '0')}:00 UTC — ${count.toLocaleString()} events`}
                  />
                </div>
                <div style={{ height: '1px', background: '#1e2535', width: '100%', marginTop: '4px' }} />
                <span style={{ fontSize: '8px', color: '#475569', marginTop: '3px' }}>
                  {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SensorVBarChart({ sensors, data }) {
  const COLORS = ['#4ade80', '#38bdf8', '#a78bfa', '#fb923c']
  const totals = data.map(d => sensors.reduce((s, hp) => s + (d[hp] || 0), 0))
  const max = Math.max(...totals, 1)
  const MAX_H = 140
  const periodTotal = totals.reduce((a, b) => a + b, 0)
  const peakIdx = totals.indexOf(Math.max(...totals))
  const peakDay = data[peakIdx]?.date?.slice(5) ?? '—'
  const peakVal = totals[peakIdx] ?? 0

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL (10D)</div>
          <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>{periodTotal.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK DAY</div>
          <div style={{ fontSize: '20px', color: '#f97316', fontWeight: 'bold' }}>{peakDay}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK COUNT</div>
          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{peakVal.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', minWidth: `${data.length * 54}px`, paddingBottom: '4px' }}>
          {data.map((d) => (
            <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '46px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', marginBottom: '6px', justifyContent: 'center' }}>
                {sensors.map((s, si) => {
                  const val = d[s] || 0
                  const h = val > 0 ? Math.max(2, (val / max) * MAX_H) : 0
                  return (
                    <div
                      key={s}
                      title={`${s.replace('honeypot-', '')}: ${val.toLocaleString()}`}
                      style={{ width: '16px', height: `${h}px`, background: COLORS[si % COLORS.length], borderRadius: '2px 2px 0 0', opacity: 0.85 }}
                    />
                  )
                })}
              </div>
              <div style={{ height: '1px', background: '#1e2535', width: '100%', marginBottom: '5px' }} />
              <span style={{ fontSize: '9px', color: '#475569', whiteSpace: 'nowrap' }}>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '14px', flexWrap: 'wrap' }}>
        {sensors.map((s, si) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: COLORS[si % COLORS.length], borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s.replace('honeypot-', '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SW_CATEGORIES = ['cowrie', 'opencanary']
const SW_COLORS = { cowrie: '#fbbf24', opencanary: '#a78bfa' }
const SW_LABELS = { cowrie: 'Cowrie (SSH/Telnet)', opencanary: 'OpenCanary (HTTP/FTP/MySQL/Redis/RDP/MSSQL)' }

function StackedVBarChart({ data }) {
  const totals = data.map(d => SW_CATEGORIES.reduce((s, c) => s + (d[c] || 0), 0))
  const max = Math.max(...totals, 1)
  const MAX_H = 140
  const periodTotal = totals.reduce((a, b) => a + b, 0)
  const peakIdx = totals.indexOf(Math.max(...totals))
  const peakDay = data[peakIdx]?.date?.slice(5) ?? '—'
  const peakVal = totals[peakIdx] ?? 0

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL (10D)</div>
          <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>{periodTotal.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK DAY</div>
          <div style={{ fontSize: '20px', color: '#f97316', fontWeight: 'bold' }}>{peakDay}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK COUNT</div>
          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{peakVal.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', minWidth: `${data.length * 54}px`, paddingBottom: '4px' }}>
          {data.map((d) => (
            <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '46px' }}>
              <div style={{ width: '24px', height: `${MAX_H}px`, display: 'flex', flexDirection: 'column-reverse', justifyContent: 'flex-start', overflow: 'hidden', borderRadius: '2px 2px 0 0' }}>
                {SW_CATEGORIES.map(cat => {
                  const val = d[cat] || 0
                  if (!val) return null
                  const h = (val / max) * MAX_H
                  return (
                    <div key={cat} title={`${cat}: ${val.toLocaleString()}`} style={{ height: `${h}px`, background: SW_COLORS[cat], flexShrink: 0, opacity: 0.85 }} />
                  )
                })}
              </div>
              <div style={{ height: '1px', background: '#1e2535', width: '100%', marginBottom: '5px' }} />
              <span style={{ fontSize: '9px', color: '#475569', whiteSpace: 'nowrap' }}>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
        {SW_CATEGORIES.map(cat => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', background: SW_COLORS[cat], borderRadius: '2px', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{SW_LABELS[cat]}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '20px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['DATE', 'COWRIE', 'OPENCANARY', 'OC %'].map(h => (
                <th key={h} style={{ textAlign: 'right', color: '#475569', fontSize: '9px', letterSpacing: '1px', paddingBottom: '8px', paddingRight: '16px', fontWeight: 'normal' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const cowrie = d.cowrie || 0
              const oc = d.opencanary || 0
              const total = cowrie + oc
              const ocPct = total > 0 ? ((oc / total) * 100).toFixed(1) : '0.0'
              return (
                <tr key={d.date} style={{ borderTop: '1px solid #1a2535' }}>
                  <td style={{ padding: '6px 16px 6px 0', color: '#475569', fontSize: '10px', textAlign: 'right' }}>{d.date.slice(5)}</td>
                  <td style={{ padding: '6px 16px 6px 0', color: '#fbbf24', fontSize: '10px', textAlign: 'right' }}>{cowrie.toLocaleString()}</td>
                  <td style={{ padding: '6px 16px 6px 0', color: '#a78bfa', fontSize: '10px', textAlign: 'right' }}>{oc.toLocaleString()}</td>
                  <td style={{ padding: '6px 0 6px 0', color: '#64748b', fontSize: '10px', textAlign: 'right' }}>{ocPct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoreBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          {count.toLocaleString()} <span style={{ color: '#475569' }}>({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div style={{ height: '6px', background: '#1e2535', borderRadius: '3px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function HeatGrid({ data }) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  const lookup = {}
  let maxCount = 0
  data.forEach(({ dow, hour, count }) => {
    if (!lookup[dow]) lookup[dow] = {}
    lookup[dow][hour] = count
    if (count > maxCount) maxCount = count
  })

  const getColor = (count) => {
    if (!count || maxCount === 0) return '#0f1117'
    const r = count / maxCount
    if (r < 0.1) return '#1a2535'
    if (r < 0.25) return '#2d1b4e'
    if (r < 0.5) return '#6b21a8'
    if (r < 0.75) return '#be185d'
    return '#ef4444'
  }

  const totalAttacks = data.reduce((s, d) => s + d.count, 0)
  const peakCell = data.reduce((best, d) => d.count > (best?.count || 0) ? d : best, null)
  const peakDay = peakCell ? DAYS[peakCell.dow - 1] : '—'
  const peakHour = peakCell ? `${String(peakCell.hour).padStart(2, '0')}:00` : '—'

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL (7D)</div>
          <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>{totalAttacks.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK WINDOW</div>
          <div style={{ fontSize: '20px', color: '#f97316', fontWeight: 'bold' }}>{peakDay} {peakHour}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '1px', marginBottom: '4px' }}>PEAK COUNT</div>
          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{peakCell ? peakCell.count.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '540px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, 1fr)', gap: '2px', marginBottom: '4px' }}>
            <div />
            {HOURS.map(h => (
              <div key={h} style={{ fontSize: '8px', color: '#475569', textAlign: 'center' }}>
                {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
              </div>
            ))}
          </div>
          {DAYS.map((day, i) => (
            <div key={day} style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, 1fr)', gap: '2px', marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#475569', display: 'flex', alignItems: 'center' }}>{day}</div>
              {HOURS.map(h => {
                const count = (lookup[i + 1] || {})[h] || 0
                return (
                  <div
                    key={h}
                    title={`${day} ${String(h).padStart(2, '0')}:00 — ${count} events`}
                    style={{ height: '20px', background: getColor(count), borderRadius: '2px' }}
                  />
                )
              })}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
            <span style={{ fontSize: '9px', color: '#475569' }}>LOW</span>
            {['#1a2535', '#2d1b4e', '#6b21a8', '#be185d', '#ef4444'].map(c => (
              <div key={c} style={{ width: '24px', height: '10px', background: c, borderRadius: '2px' }} />
            ))}
            <span style={{ fontSize: '9px', color: '#475569' }}>HIGH</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Empty({ msg = 'No data yet' }) {
  return <div style={{ fontSize: '11px', color: '#475569', padding: '12px 0' }}>{msg}</div>
}

const flag = (code) => {
  if (!code || code.length !== 2) return null
  return <img src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`} alt={code} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
}

const PROTO_COLOR = {
  ssh: '#fbbf24', http: '#a78bfa', ftp: '#22d3ee',
  mysql: '#4ade80', redis: '#fb923c', telnet: '#f87171',
  mssql: '#14b8a6', rdp: '#ec4899', unknown: '#475569',
}

function ProtoTag({ proto }) {
  return (
    <span style={{
      background: '#1e2535', border: `1px solid ${PROTO_COLOR[proto] || '#475569'}`,
      color: PROTO_COLOR[proto] || '#475569',
      borderRadius: '3px', padding: '1px 5px', fontSize: '9px', letterSpacing: '1px',
      marginRight: '3px', whiteSpace: 'nowrap',
    }}>{proto?.toUpperCase()}</span>
  )
}

export default function AnalyticsPage({ onBack }) {
  const { isMobile } = useWindowSize()
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [intelligence, setIntelligence] = useState(null)
  const [ips, setIps] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [sensorDaily, setSensorDaily] = useState(null)
  const [softwareDaily, setSoftwareDaily] = useState(null)
  const [hourly, setHourly] = useState([])
  const [credentials, setCredentials] = useState(null)
  const [commands, setCommands] = useState([])
  const [httpPaths, setHttpPaths] = useState([])
  const [redisCmds, setRedisCmds] = useState([])
  const [vulns, setVulns] = useState([])
  const [statsData, setStatsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const responses = await Promise.all([
        fetch('/api/analytics/overview'),
        fetch('/api/analytics/timeline?days=7'),
        fetch('/api/analytics/intelligence'),
        fetch('/api/analytics/ips'),
        fetch('/api/health/pipeline'),
        fetch('/api/analytics/daily-by-sensor?days=10'),
        fetch('/api/analytics/daily-by-software?days=10'),
        fetch('/api/stats/hourly'),
        fetch('/api/stats/credentials'),
        fetch('/api/stats/commands'),
        fetch('/api/stats/http-paths'),
        fetch('/api/stats/redis-commands'),
        fetch('/api/stats/vulns'),
        fetch('/api/stats'),
      ])
      const [ov, tl, int, ip, pl, sd, sw, hr, creds, cmds, paths, redis, vs, st] = await Promise.all(
        responses.map(r => r.json())
      )
      setOverview(ov)
      setTimeline(tl)
      setIntelligence(int)
      setIps(ip)
      setPipeline(pl)
      setSensorDaily(sd)
      setSoftwareDaily(sw)
      setHourly(hr)
      setCredentials(creds)
      setCommands(cmds)
      setHttpPaths(paths)
      setRedisCmds(redis)
      setVulns(vs)
      setStatsData(st)
      setRefreshedAt(new Date())
    } catch (e) {
      console.error('Analytics load failed', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'auto'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => { load() }, [])

  const col2 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }
  const col3 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }
  const SCORE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444']
  const totalScoreChecked = intelligence ? intelligence.score_distribution.reduce((s, b) => s + b.count, 0) : 0

  const trendToday = overview && overview.events_yesterday > 0
    ? { pct: Math.round(Math.abs((overview.events_today - overview.events_yesterday) / overview.events_yesterday * 100)), up: overview.events_today >= overview.events_yesterday }
    : null

  const shodanMonthUsed = overview?.shodan_this_month || 0

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#e2e8f0', fontFamily: MONO, padding: isMobile ? '16px' : '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={onBack} style={{
            background: 'none', border: '1px solid #1e2535', color: '#94a3b8',
            fontFamily: MONO, fontSize: '11px', letterSpacing: '1px',
            padding: '7px 14px', borderRadius: '4px', cursor: 'pointer',
          }}>← GLOBE</button>
          <span style={{ fontSize: isMobile ? '13px' : '17px', letterSpacing: '4px', color: '#4ade80' }}>
            THREAT ANALYTICS
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {refreshedAt && (
            <span style={{ fontSize: '10px', color: '#475569' }}>
              {refreshedAt.toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} disabled={loading} style={{
            background: 'none', border: '1px solid #1e2535', color: loading ? '#2d3748' : '#64748b',
            fontFamily: MONO, fontSize: '10px', letterSpacing: '1px',
            padding: '6px 12px', borderRadius: '4px', cursor: loading ? 'default' : 'pointer',
          }}>{loading ? '...' : '↺ REFRESH'}</button>
        </div>
      </div>

      {loading && !overview ? (
        <div style={{ color: '#475569', fontSize: '12px', letterSpacing: '2px', textAlign: 'center', paddingTop: '80px' }}>
          LOADING ANALYTICS...
        </div>
      ) : (
        <>
          {/* Overview cards — 4-col desktop, 2-col mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
            <StatCard label="TOTAL EVENTS" value={overview?.total_events} sub="all time" />
            <StatCard label="EVENTS TODAY" value={overview?.events_today} color="#38bdf8" trend={trendToday} sub="vs yesterday" />
            <StatCard label="KNOWN THREATS TODAY" value={overview?.known_threats_today} color="#ef4444" sub="intel-flagged IPs" />
            <StatCard label="UNIQUE IPs" value={overview?.unique_ips} sub="all time" color="#a78bfa" />
            <StatCard
              label="ABUSEIPDB TODAY"
              value={overview?.abuse_today}
              warn={(overview?.abuse_today ?? 0) > 800}
              color="#fb923c"
              sub="checks (1,000/day limit)"
            />
            <StatCard
              label="THREAT RATE"
              value={overview ? `${overview.threat_rate}%` : '—'}
              color="#f87171"
              sub="score ≥ 50 of checked IPs"
            />
          </div>

          {/* Last 24 hours */}
          <div style={SECTION}>LAST 24 HOURS</div>
          <div style={CARD}>
            {hourly.length > 0 ? <HourlyBarChart data={hourly} /> : <Empty msg="No events in the last 24 hours" />}
          </div>

          {/* Geographic distribution */}
          {statsData && (
            <>
              <div style={SECTION}>GEOGRAPHIC DISTRIBUTION</div>
              <div style={col2}>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#4ade80', letterSpacing: '2px', marginBottom: '16px' }}>TOP COUNTRIES</div>
                  {statsData.top_countries?.length > 0 ? (
                    <div>
                      {statsData.top_countries.map(c => {
                        const max = statsData.top_countries[0].count
                        const pct = (c.count / max) * 100
                        return (
                          <div key={c.country} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', gap: '8px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {flag(c.country_code)}{c.country || '—'}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{c.count.toLocaleString()}</span>
                            </div>
                            <div style={{ height: '4px', background: '#1e2535', borderRadius: '2px' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#4ade80', borderRadius: '2px' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : <Empty />}
                </div>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#a78bfa', letterSpacing: '2px', marginBottom: '16px' }}>PROTOCOL BREAKDOWN</div>
                  {statsData.protocol_breakdown?.length > 0 ? (
                    <div>
                      {statsData.protocol_breakdown.map(p => {
                        const max = statsData.protocol_breakdown[0].count
                        const pct = (p.count / max) * 100
                        const color = PROTO_COLOR[p.protocol] || '#475569'
                        return (
                          <div key={p.protocol} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                              <span style={{ fontSize: '11px', color }}>
                                {p.protocol?.toUpperCase() || '—'}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{p.count.toLocaleString()}</span>
                            </div>
                            <div style={{ height: '4px', background: '#1e2535', borderRadius: '2px' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : <Empty />}
                </div>
              </div>
            </>
          )}

          {/* Credential intelligence */}
          {(credentials || commands.length > 0) && (
            <>
              <div style={SECTION}>CREDENTIAL INTELLIGENCE</div>
              <div style={col3}>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#fbbf24', letterSpacing: '2px', marginBottom: '16px' }}>TOP USERNAMES</div>
                  {credentials?.top_usernames?.length > 0 ? (
                    <HBarChart data={credentials.top_usernames.map(u => ({ label: u.username, count: u.count }))} color="#fbbf24" />
                  ) : <Empty msg="No credentials logged yet" />}
                </div>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#fb923c', letterSpacing: '2px', marginBottom: '16px' }}>TOP PASSWORDS</div>
                  {credentials?.top_passwords?.length > 0 ? (
                    <HBarChart data={credentials.top_passwords.map(p => ({ label: p.password, count: p.count }))} color="#fb923c" />
                  ) : <Empty msg="No passwords logged yet" />}
                </div>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#f87171', letterSpacing: '2px', marginBottom: '16px' }}>TOP SHELL COMMANDS</div>
                  {commands.length > 0 ? (
                    <HBarChart data={commands.map(c => ({ label: c.command, count: c.count }))} color="#f87171" />
                  ) : <Empty msg="No commands yet — no successful SSH sessions" />}
                </div>
              </div>
            </>
          )}

          {/* Attack techniques */}
          {(vulns.length > 0 || httpPaths.length > 0 || redisCmds.length > 0) && (
            <>
              <div style={SECTION}>ATTACK TECHNIQUES</div>
              <div style={col2}>
                <div style={CARD}>
                  <div style={{ fontSize: '10px', color: '#ef4444', letterSpacing: '2px', marginBottom: '16px' }}>PROBE SIGNATURES DETECTED</div>
                  {vulns.length > 0 ? (
                    <HBarChart data={vulns.map(v => ({ label: v.label, count: v.count }))} color="#ef4444" />
                  ) : <Empty msg="No signatures detected yet" />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={CARD}>
                    <div style={{ fontSize: '10px', color: '#a78bfa', letterSpacing: '2px', marginBottom: '16px' }}>HTTP PATHS PROBED</div>
                    {httpPaths.length > 0 ? (
                      <HBarChart data={httpPaths.map(p => ({ label: p.path, count: p.count }))} color="#a78bfa" />
                    ) : <Empty msg="No HTTP probes yet" />}
                  </div>
                  <div style={CARD}>
                    <div style={{ fontSize: '10px', color: '#14b8a6', letterSpacing: '2px', marginBottom: '16px' }}>REDIS COMMANDS</div>
                    {redisCmds.length > 0 ? (
                      <HBarChart data={redisCmds.map(r => ({ label: r.command, count: r.count }))} color="#14b8a6" />
                    ) : <Empty msg="No Redis commands yet" />}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Attack density heatmap */}
          <div style={SECTION}>ATTACK DENSITY — 7 DAY HEATMAP</div>
          <div style={CARD}>
            <HeatGrid data={timeline} />
          </div>

          {/* Cowrie vs OpenCanary */}
          {softwareDaily?.data?.length > 0 && (
            <>
              <div style={SECTION}>COWRIE vs OPENCANARY — LAST 10 DAYS</div>
              <div style={CARD}>
                <StackedVBarChart data={softwareDaily.data} />
              </div>
            </>
          )}

          {/* IP analysis today */}
          <div style={SECTION}>IP ANALYSIS — TODAY</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <StatCard label="UNIQUE IPs TODAY" value={ips?.unique_ips_today} color="#4ade80" />
            <StatCard label="NEW IPs TODAY" value={ips?.new_ips_today} color="#f97316" sub="first time ever seen" />
            <StatCard label="REPEAT IPs" value={ips?.repeat_ips_today} color="#94a3b8" sub="seen on previous days" />
            <StatCard label="CACHE HITS" value={ips?.cache_hits_today} color="#22d3ee" sub="no API credit used" />
          </div>

          {ips && ips.unique_ips_today > 0 && (
            <div style={{ ...CARD, marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px' }}>ABUSEIPDB CACHE HIT RATE TODAY</span>
                <span style={{ fontSize: '11px', color: '#22d3ee' }}>
                  {Math.round(ips.cache_hits_today / ips.unique_ips_today * 100)}%
                  <span style={{ color: '#475569', marginLeft: '8px' }}>
                    ({ips.cache_hits_today} cache · {ips.abuse_api_calls_today} API)
                  </span>
                </span>
              </div>
              <div style={{ height: '8px', background: '#1e2535', borderRadius: '4px' }}>
                <div style={{
                  height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #22d3ee, #4ade80)',
                  width: `${Math.round(ips.cache_hits_today / ips.unique_ips_today * 100)}%`,
                }} />
              </div>
            </div>
          )}

          {ips?.top_ips_today?.length > 0 && (
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#4ade80', letterSpacing: '2px', marginBottom: '16px' }}>TOP ATTACKERS TODAY</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      {['#', 'IP', 'COUNTRY', 'ORG / ISP', 'EVENTS', 'PROTOCOLS', 'ABUSE', 'THREAT'].map(h => (
                        <th key={h} style={{ textAlign: 'left', color: '#475569', fontSize: '9px', letterSpacing: '1px', paddingBottom: '12px', paddingRight: '16px', fontWeight: 'normal' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ips.top_ips_today.map((ip, i) => (
                      <tr key={ip.ip} style={{ borderTop: '1px solid #1a2535' }}>
                        <td style={{ padding: '8px 16px 8px 0', color: '#2d3748', width: '28px' }}>{i + 1}</td>
                        <td style={{ padding: '8px 16px 8px 0', color: '#e2e8f0', fontFamily: MONO, fontSize: '11px', whiteSpace: 'nowrap' }}>{ip.ip}</td>
                        <td style={{ padding: '8px 16px 8px 0', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {flag(ip.country_code)}{ip.country}
                        </td>
                        <td style={{ padding: '8px 16px 8px 0', color: '#64748b', maxWidth: isMobile ? '80px' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ip.org || ip.isp || '—'}
                        </td>
                        <td style={{ padding: '8px 16px 8px 0', color: '#4ade80', fontWeight: 'bold' }}>{ip.count.toLocaleString()}</td>
                        <td style={{ padding: '8px 16px 8px 0', whiteSpace: 'nowrap' }}>
                          {(ip.protocols || []).sort().map(p => <ProtoTag key={p} proto={p} />)}
                        </td>
                        <td style={{ padding: '8px 16px 8px 0' }}>
                          <span style={{ color: ip.abuse_score >= 75 ? '#ef4444' : ip.abuse_score >= 50 ? '#f97316' : ip.abuse_score >= 25 ? '#eab308' : '#22c55e', fontWeight: 'bold' }}>
                            {ip.abuse_score ?? '—'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 0 8px 0' }}>
                          {ip.known_threat
                            ? <span style={{ color: '#ef4444', fontSize: '10px', letterSpacing: '1px' }}>● THREAT</span>
                            : <span style={{ color: '#1e2535', fontSize: '10px' }}>—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Shodan intelligence */}
          <div style={SECTION}>SHODAN INTELLIGENCE</div>
          <div style={col2}>
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#f87171', letterSpacing: '2px', marginBottom: '16px' }}>TOP CVEs DETECTED</div>
              {intelligence?.top_cves?.length > 0 ? (
                <HBarChart
                  data={intelligence.top_cves.map(d => ({ label: d.cve, count: d.count }))}
                  color="#f87171"
                />
              ) : <Empty msg="No CVEs — attackers not indexed in Shodan or have no known vulns" />}
            </div>
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#a78bfa', letterSpacing: '2px', marginBottom: '16px' }}>OPEN PORT LANDSCAPE</div>
              {intelligence?.top_ports?.length > 0 ? (
                <HBarChart
                  data={intelligence.top_ports.map(d => ({ label: `Port ${d.port}`, count: d.count }))}
                  color="#a78bfa"
                />
              ) : <Empty />}
            </div>
          </div>

          {/* Top attacker networks */}
          {intelligence?.top_orgs?.length > 0 && (
            <>
              <div style={SECTION}>TOP ATTACKER NETWORKS</div>
              <div style={CARD}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        {['#', 'ORGANIZATION / HOSTING', 'EVENTS', 'UNIQUE IPs', 'EVT/IP'].map(h => (
                          <th key={h} style={{ textAlign: 'left', color: '#475569', fontSize: '9px', letterSpacing: '1px', paddingBottom: '12px', paddingRight: '20px', fontWeight: 'normal' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence.top_orgs.map((org, i) => {
                        const evtPerIp = org.unique_ips > 0 ? (org.events / org.unique_ips).toFixed(1) : '—'
                        return (
                          <tr key={i} style={{ borderTop: '1px solid #1a2535' }}>
                            <td style={{ padding: '9px 20px 9px 0', color: '#2d3748', width: '32px' }}>{i + 1}</td>
                            <td style={{ padding: '9px 20px 9px 0', color: '#e2e8f0', maxWidth: isMobile ? '120px' : '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {org.org}
                            </td>
                            <td style={{ padding: '9px 20px 9px 0', color: '#4ade80', fontWeight: 'bold' }}>
                              {org.events.toLocaleString()}
                            </td>
                            <td style={{ padding: '9px 20px 9px 0', color: '#94a3b8' }}>
                              {org.unique_ips.toLocaleString()}
                            </td>
                            <td style={{ padding: '9px 0 9px 0', color: '#64748b' }}>
                              {evtPerIp}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* API usage */}
          <div style={SECTION}>API USAGE — LAST 7 DAYS</div>
          <div style={col2}>

            {/* AbuseIPDB */}
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#fb923c', letterSpacing: '2px', marginBottom: '4px' }}>ABUSEIPDB</div>
              <div style={{ fontSize: '10px', color: '#475569', marginBottom: '16px' }}>1,000 checks/day · free tier</div>

              <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px', marginBottom: '10px' }}>DAILY CHECKS</div>
              {intelligence?.abuse_daily?.length > 0 ? (
                <HBarChart
                  data={intelligence.abuse_daily.map(d => ({ label: d.date.slice(5), count: d.count }))}
                  color="#fb923c"
                />
              ) : <Empty />}

              <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px', marginBottom: '12px', marginTop: '24px' }}>
                SCORE DISTRIBUTION
                <span style={{ color: '#2d3748', marginLeft: '8px' }}>({totalScoreChecked.toLocaleString()} IPs)</span>
              </div>
              {intelligence?.score_distribution?.length > 0
                ? intelligence.score_distribution.map((b, i) => (
                  <ScoreBar key={b.label} label={b.label} count={b.count} total={totalScoreChecked} color={SCORE_COLORS[i] || '#64748b'} />
                ))
                : <Empty />
              }
            </div>

            {/* Shodan */}
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#22d3ee', letterSpacing: '2px', marginBottom: '4px' }}>SHODAN</div>
              <div style={{ fontSize: '10px', color: '#475569', marginBottom: '16px' }}>100 credits/month · membership plan</div>

              {/* Monthly lookup counter */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px' }}>HOST LOOKUPS THIS MONTH</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#22d3ee' }}>
                    {shodanMonthUsed.toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#2d3748' }}>host lookups are free — no credit cost on membership plan</div>
              </div>

              {/* Coverage */}
              {intelligence?.shodan_coverage && (() => {
                const { has_data = 0, no_data = 0 } = intelligence.shodan_coverage
                const total = has_data + no_data
                const pct = total > 0 ? Math.round(has_data / total * 100) : 0
                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px', marginBottom: '10px' }}>COVERAGE</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Has Shodan data</span>
                      <span style={{ fontSize: '11px', color: '#22d3ee' }}>{has_data.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Not indexed (404)</span>
                      <span style={{ fontSize: '11px', color: '#475569' }}>{no_data.toLocaleString()} ({100 - pct}%)</span>
                    </div>
                    <div style={{ height: '6px', background: '#1e2535', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: '3px' }} />
                    </div>
                  </div>
                )
              })()}

              <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px', marginBottom: '10px' }}>DAILY LOOKUPS</div>
              {intelligence?.shodan_daily?.length > 0 ? (
                <HBarChart
                  data={intelligence.shodan_daily.map(d => ({ label: d.date.slice(5), count: d.count }))}
                  color="#22d3ee"
                />
              ) : <Empty />}

              {intelligence?.top_tags?.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '1px', marginBottom: '10px', marginTop: '24px' }}>TOP TAGS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {intelligence.top_tags.map(({ tag, count }) => (
                      <span key={tag} style={{
                        background: '#1e2535', border: '1px solid #2d3748',
                        borderRadius: '4px', padding: '3px 8px',
                        fontSize: '10px', color: '#94a3b8',
                      }}>
                        {tag} <span style={{ color: '#22d3ee' }}>{count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Pipeline health */}
          {pipeline && (
            <>
              <div style={SECTION}>PIPELINE HEALTH</div>
              <div style={{ ...col2, marginBottom: '16px' }}>
                <div style={CARD}>
                  <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '2px', marginBottom: '14px' }}>SENSORS</div>
                  {pipeline.sensors.map(s => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#475569' }}>{s.age_label}</span>
                        <span style={{
                          width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                          background: s.status === 'green' ? '#4ade80' : s.status === 'yellow' ? '#fbbf24' : '#ef4444',
                          boxShadow: s.status === 'green' ? '0 0 6px #4ade80' : s.status === 'yellow' ? '0 0 6px #fbbf24' : '0 0 6px #ef4444',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={CARD}>
                  <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '2px', marginBottom: '14px' }}>PROTOCOLS</div>
                  {pipeline.protocols.map(p => (
                    <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{p.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#475569' }}>{p.age_label}</span>
                        <span style={{
                          width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                          background: p.status === 'green' ? '#4ade80' : p.status === 'yellow' ? '#fbbf24' : '#ef4444',
                          boxShadow: p.status === 'green' ? '0 0 6px #4ade80' : p.status === 'yellow' ? '0 0 6px #fbbf24' : '0 0 6px #ef4444',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Events by VM */}
          {sensorDaily?.data?.length > 0 && (
            <>
              <div style={SECTION}>EVENTS BY VM — LAST 10 DAYS</div>
              <div style={CARD}>
                <SensorVBarChart sensors={sensorDaily.sensors} data={sensorDaily.data} />
              </div>
            </>
          )}

          <div style={{ height: '48px' }} />
        </>
      )}
    </div>
  )
}

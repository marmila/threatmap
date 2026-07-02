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

function StatCard({ label, value, sub, color = '#4ade80', warn = false }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '2px', marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color: warn ? '#f97316' : color, marginBottom: '4px' }}>
        {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
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

export default function AnalyticsPage({ onBack }) {
  const { isMobile } = useWindowSize()
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [intelligence, setIntelligence] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [ovRes, tlRes, intRes] = await Promise.all([
        fetch('/api/analytics/overview'),
        fetch('/api/analytics/timeline?days=7'),
        fetch('/api/analytics/intelligence'),
      ])
      const [ov, tl, int] = await Promise.all([ovRes.json(), tlRes.json(), intRes.json()])
      setOverview(ov)
      setTimeline(tl)
      setIntelligence(int)
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
  const SCORE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444']
  const totalScoreChecked = intelligence ? intelligence.score_distribution.reduce((s, b) => s + b.count, 0) : 0

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#e2e8f0', fontFamily: MONO, padding: isMobile ? '16px' : '24px 32px' }}>

      {/* ── Header ── */}
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
          {/* ── Overview cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '12px' }}>
            <StatCard label="TOTAL EVENTS" value={overview?.total_events} sub="all time" />
            <StatCard label="EVENTS TODAY" value={overview?.events_today} color="#38bdf8" />
            <StatCard label="UNIQUE IPs" value={overview?.unique_ips} sub="all time" color="#a78bfa" />
            <StatCard
              label="ABUSEIPDB TODAY"
              value={overview?.abuse_today}
              warn={(overview?.abuse_today ?? 0) > 800}
              color="#fb923c"
              sub={`of ${overview?.total_checked?.toLocaleString() ?? '—'} total checked`}
            />
            <StatCard label="SHODAN CACHED" value={overview?.shodan_total} color="#22d3ee" sub="unique IPs with data" />
            <StatCard
              label="THREAT RATE"
              value={overview ? `${overview.threat_rate}%` : '—'}
              color="#f87171"
              sub="score ≥ 50 of checked IPs"
            />
          </div>

          {/* ── Attack heatmap ── */}
          <div style={SECTION}>ATTACK DENSITY — 7 DAY HEATMAP</div>
          <div style={CARD}>
            <HeatGrid data={timeline} />
          </div>

          {/* ── API usage ── */}
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

          {/* ── Shodan intelligence ── */}
          <div style={SECTION}>SHODAN INTELLIGENCE</div>
          <div style={col2}>
            <div style={CARD}>
              <div style={{ fontSize: '10px', color: '#f87171', letterSpacing: '2px', marginBottom: '16px' }}>TOP CVEs DETECTED</div>
              {intelligence?.top_cves?.length > 0 ? (
                <HBarChart
                  data={intelligence.top_cves.map(d => ({ label: d.cve, count: d.count }))}
                  color="#f87171"
                />
              ) : <Empty msg="No CVEs detected yet — attackers aren't indexed in Shodan or have no known vulns" />}
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

          {/* ── Top attacker networks ── */}
          {intelligence?.top_orgs?.length > 0 && (
            <>
              <div style={SECTION}>TOP ATTACKER NETWORKS</div>
              <div style={CARD}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        {['#', 'ORGANIZATION / HOSTING', 'EVENTS', 'UNIQUE IPs'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', color: '#475569', fontSize: '9px',
                            letterSpacing: '1px', paddingBottom: '12px', paddingRight: '20px', fontWeight: 'normal',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence.top_orgs.map((org, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #1a2535' }}>
                          <td style={{ padding: '9px 20px 9px 0', color: '#2d3748', width: '32px' }}>{i + 1}</td>
                          <td style={{
                            padding: '9px 20px 9px 0', color: '#e2e8f0',
                            maxWidth: isMobile ? '130px' : '320px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{org.org}</td>
                          <td style={{ padding: '9px 20px 9px 0', color: '#4ade80', fontWeight: 'bold' }}>
                            {org.events.toLocaleString()}
                          </td>
                          <td style={{ padding: '9px 0 9px 0', color: '#94a3b8' }}>
                            {org.unique_ips.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div style={{ height: '48px' }} />
        </>
      )}
    </div>
  )
}

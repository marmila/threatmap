import { useState, useEffect, useCallback, useRef } from 'react'
import GlobeMap from './components/GlobeMap.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useWindowSize } from './hooks/useWindowSize.js'

const MAX_ARCS = 300
const ARC_TTL_MS = 8000

const LEGEND_ITEMS = [
  { color: '#ef4444', label: 'Login success' },
  { color: '#f97316', label: 'Command executed' },
  { color: '#fbbf24', label: 'Login attempt' },
  { color: '#64748b', label: 'Connection' },
]

function Legend() {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '24px',
      background: 'rgba(15,17,23,0.85)', backdropFilter: 'blur(8px)',
      border: '1px solid #1e2535', borderRadius: '6px',
      padding: '12px 14px', fontFamily: "'Courier New', monospace", zIndex: 10,
    }}>
      <div style={{ color: '#4ade80', fontSize: '9px', letterSpacing: '2px', marginBottom: '8px' }}>
        ARC COLORS
      </div>
      {LEGEND_ITEMS.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <div style={{ width: '9px', height: '9px', background: color, borderRadius: '2px', flexShrink: 0 }} />
          <span style={{ color: '#94a3b8', fontSize: '10px' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const { isMobile } = useWindowSize()
  const [arcs, setArcs] = useState([])
  const [liveEvents, setLiveEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [topCountries, setTopCountries] = useState([])
  const [connected, setConnected] = useState(false)
  const [topIps, setTopIps] = useState([])
  const [hourlyData, setHourlyData] = useState([])
  const arcTimers = useRef([])

  const handleEvent = useCallback((event) => {
    const arc = { ...event, id: `${Date.now()}-${Math.random()}` }

    setArcs((prev) => {
      const next = [arc, ...prev].slice(0, MAX_ARCS)
      return next
    })

    setLiveEvents((prev) => [event, ...prev].slice(0, 50))
    setTotal((n) => n + 1)
    setTopCountries((prev) => {
      const map = Object.fromEntries(prev.map((c) => [c.country, c.count]))
      const key = event.src_country || 'Unknown'
      map[key] = (map[key] || 0) + 1
      return Object.entries(map)
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    })

    const timer = setTimeout(() => {
      setArcs((prev) => prev.filter((a) => a.id !== arc.id))
    }, ARC_TTL_MS)
    arcTimers.current.push(timer)
  }, [])

  useWebSocket(handleEvent, {
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [evRes, stRes, hrRes] = await Promise.all([
          fetch('/api/events/recent?limit=200'),
          fetch('/api/stats'),
          fetch('/api/stats/hourly'),
        ])
        const events = await evRes.json()
        const stats = await stRes.json()
        const hourly = await hrRes.json()
        setTotal(stats.total || 0)
        setTopCountries(stats.top_countries || [])
        setTopIps(stats.top_ips || [])
        setHourlyData(hourly || [])
        setLiveEvents(events.slice(0, 50))
        setArcs(events.slice(0, 100).map((e) => ({ ...e, id: `hist-${Math.random()}` })))
      } catch {}
    }
    load()
    const hourlyRefresh = setInterval(async () => {
      try {
        const r = await fetch('/api/stats/hourly')
        setHourlyData(await r.json())
      } catch {}
    }, 600000)
    return () => {
      clearInterval(hourlyRefresh)
      arcTimers.current.forEach(clearTimeout)
    }
  }, [])

  return (
    <>
      <GlobeMap arcs={arcs} />
      {!isMobile && <Legend />}
      <StatsPanel
        events={liveEvents}
        total={total}
        topCountries={topCountries}
        topIps={topIps}
        connected={connected}
        isMobile={isMobile}
        hourlyData={hourlyData}
      />
    </>
  )
}

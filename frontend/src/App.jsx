import { useState, useEffect, useCallback, useRef } from 'react'
import GlobeMap from './components/GlobeMap.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'

const MAX_ARCS = 300
const ARC_TTL_MS = 8000

export default function App() {
  const [arcs, setArcs] = useState([])
  const [liveEvents, setLiveEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [topCountries, setTopCountries] = useState([])
  const [connected, setConnected] = useState(false)
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
        const [evRes, stRes] = await Promise.all([
          fetch('/api/events/recent?limit=200'),
          fetch('/api/stats'),
        ])
        const events = await evRes.json()
        const stats = await stRes.json()
        setTotal(stats.total || 0)
        setTopCountries(stats.top_countries || [])
        setLiveEvents(events.slice(0, 50))
        setArcs(events.slice(0, 100).map((e) => ({ ...e, id: `hist-${Math.random()}` })))
      } catch {}
    }
    load()
    return () => arcTimers.current.forEach(clearTimeout)
  }, [])

  return (
    <>
      <GlobeMap arcs={arcs} />
      <StatsPanel
        events={liveEvents}
        total={total}
        topCountries={topCountries}
        connected={connected}
      />
    </>
  )
}

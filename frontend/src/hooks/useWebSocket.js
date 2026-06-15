import { useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`

export function useWebSocket(onEvent) {
  const ws = useRef(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    ws.current = new WebSocket(WS_URL)

    ws.current.onmessage = (e) => {
      try {
        onEventRef.current(JSON.parse(e.data))
      } catch {}
    }

    ws.current.onclose = () => {
      setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])
}

import { useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`

export function useWebSocket(onEvent, { onOpen, onClose } = {}) {
  const ws = useRef(null)
  const onEventRef = useRef(onEvent)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  onEventRef.current = onEvent
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  const connect = useCallback(() => {
    ws.current = new WebSocket(WS_URL)

    ws.current.onopen = () => {
      onOpenRef.current?.()
    }

    ws.current.onmessage = (e) => {
      try {
        onEventRef.current(JSON.parse(e.data))
      } catch {}
    }

    ws.current.onclose = () => {
      onCloseRef.current?.()
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

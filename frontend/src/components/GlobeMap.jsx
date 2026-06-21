import { useRef, useEffect, useMemo } from 'react'
import Globe from 'react-globe.gl'
import { useWindowSize } from '../hooks/useWindowSize.js'

const ARC_LIFETIME_MS = 4000

const ARC_COLORS = {
  'cowrie.login.success':      ['rgba(239,68,68,0.9)',   'rgba(239,68,68,0)'],
  'cowrie.login.failed':       ['rgba(251,191,36,0.8)',  'rgba(251,191,36,0)'],
  'cowrie.command.input':      ['rgba(249,115,22,0.9)',  'rgba(249,115,22,0)'],
  'cowrie.session.connect':    ['rgba(100,116,139,0.5)', 'rgba(100,116,139,0)'],
  'cowrie.session.closed':     ['rgba(100,116,139,0.4)', 'rgba(100,116,139,0)'],
  'opencanary.http.request':   ['rgba(167,139,250,0.8)', 'rgba(167,139,250,0)'],
  'opencanary.ftp.login':      ['rgba(34,211,238,0.8)',  'rgba(34,211,238,0)'],
  'opencanary.mysql.login':    ['rgba(74,222,128,0.8)',  'rgba(74,222,128,0)'],
  'opencanary.ssh.login':      ['rgba(239,68,68,0.9)',   'rgba(239,68,68,0)'],
  'opencanary.telnet.login':   ['rgba(196,181,253,0.7)', 'rgba(196,181,253,0)'],
  'opencanary.redis.command':  ['rgba(251,146,60,0.9)',  'rgba(251,146,60,0)'],
}
const DEFAULT_ARC = ['rgba(251,191,36,0.8)', 'rgba(251,191,36,0)']

const POINT_COLORS = {
  'cowrie.login.success':      'rgba(239,68,68,0.9)',
  'cowrie.login.failed':       'rgba(251,191,36,0.7)',
  'cowrie.command.input':      'rgba(249,115,22,0.9)',
  'cowrie.session.connect':    'rgba(100,116,139,0.5)',
  'cowrie.session.closed':     'rgba(100,116,139,0.4)',
  'opencanary.http.request':   'rgba(167,139,250,0.8)',
  'opencanary.ftp.login':      'rgba(34,211,238,0.8)',
  'opencanary.mysql.login':    'rgba(74,222,128,0.8)',
  'opencanary.ssh.login':      'rgba(239,68,68,0.9)',
  'opencanary.telnet.login':   'rgba(196,181,253,0.7)',
  'opencanary.redis.command':  'rgba(251,146,60,0.9)',
}
const DEFAULT_POINT = 'rgba(251,191,36,0.7)'

export default function GlobeMap({ arcs }) {
  const globeRef = useRef()
  const { width, height } = useWindowSize()

  useEffect(() => {
    const ctrl = globeRef.current?.controls()
    if (!ctrl) return
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = 0.4
    ctrl.enableZoom = true
  }, [])

  const arcColor = (d) => ARC_COLORS[d.event_type] || DEFAULT_ARC
  const pointColor = (d) => POINT_COLORS[d.event_type] || DEFAULT_POINT

  const attackerPoints = useMemo(
    () => arcs.map((a) => ({ lat: a.src_lat, lng: a.src_lon, event_type: a.event_type })),
    [arcs]
  )

  const labelData = useMemo(() => {
    const seen = new Set()
    return arcs.reduce((acc, a) => {
      if (!a.src_country || !a.src_lat || !a.src_lon) return acc
      if (!seen.has(a.src_country)) {
        seen.add(a.src_country)
        acc.push({ lat: a.src_lat, lng: a.src_lon, text: a.src_city || a.src_country })
      }
      return acc
    }, [])
  }, [arcs])

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      arcsData={arcs}
      arcStartLat={(d) => d.src_lat}
      arcStartLng={(d) => d.src_lon}
      arcEndLat={(d) => d.dst_lat}
      arcEndLng={(d) => d.dst_lon}
      arcColor={arcColor}
      arcDashLength={0.4}
      arcDashGap={0.2}
      arcDashAnimateTime={ARC_LIFETIME_MS}
      arcStroke={0.6}
      pointsData={attackerPoints}
      pointLat={(d) => d.lat}
      pointLng={(d) => d.lng}
      pointColor={pointColor}
      pointRadius={0.25}
      pointAltitude={0.01}
      labelsData={labelData}
      labelLat={(d) => d.lat}
      labelLng={(d) => d.lng}
      labelText={(d) => d.text}
      labelColor={() => 'rgba(200,220,255,0.75)'}
      labelSize={0.45}
      labelAltitude={0.01}
      labelDotRadius={0.3}
      labelDotColor={() => 'rgba(200,220,255,0.4)'}
      labelResolution={2}
    />
  )
}

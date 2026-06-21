import { useRef, useEffect, useMemo } from 'react'
import Globe from 'react-globe.gl'
import { useWindowSize } from '../hooks/useWindowSize.js'

const ARC_LIFETIME_MS = 4000

const ARC_COLORS = {
  'cowrie.login.success':   ['rgba(239,68,68,0.9)',   'rgba(239,68,68,0)'],
  'cowrie.login.failed':    ['rgba(251,191,36,0.8)',  'rgba(251,191,36,0)'],
  'cowrie.command.input':   ['rgba(249,115,22,0.9)',  'rgba(249,115,22,0)'],
  'cowrie.session.connect': ['rgba(100,116,139,0.5)', 'rgba(100,116,139,0)'],
  'cowrie.session.closed':      ['rgba(100,116,139,0.4)', 'rgba(100,116,139,0)'],
}
const DEFAULT_ARC = ['rgba(251,191,36,0.8)', 'rgba(251,191,36,0)']

const POINT_COLORS = {
  'cowrie.login.success':   'rgba(239,68,68,0.9)',
  'cowrie.login.failed':    'rgba(251,191,36,0.7)',
  'cowrie.command.input':   'rgba(249,115,22,0.9)',
  'cowrie.session.connect': 'rgba(100,116,139,0.5)',
  'cowrie.session.closed':      'rgba(100,116,139,0.4)',
}
const DEFAULT_POINT = 'rgba(251,191,36,0.7)'

export default function GlobeMap({ arcs, heatPoints = [] }) {
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

  const heatDataset = useMemo(() => [heatPoints], [heatPoints])

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
      heatmapsData={heatDataset}
      heatmapPointsAccessor={(d) => d}
      heatmapPointLat={(d) => d.lat}
      heatmapPointLng={(d) => d.lng}
      heatmapPointWeight={() => 1}
      heatmapBandwidth={3}
      heatmapColorFn={(t) => `rgba(255,${Math.round(120 * (1 - t))},0,${Math.pow(t, 0.5) * 0.7})`}
      heatmapTopAltitude={0.005}
      heatmapTransitionDuration={300}
    />
  )
}

import { useRef, useEffect, useMemo } from 'react'
import Globe from 'react-globe.gl'

const ARC_LIFETIME_MS = 4000

export default function GlobeMap({ arcs }) {
  const globeRef = useRef()

  useEffect(() => {
    const ctrl = globeRef.current?.controls()
    if (!ctrl) return
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = 0.4
    ctrl.enableZoom = true
  }, [])

  const arcColor = (d) =>
    d.known_threat
      ? ['rgba(239,68,68,0.9)', 'rgba(239,68,68,0)']
      : ['rgba(251,191,36,0.8)', 'rgba(251,191,36,0)']

  const pointColor = (d) =>
    d.known_threat ? 'rgba(239,68,68,0.9)' : 'rgba(251,191,36,0.7)'

  const attackerPoints = useMemo(
    () => arcs.map((a) => ({ lat: a.src_lat, lng: a.src_lon, known_threat: a.known_threat })),
    [arcs]
  )

  return (
    <Globe
      ref={globeRef}
      width={window.innerWidth}
      height={window.innerHeight}
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
    />
  )
}

import { useEffect, useState } from 'react'
import { useWindowSize } from '../hooks/useWindowSize.js'

const EVENT_LABELS = {
  'cowrie.login.success':      'LOGIN SUCCESS',
  'cowrie.login.failed':       'LOGIN ATTEMPT',
  'cowrie.session.connect':    'CONNECTION',
  'cowrie.session.closed':     'SESSION CLOSED',
  'cowrie.command.input':      'COMMAND EXECUTED',
  'cowrie.command.failed':     'COMMAND FAILED',
  'cowrie.command.success':    'COMMAND SUCCESS',
  'cowrie.client.version':     'CLIENT HANDSHAKE',
  'opencanary.http.request':   'HTTP PROBE',
  'opencanary.ftp.login':      'FTP LOGIN',
  'opencanary.mysql.login':    'MYSQL LOGIN',
  'opencanary.ssh.login':      'SSH LOGIN',
  'opencanary.telnet.login':   'TELNET LOGIN',
  'opencanary.redis.command':  'REDIS COMMAND',
}

const EVENT_BADGE = {
  'cowrie.login.success':      { bg: '#450a0a', color: '#ef4444' },
  'cowrie.login.failed':       { bg: '#3d2700', color: '#fbbf24' },
  'cowrie.command.input':      { bg: '#431407', color: '#f97316' },
  'cowrie.command.failed':     { bg: '#431407', color: '#f97316' },
  'cowrie.command.success':    { bg: '#431407', color: '#f97316' },
  'cowrie.session.connect':    { bg: '#0f172a', color: '#64748b' },
  'cowrie.session.closed':     { bg: '#0f172a', color: '#64748b' },
  'cowrie.client.version':     { bg: '#0f172a', color: '#64748b' },
  'opencanary.http.request':   { bg: '#2e1065', color: '#a78bfa' },
  'opencanary.ftp.login':      { bg: '#083344', color: '#22d3ee' },
  'opencanary.mysql.login':    { bg: '#052e16', color: '#4ade80' },
  'opencanary.ssh.login':      { bg: '#450a0a', color: '#ef4444' },
  'opencanary.telnet.login':   { bg: '#2e1065', color: '#c4b5fd' },
  'opencanary.redis.command':  { bg: '#431407', color: '#fb923c' },
}
const DEFAULT_BADGE = { bg: '#3d2700', color: '#fbbf24' }

const flag = (code) => {
  if (!code || code.length !== 2) return ''
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

const abuseColor = (score) => {
  if (score >= 75) return '#ef4444'
  if (score >= 50) return '#f97316'
  if (score >= 25) return '#fbbf24'
  return '#4ade80'
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    zIndex: 20, cursor: 'pointer',
  },
  modal: {
    position: 'fixed', top: '50%', left: 'calc(50% - 140px)',
    transform: 'translate(-50%, -50%)',
    width: '400px', maxHeight: '85vh', overflowY: 'auto',
    background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(12px)',
    border: '1px solid #1e2535', borderRadius: '8px',
    padding: '20px', zIndex: 21,
    fontFamily: "'Courier New', monospace",
  },
  modalMobile: {
    position: 'fixed', inset: 0,
    width: '100%', height: '100%', overflowY: 'auto',
    background: 'rgba(15,17,23,0.99)', backdropFilter: 'blur(12px)',
    borderRadius: 0, padding: '16px 14px 32px',
    zIndex: 21, fontFamily: "'Courier New', monospace",
  },
  closeBtnMobile: {
    background: '#1e2535', border: 'none', color: '#94a3b8',
    cursor: 'pointer', fontSize: '20px', padding: '8px 14px',
    borderRadius: '6px',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '12px',
  },
  title: { color: '#f1f5f9', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' },
  closeBtn: {
    background: 'none', border: 'none', color: '#94a3b8',
    cursor: 'pointer', fontSize: '16px', padding: '0 4px',
  },
  section: { marginBottom: '14px' },
  sectionLabel: {
    color: '#4ade80', fontSize: '9px', letterSpacing: '2px',
    marginBottom: '6px', borderBottom: '1px solid #1e2535', paddingBottom: '4px',
  },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' },
  key: { color: '#4a5568', fontSize: '10px', flexShrink: 0 },
  val: { color: '#f1f5f9', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' },
  ip: { color: '#60a5fa', fontSize: '10px', textAlign: 'right' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '14px',
  },
  scoreBar: { height: '3px', background: '#1e2535', borderRadius: '2px', margin: '2px 0 8px' },
  scoreBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.5s' },
  threatBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    background: '#450a0a', color: '#f87171',
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', marginTop: '4px',
  },
  torBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    background: '#1e1b4b', color: '#a78bfa',
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px', marginTop: '4px', marginLeft: '6px',
  },
  password: { color: '#fb923c', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' },
  command: { color: '#f97316', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all', fontStyle: 'italic' },
  dimVal: { color: '#64748b', fontSize: '10px', textAlign: 'right' },
}

function Row({ label, value, valueStyle }) {
  return (
    <div style={s.row}>
      <span style={s.key}>{label}</span>
      <span style={{ ...s.val, ...valueStyle }}>{value || '—'}</span>
    </div>
  )
}

function LinkRow({ label, href, value, valueStyle }) {
  return (
    <div style={s.row}>
      <span style={s.key}>{label}</span>
      <a href={href} target="_blank" rel="noreferrer"
         style={{ ...s.val, ...valueStyle, textDecoration: 'none' }}>
        {value} ↗
      </a>
    </div>
  )
}

export default function EventDetail({ event, onClose }) {
  const { isMobile } = useWindowSize()
  const [ipStats, setIpStats] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!event?.src_ip) { setIpStats(null); return }
    setIpStats(null)
    fetch(`/api/ip/${event.src_ip}/stats`)
      .then(r => r.json())
      .then(setIpStats)
      .catch(() => {})
  }, [event?.src_ip])

  if (!event) return null

  const time = event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'
  const badge = EVENT_BADGE[event.event_type] || DEFAULT_BADGE
  const label = EVENT_LABELS[event.event_type] || event.event_type

  const hasAttackDetail = event.username || event.password || event.command || event.path || event.vuln_hint
  const hasAbuseData = event.abuse_score > 0

  return (
    <>
      {!isMobile && <div style={s.overlay} onClick={onClose} />}
      <div style={isMobile ? s.modalMobile : s.modal}>
        <div style={s.header}>
          <span style={s.title}>ATTACK DETAIL</span>
          <button style={isMobile ? s.closeBtnMobile : s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ ...s.badge, background: badge.bg, color: badge.color }}>
          {label}
        </div>

        {/* SOURCE */}
        <div style={s.section}>
          <div style={s.sectionLabel}>SOURCE</div>
          <LinkRow
            label="IP"
            href={`https://www.abuseipdb.com/check/${event.src_ip}`}
            value={event.src_ip}
            valueStyle={s.ip}
          />
          <Row label="COUNTRY" value={event.src_country_code
            ? `${flag(event.src_country_code)} ${event.src_country} (${event.src_country_code})`
            : event.src_country}
          />
          <Row label="CITY" value={event.src_city} />
          <Row label="COORDS" value={
            event.src_lat != null
              ? `${Number(event.src_lat).toFixed(3)}, ${Number(event.src_lon).toFixed(3)}`
              : null
          } />
          {event.protocol && (
            <Row
              label="PROTOCOL"
              value={event.protocol.toUpperCase()}
              valueStyle={{ color: { ssh: '#60a5fa', telnet: '#a78bfa', ftp: '#22d3ee', mysql: '#4ade80', http: '#c084fc', redis: '#fb923c' }[event.protocol] || '#60a5fa' }}
            />
          )}
        </div>

        {/* ATTACKER HISTORY — lazy loaded from MongoDB */}
        {ipStats && ipStats.total_attacks > 0 && (
          <div style={s.section}>
            <div style={s.sectionLabel}>ATTACKER HISTORY</div>
            <Row
              label="TOTAL ATTACKS"
              value={ipStats.total_attacks.toLocaleString()}
              valueStyle={{ color: '#ef4444', fontWeight: 'bold' }}
            />
            {ipStats.first_seen && (
              <Row label="FIRST SEEN" value={new Date(ipStats.first_seen).toLocaleDateString()} />
            )}
            {ipStats.last_seen && (
              <Row label="LAST SEEN" value={new Date(ipStats.last_seen).toLocaleDateString()} />
            )}
            {ipStats.event_breakdown?.slice(0, 4).map(b => (
              <Row
                key={b.event_type}
                label={b.event_type.replace(/^(cowrie|opencanary)\./, '')}
                value={b.count.toLocaleString()}
                valueStyle={s.dimVal}
              />
            ))}
          </div>
        )}

        {/* ATTACK — only render if there's something meaningful */}
        {hasAttackDetail && (
          <div style={s.section}>
            <div style={s.sectionLabel}>ATTACK</div>
            {event.vuln_hint && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '3px 8px', borderRadius: '4px', marginBottom: '8px',
                background: event.vuln_hint.tier === 'cve' ? '#450a0a' : '#3d2700',
                border: `1px solid ${event.vuln_hint.tier === 'cve' ? '#7f1d1d' : '#78350f'}`,
              }}>
                <span style={{ color: event.vuln_hint.tier === 'cve' ? '#ef4444' : '#fbbf24', fontSize: '8px', fontWeight: 'bold', letterSpacing: '1px' }}>
                  {event.vuln_hint.tier === 'cve' ? '⚠ CVE' : '◉ TECHNIQUE'}
                </span>
                <span style={{ color: '#f1f5f9', fontSize: '9px' }}>
                  {event.vuln_hint.label}{event.vuln_hint.cve ? ` · ${event.vuln_hint.cve}` : ''}
                </span>
              </div>
            )}
            {event.command && (
              <Row label="COMMAND" value={event.command} valueStyle={s.command} />
            )}
            {event.path && (
              <Row label="PATH" value={event.path} valueStyle={{ color: '#a78bfa', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' }} />
            )}
            {event.username && (
              <Row label="USERNAME" value={event.username} />
            )}
            {event.password && (
              <Row label="PASSWORD" value={event.password} valueStyle={s.password} />
            )}
          </div>
        )}

        {/* THREAT INTEL */}
        {(hasAbuseData || event.known_threat) && (
          <div style={s.section}>
            <div style={s.sectionLabel}>THREAT INTEL</div>
            {hasAbuseData && (
              <>
                <Row
                  label="ABUSEIPDB SCORE"
                  value={`${event.abuse_score}/100`}
                  valueStyle={{ color: abuseColor(event.abuse_score) }}
                />
                <div style={s.scoreBar}>
                  <div style={{
                    ...s.scoreBarFill,
                    width: `${event.abuse_score}%`,
                    background: abuseColor(event.abuse_score),
                  }} />
                </div>
                {event.abuse_total_reports > 0 && (
                  <Row label="REPORTS (90d)" value={event.abuse_total_reports.toLocaleString()} />
                )}
                {event.abuse_distinct_users > 0 && (
                  <Row label="DISTINCT REPORTERS" value={event.abuse_distinct_users.toLocaleString()} />
                )}
                {event.abuse_last_reported && (
                  <Row label="LAST SEEN" value={new Date(event.abuse_last_reported).toLocaleDateString()} />
                )}
                {event.abuse_isp && (
                  <Row label="ISP" value={event.abuse_isp} valueStyle={s.dimVal} />
                )}
                {event.abuse_usage_type && (
                  <Row label="USAGE TYPE" value={event.abuse_usage_type} valueStyle={s.dimVal} />
                )}
              </>
            )}
            <div>
              {event.known_threat && (
                <span style={s.threatBadge}>⚠ KNOWN THREAT ACTOR</span>
              )}
              {event.abuse_is_tor && (
                <span style={s.torBadge}>◉ TOR EXIT NODE</span>
              )}
            </div>
            {event.threat_source && (
              <Row label="INTEL SOURCE" value={event.threat_source} valueStyle={s.dimVal} />
            )}
          </div>
        )}

        {/* SHODAN */}
        {(event.shodan_ports?.length > 0 || event.shodan_tags?.length > 0 || event.shodan_vulns?.length > 0 || event.shodan_org) && (
          <div style={s.section}>
            <div style={s.sectionLabel}>SHODAN</div>
            {event.shodan_org && (
              <Row label="ORG" value={event.shodan_org} valueStyle={s.dimVal} />
            )}
            {event.shodan_os && (
              <Row label="OS" value={event.shodan_os} valueStyle={s.dimVal} />
            )}
            {event.shodan_ports?.length > 0 && (
              <Row label="OPEN PORTS" value={event.shodan_ports.slice(0, 12).join(', ')} valueStyle={s.dimVal} />
            )}
            {event.shodan_hostnames?.length > 0 && (
              <Row label="HOSTNAME" value={event.shodan_hostnames[0]} valueStyle={s.dimVal} />
            )}
            {event.shodan_tags?.length > 0 && (
              <Row label="TAGS" value={event.shodan_tags.join(', ')} valueStyle={{ color: '#f97316', fontSize: '10px', textAlign: 'right' }} />
            )}
            {event.shodan_vulns?.length > 0 && (
              <Row
                label={`CVEs (${event.shodan_vulns.length})`}
                value={event.shodan_vulns.slice(0, 3).join(', ') + (event.shodan_vulns.length > 3 ? ` +${event.shodan_vulns.length - 3}` : '')}
                valueStyle={{ color: '#ef4444', fontSize: '10px', textAlign: 'right' }}
              />
            )}
            {event.shodan_last_update && (
              <Row label="LAST SCAN" value={new Date(event.shodan_last_update).toLocaleDateString()} valueStyle={s.dimVal} />
            )}
          </div>
        )}

        {/* SENSOR */}
        <div style={s.section}>
          <div style={s.sectionLabel}>SENSOR</div>
          <Row label="HONEYPOT" value={event.honeypot} />
          <Row label="TIME" value={time} />
          {event.duration != null && (
            <Row label="DURATION" value={`${Number(event.duration).toFixed(1)}s`} valueStyle={s.dimVal} />
          )}
          <Row label="EVENT ID" value={event.event_type} valueStyle={s.dimVal} />
        </div>
      </div>
    </>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { COLORS } from '../config/branding'
import { loadLocationConfig } from '../utils/locationConfig'
import { localDateKey } from '../utils/dateUtils'

// ── Avatar colors ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  COLORS.accent, '#60a5fa', '#a78bfa', '#34d399',
  '#f87171',     '#fb923c', '#e879f9', '#2dd4bf',
]

// ── Date helpers ──────────────────────────────────────────────────────────────
// Thin shim — delegates to shared util, keeps existing call sites intact
const localDateStr = (d = new Date()) => localDateKey(d)

/**
 * Returns true if `timestamp` falls within the given timeframe relative to today.
 * @param {string|Date} timestamp
 * @param {'daily'|'weekly'|'monthly'} timeframe
 * @param {string} todayStr   — 'YYYY-MM-DD'
 */
function inTimeframe(timestamp, timeframe, todayStr) {
  const d = new Date(timestamp)
  if (timeframe === 'weekly') {
    const ref = new Date(todayStr + 'T12:00:00')
    const dow = ref.getDay()   // 0 = Sun
    const mon = new Date(ref)
    mon.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1))
    mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23, 59, 59, 999)
    return d >= mon && d <= sun
  }
  if (timeframe === 'monthly') {
    const ref = new Date(todayStr + 'T12:00:00')
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  }
  // daily (default)
  return localDateStr(d) === todayStr
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Mode / timeframe labels ───────────────────────────────────────────────────
const MODE_LABEL = {
  individual_total:    'Total Sales · Employee',
  individual_highest:  'Highest Sale · Employee',
  individual_products: 'Products Sold · Employee',
  teamwork_total:      'Total Sales · Location',
  teamwork_highest:    'Highest Sale · Location',
  teamwork_products:   'Products Sold · Location',
  none:                'No Competition',
}

const TIMEFRAME_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

// ── Ranking tab config ────────────────────────────────────────────────────────
const TAB_CFG = {
  sales:  { label: '📊 Sales',  color: '#60a5fa', bg: 'rgba(37,99,235,0.15)',  border: 'rgba(96,165,250,0.4)'  },
  spare:  { label: '💰 Spare',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  hybrid: { label: '⚡ Hybrid', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)', border: 'rgba(167,139,250,0.4)' },
}

// ── Value formatter ───────────────────────────────────────────────────────────
// tab: 'sales' | 'spare' | 'hybrid'
function fmtValue(v, mode, tab = 'sales') {
  if (!mode || mode === 'none') return ''
  if (tab === 'spare')  return `$${Number(v).toFixed(2)}`
  if (tab === 'hybrid') return `${Number(v).toFixed(1)} pts`
  if (mode.endsWith('_products')) return `${Math.round(v)} items`
  if (mode.endsWith('_highest'))  return `$${Number(v).toFixed(2)}`
  return `$${Number(v).toFixed(2)}`
}

const MEDALS = {
  0: { label: '1st', bg: `linear-gradient(135deg, ${COLORS.accent}, #d97706)`, height: 200, medal: '🥇' },
  1: { label: '2nd', bg: 'linear-gradient(135deg, #9ca3af, #6b7280)',           height: 160, medal: '🥈' },
  2: { label: '3rd', bg: 'linear-gradient(135deg, #b45309, #92400e)',           height: 130, medal: '🥉' },
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Competition({ onClose, sales = [], posSession = null }) {

  // ── Read competition config from location settings ──────────────────────────
  const locCfg           = loadLocationConfig(posSession?.location) || {}
  const compMode         = locCfg.competitionMode            || 'individual_total'
  const timeframe        = locCfg.competitionTimeframe       || 'daily'
  const viewTop          = Number(locCfg.competitionViewTop  ?? 5)   // 0 = show all
  const rankOnly         = !!locCfg.competitionShowRankingOnly
  const enableSpare      = !!locCfg.competitionEnableSpare
  const enableHybrid     = !!locCfg.competitionEnableHybrid
  const hybridMultiplier = Number(locCfg.competitionHybridMultiplier ?? 1.0)

  // ── Active ranking tab (local — does NOT touch location config) ───────────
  // Default: 'sales'. Spare/Hybrid only selectable if enabled in location.
  const [rankTab, setRankTab] = useState('sales')

  // ── Track today / day rollover ────────────────────────────────────────────
  const [today, setToday] = useState(() => localDateStr())
  useEffect(() => {
    const id = setInterval(() => {
      const nd = localDateStr()
      setToday(prev => prev !== nd ? nd : prev)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Pulse on new sale ─────────────────────────────────────────────────────
  const [pulse, setPulse] = useState(false)
  const salesCount = sales.length
  useEffect(() => {
    if (salesCount === 0) return
    setPulse(true)
    const id = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(id)
  }, [salesCount])

  // ── Clock ─────────────────────────────────────────────────────────────────
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }))
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  // ── Build standings ────────────────────────────────────────────────────────
  const standings = useMemo(() => {
    if (compMode === 'none') return []

    // 1. Filter by timeframe + status
    const filtered = sales.filter(s => {
      if (s.status === 'deleted' || s.status === 'voided' || s.status === 'refunded') return false
      return inTimeframe(s.timestamp, timeframe, today)
    })

    // 2. Grouping key
    // Spare/Hybrid tabs always rank by employee; Sales follows compMode (teamwork or individual)
    const isTeamwork = rankTab === 'sales' && compMode.startsWith('teamwork')
    const getKey = s => isTeamwork
      ? (s.location || 'Unknown Location')
      : (s.employee || 'Unknown')

    // 3. Compute metric based on active tab
    const map      = {}
    const extraMap = {}   // populated only for hybrid display

    if (rankTab === 'spare') {
      // Spare tab: sum totalSpare per employee — no extra processing when not active
      filtered.forEach(s => {
        const k = getKey(s)
        map[k] = (map[k] || 0) + (s.totalSpare || 0)
      })
    } else if (rankTab === 'hybrid') {
      // Hybrid tab: score = subtotal + totalSpare × multiplier
      filtered.forEach(s => {
        const k     = getKey(s)
        const sub   = s.subtotal   || 0
        const spare = s.totalSpare || 0
        map[k] = (map[k] || 0) + sub + spare * hybridMultiplier
        if (!extraMap[k]) extraMap[k] = { subtotal: 0, spare: 0 }
        extraMap[k].subtotal += sub
        extraMap[k].spare    += spare
      })
    } else {
      // Sales tab: use location's compMode (total / highest / products)
      if (compMode.endsWith('_total')) {
        filtered.forEach(s => {
          const k = getKey(s)
          map[k] = (map[k] || 0) + (s.subtotal || 0)
        })
      } else if (compMode.endsWith('_highest')) {
        filtered.forEach(s => {
          const k = getKey(s)
          map[k] = Math.max(map[k] || 0, s.subtotal || 0)
        })
      } else if (compMode.endsWith('_products')) {
        filtered.forEach(s => {
          const k     = getKey(s)
          const count = (s.items || []).reduce((sum, i) => sum + Math.abs(i.qty || 0), 0)
          map[k] = (map[k] || 0) + count
        })
      }
    }

    // 4. Sort, assign stable colors
    const names = Object.keys(map).sort()
    const all = Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        subtotal: value,
        initials: getInitials(name),
        color: AVATAR_COLORS[names.indexOf(name) % AVATAR_COLORS.length],
        extra: extraMap[name] || null,
      }))
      .sort((a, b) => b.value - a.value)

    // 5. Apply viewTop
    return viewTop > 0 ? all.slice(0, viewTop) : all
  }, [sales, today, compMode, timeframe, viewTop, rankTab, hybridMultiplier])

  // ── Derived ───────────────────────────────────────────────────────────────
  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // fmt: value formatter bound to current tab + compMode
  const fmt = (v) => fmtValue(v, compMode, rankTab)

  const salesModeLabel = MODE_LABEL[compMode]       || ''
  const timeframeLabel = TIMEFRAME_LABEL[timeframe] || ''
  const tabModeLabel   = rankTab === 'spare'  ? 'Spare Ranking · Employee'
                       : rankTab === 'hybrid' ? 'Hybrid Score · Employee'
                       : salesModeLabel
  const subtitle = compMode === 'none'
    ? 'Competition is not configured for this location'
    : `${timeframeLabel} · ${tabModeLabel}`

  // Visible tabs (Sales always visible)
  const visibleTabs = [
    { key: 'sales'  },
    ...(enableSpare  ? [{ key: 'spare'  }] : []),
    ...(enableHybrid ? [{ key: 'hybrid' }] : []),
  ]

  const [first, second, third, ...rest] = standings

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at center, #1a2a4a 0%, #0a0a1a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, overflow: 'hidden',
    }}>

      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20,
        background: 'transparent', border: '1px solid #1e293b',
        borderRadius: 6, color: '#64748b', padding: '8px 16px',
        cursor: 'pointer', fontSize: 14, transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
      >✕ Close</button>

      {/* Date badge */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b',
        borderRadius: 8, padding: '6px 14px', color: '#64748b', fontSize: 12,
      }}>
        {dateLabel} · {clock}
      </div>

      {/* Timeframe badge — top right below close */}
      {compMode !== 'none' && (
        <div style={{
          position: 'absolute', top: 20, right: 110,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)',
          borderRadius: 8, padding: '5px 12px', color: '#60a5fa', fontSize: 11, fontWeight: 600,
        }}>
          {timeframeLabel}
        </div>
      )}

      {/* Ranking tab badge (top-right, only when multiple tabs available) */}
      {visibleTabs.length > 1 && compMode !== 'none' && (
        <div style={{
          position: 'absolute', top: 20, right: 215,
          background: TAB_CFG[rankTab].bg,
          border: `1px solid ${TAB_CFG[rankTab].border}`,
          borderRadius: 8, padding: '5px 12px',
          color: TAB_CFG[rankTab].color, fontSize: 11, fontWeight: 700,
        }}>
          {TAB_CFG[rankTab].label}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: standings.length > 0 && !rankOnly ? 32 : 16 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: COLORS.accent, fontSize: 32, fontWeight: 800, letterSpacing: 2, margin: 0 }}>
          Competition
        </h1>
        <p style={{ color: '#60a5fa', fontSize: 14, marginTop: 6 }}>{subtitle}</p>
        {first && (
          <div style={{
            color: '#fff', fontSize: 14, marginTop: 12,
            background: 'rgba(245,158,11,0.15)', padding: '6px 22px',
            borderRadius: 20, display: 'inline-block',
            border: '1px solid rgba(245,158,11,0.3)',
          }}>
            Leader: <strong style={{ color: COLORS.accent }}>{first.name}</strong>
            {' '}— <strong style={{ color: COLORS.accent }}>{fmt(first.value)}</strong>
          </div>
        )}
      </div>

      {/* ── Ranking tabs (only when 2+ tabs available and competition is on) ── */}
      {compMode !== 'none' && visibleTabs.length > 1 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 28, justifyContent: 'center',
        }}>
          {visibleTabs.map(({ key }) => {
            const cfg    = TAB_CFG[key]
            const active = rankTab === key
            return (
              <button
                key={key}
                onClick={() => setRankTab(key)}
                style={{
                  padding: '9px 24px', borderRadius: 24, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  border: `1px solid ${active ? cfg.border : 'rgba(30,41,59,0.8)'}`,
                  background: active ? cfg.bg : 'rgba(15,23,42,0.5)',
                  color: active ? cfg.color : '#475569',
                  boxShadow: active ? `0 0 18px ${cfg.bg}` : 'none',
                  transform: active ? 'scale(1.04)' : 'scale(1)',
                }}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── No competition / empty states ── */}
      {compMode === 'none' && (
        <div style={{
          textAlign: 'center', padding: '40px 60px',
          background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b',
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⚙️</div>
          <p style={{ color: '#475569', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No competition configured
          </p>
          <p style={{ color: '#334155', fontSize: 13 }}>
            Configure competition settings in Admin → Locations → Extra Features.
          </p>
        </div>
      )}

      {compMode !== 'none' && standings.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 60px',
          background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b',
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📊</div>
          <p style={{ color: '#475569', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No sales yet {timeframe === 'daily' ? 'today' : `this ${timeframe}`}
          </p>
          <p style={{ color: '#334155', fontSize: 13 }}>
            The ranking will appear as sales are recorded.
          </p>
        </div>
      )}

      {/* ── PODIUM (default view) ── */}
      {!rankOnly && standings.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 32 }}>
            {[second, first, third].map((person, visualIdx) => {
              if (!person) return <div key={visualIdx} style={{ width: 150 }} />
              const rank     = standings.indexOf(person)
              const m        = MEDALS[rank] || MEDALS[2]
              const isCenter = visualIdx === 1

              return (
                <div key={person.name} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', width: 150,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: isCenter ? 90 : 72, height: isCenter ? 90 : 72,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isCenter ? 30 : 24, fontWeight: 800, color: '#fff',
                    border: `3px solid ${person.color}`,
                    boxShadow: isCenter ? `0 0 30px ${person.color}66, 0 0 60px ${person.color}22` : 'none',
                    marginBottom: 8, transition: 'all 0.4s ease',
                  }}>
                    {person.initials}
                  </div>

                  <p style={{ color: '#fff', fontSize: isCenter ? 16 : 13, fontWeight: 700, marginBottom: 2, textAlign: 'center' }}>
                    {person.name}
                  </p>
                  <p style={{
                    color: person.color, fontSize: isCenter ? 22 : 15,
                    fontWeight: 800, marginBottom: compMode === 'individual_hybrid' ? 2 : 8,
                    textShadow: pulse && isCenter ? `0 0 20px ${person.color}` : 'none',
                    transition: 'text-shadow 0.3s',
                  }}>
                    {fmt(person.value)}
                  </p>
                  {/* Hybrid breakdown */}
                  {compMode === 'individual_hybrid' && person.extra && (
                    <p style={{ color: '#475569', fontSize: 10, marginBottom: 8, textAlign: 'center' }}>
                      ${person.extra.subtotal.toFixed(2)} + ${person.extra.spare.toFixed(2)} spare
                    </p>
                  )}

                  {/* Podium block */}
                  <div style={{
                    width: 140, height: m.height, background: m.bg,
                    borderRadius: '8px 8px 0 0',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                    boxShadow: isCenter ? '0 -4px 30px rgba(245,158,11,0.35)' : 'none',
                  }}>
                    <span style={{ fontSize: 32 }}>{m.medal}</span>
                    <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{m.label}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 4th+ */}
          {rest.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {rest.map((person, i) => (
                <div key={person.name} style={{
                  background: '#0f172a', border: '1px solid #1e293b',
                  borderRadius: 10, padding: '12px 20px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: `0 0 20px ${person.color}10`,
                }}>
                  <span style={{ color: '#334155', fontSize: 14, fontWeight: 700, minWidth: 22 }}>
                    {i + 4}.
                  </span>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: person.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                  }}>{person.initials}</div>
                  <div>
                    <p style={{ color: '#94a3b8', fontSize: 13 }}>{person.name}</p>
                    <p style={{ color: person.color, fontSize: 14, fontWeight: 700 }}>
                      {fmt(person.value)}
                    </p>
                    {compMode === 'individual_hybrid' && person.extra && (
                      <p style={{ color: '#475569', fontSize: 10, marginTop: 1 }}>
                        ${person.extra.subtotal.toFixed(2)} + ${person.extra.spare.toFixed(2)} spare
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── RANKING ONLY (list view) ── */}
      {rankOnly && standings.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          width: '100%', maxWidth: 560, padding: '0 24px',
        }}>
          {standings.map((person, i) => {
            const medalEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
            const isFirst    = i === 0
            return (
              <div key={person.name} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: isFirst ? 'rgba(245,158,11,0.08)' : 'rgba(15,23,42,0.6)',
                border: `1px solid ${isFirst ? 'rgba(245,158,11,0.25)' : '#1e293b'}`,
                borderRadius: 12, padding: '14px 20px',
                boxShadow: isFirst ? '0 0 20px rgba(245,158,11,0.1)' : 'none',
                transition: 'all 0.2s',
              }}>
                {/* Rank */}
                <div style={{ width: 40, textAlign: 'center', flexShrink: 0 }}>
                  {medalEmoji
                    ? <span style={{ fontSize: 26 }}>{medalEmoji}</span>
                    : <span style={{ color: '#334155', fontSize: 16, fontWeight: 700 }}>{i + 1}.</span>
                  }
                </div>

                {/* Avatar */}
                <div style={{
                  width: isFirst ? 52 : 44, height: isFirst ? 52 : 44,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isFirst ? 18 : 15, fontWeight: 800, color: '#fff',
                  border: `2px solid ${person.color}`,
                  boxShadow: isFirst ? `0 0 16px ${person.color}55` : 'none',
                  flexShrink: 0,
                }}>
                  {person.initials}
                </div>

                {/* Name */}
                <div style={{ flex: 1 }}>
                  <p style={{
                    color: isFirst ? '#fff' : '#94a3b8',
                    fontSize: isFirst ? 16 : 14,
                    fontWeight: isFirst ? 700 : 500,
                  }}>{person.name}</p>
                </div>

                {/* Value */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    color: isFirst ? COLORS.accent : person.color,
                    fontSize: isFirst ? 22 : 17,
                    fontWeight: 800,
                    textShadow: pulse && isFirst ? `0 0 16px ${COLORS.accent}` : 'none',
                    transition: 'text-shadow 0.3s',
                  }}>
                    {fmt(person.value)}
                  </div>
                  {/* Hybrid breakdown */}
                  {compMode === 'individual_hybrid' && person.extra && (
                    <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>
                      ${person.extra.subtotal.toFixed(2)} + ${person.extra.spare.toFixed(2)} spare
                    </div>
                  )}
                  {/* Spare label */}
                  {compMode === 'individual_spare' && (
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>spare</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Live indicator */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 12,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
          boxShadow: pulse ? '0 0 10px #22c55e' : 'none',
          transition: 'box-shadow 0.3s',
        }} />
        Live · {subtitle}
      </div>
    </div>
  )
}

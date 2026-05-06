import { useState, useEffect, useMemo, useCallback } from 'react'
import { COLORS } from '../config/branding'
import { loadLocationConfig } from '../utils/locationConfig'
import { localDateKey } from '../utils/dateUtils'
import { fetchSalesByLocationAndDate, isSupabaseConfigured } from '../services/supabaseRead'
import { loadActiveEmployees } from '../utils/usersStorage'

// ── Avatar colors ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  COLORS.accent, '#60a5fa', '#a78bfa', '#34d399',
  '#f87171',     '#fb923c', '#e879f9', '#2dd4bf',
]

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = 'radial-gradient(ellipse at center, #1a2a4a 0%, #0a0a1a 100%)'
const PANEL  = 'rgba(15,23,42,0.7)'
const BORDER = '#253349'
const MUTED  = '#94a3b8'
const DIM    = '#415569'
const GOLD   = COLORS.accent   // amber/gold

// ── Helpers ───────────────────────────────────────────────────────────────────
const localDateStr = (d = new Date()) => localDateKey(d)
const fmt$   = (v) => `$${Number(v).toFixed(2)}`
const fmtInt = (v) => Math.round(v).toString()

function inTimeframe(timestamp, timeframe, todayStr) {
  const d = new Date(timestamp)
  if (timeframe === 'weekly') {
    const ref = new Date(todayStr + 'T12:00:00')
    const dow = ref.getDay()
    const mon = new Date(ref)
    mon.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1))
    mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
    return d >= mon && d <= sun
  }
  if (timeframe === 'monthly') {
    const ref = new Date(todayStr + 'T12:00:00')
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  }
  return localDateStr(d) === todayStr
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function fmtTime(d) {
  if (!d) return ''
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
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

// ── Value formatter (primary displayed value per tab / mode) ──────────────────
function fmtValue(v, mode, tab = 'sales') {
  if (!mode || mode === 'none') return ''
  if (tab === 'spare')  return fmt$(v)
  if (tab === 'hybrid') return `${Number(v).toFixed(1)} pts`
  if (mode.endsWith('_products')) return `${fmtInt(v)} items`
  if (mode.endsWith('_highest'))  return fmt$(v)
  return fmt$(v)
}

const MEDALS = {
  0: { label: '1st', bg: `linear-gradient(135deg, ${GOLD}, #d97706)`, height: 260, medal: '🥇' },
  1: { label: '2nd', bg: 'linear-gradient(135deg, #9ca3af, #6b7280)',  height: 210, medal: '🥈' },
  2: { label: '3rd', bg: 'linear-gradient(135deg, #b45309, #92400e)',  height: 170, medal: '🥉' },
}

// ── Secondary metrics row ─────────────────────────────────────────────────────
// showSpare is controlled by locCfg.competitionEnableSpare (Location Settings).
// location, count, and commission are hidden by default.
function MetaRow({ person, isFirst = false, showSpare = false }) {
  if (!showSpare || !(person.spare > 0.01)) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
      <span style={{
        background: 'rgba(15,23,42,0.7)', border: `1px solid ${DIM}`,
        borderRadius: 10, padding: '2px 7px', fontSize: isFirst ? 10 : 9,
        color: '#f59e0b', fontWeight: 600,
      }}>
        {fmt$(person.spare)} spare
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Competition({ onClose, sales = [], posSession = null }) {

  // ── Competition config from location settings ──────────────────────────────
  const locCfg           = loadLocationConfig(posSession?.location) || {}
  const compMode         = locCfg.competitionMode            || 'individual_total'
  const timeframe        = locCfg.competitionTimeframe       || 'daily'
  const viewTop          = Number(locCfg.competitionViewTop  ?? 5)
  const rankOnly         = !!locCfg.competitionShowRankingOnly
  const enableSpare      = !!locCfg.competitionEnableSpare
  const enableHybrid     = !!locCfg.competitionEnableHybrid
  const hybridMultiplier = Number(locCfg.competitionHybridMultiplier ?? 1.0)

  // ── Active ranking tab ────────────────────────────────────────────────────
  const [rankTab, setRankTab] = useState('sales')

  // ── Cross-kiosk Supabase polling ──────────────────────────────────────────
  const [remoteSales, setRemoteSales] = useState(null)   // null = not yet fetched
  const [lastUpdated, setLastUpdated] = useState(null)
  const [fetching,    setFetching]    = useState(false)
  const [dataSource,  setDataSource]  = useState('local')

  const poll = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setFetching(true)
    try {
      const data = await fetchSalesByLocationAndDate({ date: new Date() })
      if (Array.isArray(data)) {
        setRemoteSales(data)
        setLastUpdated(new Date())
        setDataSource('supabase')
      }
    } catch {
      // Keep previous remoteSales; indicator stays 'supabase' if we had data before
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [poll])

  // Active sales: Supabase is primary (cross-kiosk), but local sales not yet
  // synced must still appear — otherwise a sale disappears while writeSaleToSupabase
  // is in-flight between the POS and the next 30s poll.
  const activeSales = useMemo(() => {
    if (!remoteSales) return sales
    const remoteNumbers = new Set(remoteSales.map(s => s.number))
    const pendingLocal  = sales.filter(s => !remoteNumbers.has(s.number))
    return pendingLocal.length > 0 ? [...remoteSales, ...pendingLocal] : remoteSales
  }, [remoteSales, sales])

  // ── Day rollover detection ────────────────────────────────────────────────
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
  const salesCount = activeSales.length
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

  // ── Photo map: employee name → photo URL ─────────────────────────────────────
  const photoMap = useMemo(() => {
    const map = {}
    loadActiveEmployees().forEach(e => { if (e.photo) map[e.name] = e.photo })
    return map
  }, [])

  // ── Build standings ────────────────────────────────────────────────────────
  // Always computes subtotal, spare, commission, count, location for every entry.
  // `value` = sort key for the active tab (subtotal / spare / hybrid score).
  const standings = useMemo(() => {
    if (compMode === 'none') return []

    const filtered = activeSales.filter(s => {
      if (s.status === 'deleted' || s.status === 'voided' || s.status === 'refunded') return false
      return inTimeframe(s.timestamp, timeframe, today)
    })

    const isTeamwork = rankTab === 'sales' && compMode.startsWith('teamwork')
    const getKey = s => isTeamwork
      ? (s.location || 'Unknown Location')
      : (s.employee || 'Unknown')

    // Always-computed secondary metrics (per-entity map)
    const meta = {}
    const getM  = k => {
      if (!meta[k]) meta[k] = { subtotal: 0, spare: 0, commission: 0, count: 0, location: '' }
      return meta[k]
    }

    filtered.forEach(s => {
      const k = getKey(s)
      const m = getM(k)
      m.subtotal   += s.subtotal    || 0
      m.spare      += s.totalSpare  || 0
      m.commission += s.commissionSnapshot?.commissionAtSale || 0
      m.count      += 1
      if (!m.location && s.location) m.location = s.location
    })

    // Primary sort value per tab
    const valueMap = {}
    const extraMap = {}

    if (rankTab === 'spare') {
      filtered.forEach(s => {
        const k = getKey(s)
        valueMap[k] = (valueMap[k] || 0) + (s.totalSpare || 0)
      })
    } else if (rankTab === 'hybrid') {
      filtered.forEach(s => {
        const k     = getKey(s)
        const sub   = s.subtotal   || 0
        const spare = s.totalSpare || 0
        valueMap[k] = (valueMap[k] || 0) + sub + spare * hybridMultiplier
        if (!extraMap[k]) extraMap[k] = { subtotal: 0, spare: 0 }
        extraMap[k].subtotal += sub
        extraMap[k].spare    += spare
      })
    } else {
      // Sales tab — follow compMode
      if (compMode.endsWith('_total')) {
        filtered.forEach(s => {
          const k = getKey(s)
          valueMap[k] = (valueMap[k] || 0) + (s.subtotal || 0)
        })
      } else if (compMode.endsWith('_highest')) {
        filtered.forEach(s => {
          const k = getKey(s)
          valueMap[k] = Math.max(valueMap[k] || 0, s.subtotal || 0)
        })
      } else if (compMode.endsWith('_products')) {
        filtered.forEach(s => {
          const k     = getKey(s)
          const count = (s.items || []).reduce((sum, i) => sum + Math.abs(i.qty || 0), 0)
          valueMap[k] = (valueMap[k] || 0) + count
        })
      }
    }

    // Build entries — all keys come from meta (guaranteed to have secondary metrics)
    const names = Object.keys(meta).sort()
    const all = Object.keys(meta).map(name => ({
      name,
      value:      valueMap[name] ?? meta[name].subtotal,
      subtotal:   meta[name].subtotal,
      spare:      meta[name].spare,
      commission: meta[name].commission,
      count:      meta[name].count,
      location:   meta[name].location,
      initials:   getInitials(name),
      color:      AVATAR_COLORS[names.indexOf(name) % AVATAR_COLORS.length],
      photo:      photoMap[name] || null,
      extra:      extraMap[name] || null,
    })).sort((a, b) => b.value - a.value)

    return viewTop > 0 ? all.slice(0, viewTop) : all
  }, [activeSales, today, compMode, timeframe, viewTop, rankTab, hybridMultiplier])

  // ── Derived ───────────────────────────────────────────────────────────────
  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const fmt = (v) => fmtValue(v, compMode, rankTab)

  const salesModeLabel = MODE_LABEL[compMode] || ''
  const tabModeLabel   = rankTab === 'spare'  ? 'Spare Ranking · Employee'
                       : rankTab === 'hybrid' ? 'Hybrid Score · Employee'
                       : salesModeLabel
  const subtitle = compMode === 'none'
    ? 'Competition is not configured for this location'
    : `${TIMEFRAME_LABEL[timeframe] || ''} · ${tabModeLabel}`

  const visibleTabs = [
    { key: 'sales' },
    ...(enableSpare  ? [{ key: 'spare'  }] : []),
    ...(enableHybrid ? [{ key: 'hybrid' }] : []),
  ]

  const [first, second, third, ...rest] = standings

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, overflow: 'hidden',
    }}>

      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20,
        background: 'transparent', border: `1px solid ${BORDER}`,
        borderRadius: 6, color: '#94a3b8', padding: '8px 16px',
        cursor: 'pointer', fontSize: 14, transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#94a3b8' }}
      >✕ Close</button>

      {/* Date + clock */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(15,23,42,0.8)', border: `1px solid ${BORDER}`,
        borderRadius: 8, padding: '6px 14px', color: '#94a3b8', fontSize: 12,
      }}>
        {dateLabel} · {clock}
      </div>

      {/* Timeframe badge */}
      {compMode !== 'none' && (
        <div style={{
          position: 'absolute', top: 20, right: 110,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)',
          borderRadius: 8, padding: '5px 12px', color: '#60a5fa', fontSize: 11, fontWeight: 600,
        }}>
          {TIMEFRAME_LABEL[timeframe] || ''}
        </div>
      )}

      {/* Ranking tab badge */}
      {visibleTabs.length > 1 && compMode !== 'none' && (
        <div style={{
          position: 'absolute', top: 20, right: 215,
          background: TAB_CFG[rankTab].bg, border: `1px solid ${TAB_CFG[rankTab].border}`,
          borderRadius: 8, padding: '5px 12px',
          color: TAB_CFG[rankTab].color, fontSize: 11, fontWeight: 700,
        }}>
          {TAB_CFG[rankTab].label}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: standings.length > 0 && !rankOnly ? 32 : 16 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: GOLD, fontSize: 32, fontWeight: 800, letterSpacing: 2, margin: 0 }}>
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
            Leader: <strong style={{ color: GOLD }}>{first.name}</strong>
            {' '}— <strong style={{ color: GOLD }}>{fmt(first.value)}</strong>
          </div>
        )}
      </div>

      {/* Ranking tabs */}
      {compMode !== 'none' && visibleTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
          {visibleTabs.map(({ key }) => {
            const cfg    = TAB_CFG[key]
            const active = rankTab === key
            return (
              <button key={key} onClick={() => setRankTab(key)} style={{
                padding: '9px 24px', borderRadius: 24, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s ease',
                border: `1px solid ${active ? cfg.border : 'rgba(30,41,59,0.8)'}`,
                background: active ? cfg.bg : 'rgba(15,23,42,0.5)',
                color: active ? cfg.color : MUTED,
                boxShadow: active ? `0 0 18px ${cfg.bg}` : 'none',
                transform: active ? 'scale(1.04)' : 'scale(1)',
              }}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Empty states */}
      {compMode === 'none' && (
        <div style={{
          textAlign: 'center', padding: '40px 60px',
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⚙️</div>
          <p style={{ color: MUTED, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No competition configured
          </p>
          <p style={{ color: DIM, fontSize: 13 }}>
            Configure in Admin → Locations → Extra Features.
          </p>
        </div>
      )}

      {compMode !== 'none' && standings.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 60px',
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📊</div>
          <p style={{ color: MUTED, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No sales yet {timeframe === 'daily' ? 'today' : `this ${timeframe}`}
          </p>
          <p style={{ color: DIM, fontSize: 13 }}>
            The ranking will appear as sales are recorded.
          </p>
        </div>
      )}

      {/* ── PODIUM VIEW ── */}
      {!rankOnly && standings.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 32 }}>
            {[second, first, third].map((person, visualIdx) => {
              if (!person) return <div key={visualIdx} style={{ width: 185 }} />
              const rank     = standings.indexOf(person)
              const m        = MEDALS[rank] || MEDALS[2]
              const isCenter = visualIdx === 1

              const avatarSize  = isCenter ? 114 : 90
              const avatarGlow  = isCenter
                ? `0 0 0 3px ${person.color}55, 0 0 40px ${person.color}77, 0 0 80px ${person.color}33`
                : `0 0 0 2px ${person.color}33`

              return (
                <div key={person.name} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  width: isCenter ? 210 : 185,
                }}>
                  {/* Top Seller badge */}
                  {isCenter && (
                    <div style={{
                      background: 'linear-gradient(90deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))',
                      border: '1px solid rgba(245,158,11,0.4)',
                      borderRadius: 12, padding: '3px 12px',
                      color: GOLD, fontSize: 10, fontWeight: 800,
                      letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase',
                    }}>
                      ⭐ Top Seller
                    </div>
                  )}

                  {/* Avatar — explicit size, no transform transition to prevent blur */}
                  {person.photo
                    ? <img src={person.photo} alt={person.initials} style={{
                        width: avatarSize, height: avatarSize,
                        borderRadius: '50%', objectFit: 'cover',
                        border: `3px solid ${person.color}`,
                        boxShadow: avatarGlow,
                        marginBottom: 10, flexShrink: 0,
                        transition: 'box-shadow 0.4s ease',
                      }} />
                    : <div style={{
                        width: avatarSize, height: avatarSize,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isCenter ? 38 : 30, fontWeight: 800, color: '#fff',
                        border: `3px solid ${person.color}`,
                        boxShadow: avatarGlow,
                        marginBottom: 10, flexShrink: 0,
                        transition: 'box-shadow 0.4s ease',
                      }}>
                        {person.initials}
                      </div>
                  }

                  <p style={{ color: '#fff', fontSize: isCenter ? 17 : 14, fontWeight: 700, marginBottom: 3, textAlign: 'center' }}>
                    {person.name}
                  </p>
                  <p style={{
                    color: person.color, fontSize: isCenter ? 24 : 16,
                    fontWeight: 800, marginBottom: 5,
                    textShadow: pulse && isCenter ? `0 0 20px ${person.color}` : 'none',
                    transition: 'text-shadow 0.3s',
                  }}>
                    {fmt(person.value)}
                  </p>

                  {/* Hybrid breakdown */}
                  {rankTab === 'hybrid' && person.extra && (
                    <p style={{ color: MUTED, fontSize: 10, marginBottom: 4, textAlign: 'center' }}>
                      ${person.extra.subtotal.toFixed(2)} + ${person.extra.spare.toFixed(2)} spare
                    </p>
                  )}

                  {/* Spare — only if enabled in Location Settings */}
                  <MetaRow person={person} isFirst={isCenter} showSpare={enableSpare} />

                  {/* Podium block */}
                  <div style={{
                    width: isCenter ? 200 : 175, height: m.height, background: m.bg,
                    borderRadius: '8px 8px 0 0', marginTop: 12,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: isCenter ? '0 -6px 40px rgba(245,158,11,0.4)' : 'none',
                  }}>
                    <span style={{ fontSize: 36 }}>{m.medal}</span>
                    <span style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>{m.label}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 4th+ */}
          {rest.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {rest.map((person, i) => (
                <div key={person.name} style={{
                  background: '#111d30', border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '10px 16px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ color: DIM, fontSize: 13, fontWeight: 700, minWidth: 22 }}>
                    {i + 4}.
                  </span>
                  {person.photo
                    ? <img src={person.photo} alt={person.initials} style={{
                        width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
                        border: `2px solid ${person.color}`, flexShrink: 0,
                      }} />
                    : <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: person.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>{person.initials}</div>
                  }
                  <div>
                    <p style={{ color: '#cbd0e0', fontSize: 13, marginBottom: 2 }}>{person.name}</p>
                    <p style={{ color: person.color, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                      {fmt(person.value)}
                    </p>
                    <MetaRow person={person} showSpare={enableSpare} />
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
          width: '100%', maxWidth: 580, padding: '0 24px',
        }}>
          {standings.map((person, i) => {
            const medalEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
            const isFirst    = i === 0
            return (
              <div key={person.name} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: isFirst ? 'rgba(245,158,11,0.08)' : 'rgba(15,23,42,0.6)',
                border: `1px solid ${isFirst ? 'rgba(245,158,11,0.25)' : BORDER}`,
                borderRadius: 12, padding: '12px 18px',
                boxShadow: isFirst ? '0 0 20px rgba(245,158,11,0.1)' : 'none',
              }}>
                {/* Rank */}
                <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                  {medalEmoji
                    ? <span style={{ fontSize: 26 }}>{medalEmoji}</span>
                    : <span style={{ color: DIM, fontSize: 16, fontWeight: 700 }}>{i + 1}.</span>
                  }
                </div>

                {/* Avatar */}
                {person.photo
                  ? <img src={person.photo} alt={person.initials} style={{
                      width: isFirst ? 56 : 46, height: isFirst ? 56 : 46,
                      borderRadius: '50%', objectFit: 'cover',
                      border: `2px solid ${person.color}`,
                      boxShadow: isFirst ? `0 0 0 2px ${person.color}44, 0 0 20px ${person.color}66` : 'none',
                      flexShrink: 0,
                    }} />
                  : <div style={{
                      width: isFirst ? 56 : 46, height: isFirst ? 56 : 46,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isFirst ? 20 : 16, fontWeight: 800, color: '#fff',
                      border: `2px solid ${person.color}`,
                      boxShadow: isFirst ? `0 0 0 2px ${person.color}44, 0 0 20px ${person.color}66` : 'none',
                      flexShrink: 0,
                    }}>
                      {person.initials}
                    </div>
                }

                {/* Name + secondary metrics */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{
                      color: isFirst ? '#fff' : '#cbd0e0',
                      fontSize: isFirst ? 16 : 14,
                      fontWeight: isFirst ? 700 : 500,
                    }}>{person.name}</p>
                    {isFirst && (
                      <span style={{
                        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: 8, padding: '1px 7px', fontSize: 9,
                        color: GOLD, fontWeight: 800, letterSpacing: 0.8,
                      }}>TOP SELLER</span>
                    )}
                  </div>
                  <MetaRow person={person} isFirst={false} showSpare={enableSpare} />
                </div>

                {/* Value */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    color: isFirst ? GOLD : person.color,
                    fontSize: isFirst ? 22 : 17,
                    fontWeight: 800,
                    textShadow: pulse && isFirst ? `0 0 16px ${GOLD}` : 'none',
                    transition: 'text-shadow 0.3s',
                  }}>
                    {fmt(person.value)}
                  </div>
                  {rankTab === 'hybrid' && person.extra && (
                    <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>
                      ${person.extra.subtotal.toFixed(2)} + ${person.extra.spare.toFixed(2)} spare
                    </div>
                  )}
                  <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>
                    net sales
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Live / source indicator */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10, color: DIM, fontSize: 11,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: fetching ? '#f59e0b' : '#22c55e',
          boxShadow: pulse ? '0 0 10px #22c55e' : 'none',
          transition: 'box-shadow 0.3s',
        }} />
        {fetching ? 'Updating…' : lastUpdated
          ? `Updated ${fmtTime(lastUpdated)}`
          : 'Local data'
        }
        {dataSource === 'supabase' && (
          <span style={{
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)',
            borderRadius: 8, padding: '1px 7px', color: '#60a5fa',
            fontSize: 10, fontWeight: 600,
          }}>
            Cross-kiosk
          </span>
        )}
        <span style={{ color: '#253349' }}>·</span>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

const MOCK_STANDINGS = [
  { name: 'Raphaela', sales: 284.98,  initials: 'RA', color: '#f59e0b' },
  { name: 'Rafael',   sales: 210.50,  initials: 'RF', color: '#60a5fa' },
  { name: 'Natalia',  sales: 145.00,  initials: 'NA', color: '#a78bfa' },
  { name: 'Nate',     sales: 45.00,   initials: 'NT', color: '#34d399' },
]

export default function Competition({ onClose }) {
  const [standings, setStandings] = useState(
    [...MOCK_STANDINGS].sort((a, b) => b.sales - a.sales)
  )
  const [pulse, setPulse] = useState(false)

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setStandings(prev => {
        const updated = prev.map(s => ({
          ...s,
          sales: s.sales + (Math.random() > 0.7 ? Math.floor(Math.random() * 80) + 20 : 0)
        }))
        return updated.sort((a, b) => b.sales - a.sales)
      })
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const [first, second, third, ...rest] = standings

  const MEDALS = {
    0: { label: '1st', bg: 'linear-gradient(135deg, #f59e0b, #d97706)', height: 200, medal: '🥇' },
    1: { label: '2nd', bg: 'linear-gradient(135deg, #9ca3af, #6b7280)', height: 160, medal: '🥈' },
    2: { label: '3rd', bg: 'linear-gradient(135deg, #b45309, #92400e)', height: 130, medal: '🥉' },
  }

  const podium = [second, first, third].filter(Boolean)
  const podiumOrder = [1, 0, 2] // visual order: 2nd left, 1st center, 3rd right

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at center, #1a2a4a 0%, #0a0a1a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20,
        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6, color: '#fff', padding: '8px 16px', cursor: 'pointer', fontSize: 14
      }}>✕ Close</button>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: '#f59e0b', fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>
          Competition
        </h1>
        <p style={{ color: '#60a5fa', fontSize: 16, marginTop: 4 }}>
          Total Sales by Employee Today
        </p>
        {first && (
          <p style={{
            color: '#fff', fontSize: 14, marginTop: 8,
            background: 'rgba(245,158,11,0.2)', padding: '6px 20px',
            borderRadius: 20, display: 'inline-block'
          }}>
            Winner: <strong style={{ color: '#f59e0b' }}>{first.name}</strong> — ${first.sales.toFixed(2)}
          </p>
        )}
      </div>

      {/* Podium */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 40 }}>
        {[second, first, third].map((person, visualIdx) => {
          if (!person) return <div key={visualIdx} style={{ width: 140 }} />
          const rank = standings.indexOf(person)
          const m = MEDALS[rank] || MEDALS[2]
          const isCenter = visualIdx === 1

          return (
            <div key={person.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', width: 150
            }}>
              {/* Avatar */}
              <div style={{
                width: isCenter ? 90 : 72, height: isCenter ? 90 : 72,
                borderRadius: '50%', background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isCenter ? 32 : 26, fontWeight: 800, color: '#fff',
                border: `3px solid ${person.color}`,
                boxShadow: isCenter ? `0 0 30px ${person.color}66` : 'none',
                marginBottom: 8,
                transition: 'all 0.5s ease'
              }}>
                {person.initials}
              </div>

              {/* Name + amount */}
              <p style={{ color: '#fff', fontSize: isCenter ? 16 : 13, fontWeight: 700, marginBottom: 2 }}>
                {person.name}
              </p>
              <p style={{
                color: person.color, fontSize: isCenter ? 20 : 15,
                fontWeight: 800, marginBottom: 8,
                textShadow: pulse && isCenter ? `0 0 20px ${person.color}` : 'none',
                transition: 'text-shadow 0.3s'
              }}>
                ${person.sales.toFixed(2)}
              </p>

              {/* Podium block */}
              <div style={{
                width: 140, height: m.height, background: m.bg,
                borderRadius: '8px 8px 0 0',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: isCenter ? '0 -4px 30px rgba(245,158,11,0.4)' : 'none'
              }}>
                <span style={{ fontSize: 32 }}>{m.medal}</span>
                <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{m.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rest of standings */}
      {rest.length > 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          {rest.map((person, i) => (
            <div key={person.name} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '10px 20px',
              display: 'flex', alignItems: 'center', gap: 12
            }}>
              <span style={{ color: '#666', fontSize: 14 }}>{i + 4}.</span>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: person.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff'
              }}>{person.initials}</div>
              <div>
                <p style={{ color: '#ccc', fontSize: 13 }}>{person.name}</p>
                <p style={{ color: person.color, fontSize: 14, fontWeight: 700 }}>${person.sales.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live indicator */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 12
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#4caf50',
          animation: 'none', boxShadow: pulse ? '0 0 8px #4caf50' : 'none'
        }} />
        Live — updates in real time
      </div>
    </div>
  )
}

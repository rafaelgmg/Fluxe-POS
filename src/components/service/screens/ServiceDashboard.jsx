import { C, R, GRAD, GLOW } from '../../../styles/ds'

export default function ServiceDashboard({ posSession, currentUser }) {
  const stats = [
    { label: 'Appointments Today', value: '—', color: C.blue },
    { label: 'Clients',            value: '—', color: C.teal },
    { label: "Today's Revenue",    value: '—', color: C.green },
    { label: 'Pending Follow-ups', value: '—', color: C.amber },
  ]

  return (
    <div style={{ padding: 28, overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h2>
        <p style={{ color: C.textSub, fontSize: 13, margin: '4px 0 0' }}>
          {posSession?.location} · Overview
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: R.lg,
            padding: '18px 20px',
            boxShadow: GLOW.card,
          }}>
            <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ color: s.color, fontSize: 28, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Coming soon banner */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: '32px 24px',
        textAlign: 'center',
        color: C.textMuted,
        fontSize: 14,
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
        <div style={{ color: C.textSub, fontWeight: 600 }}>Dashboard in progress</div>
        <div style={{ marginTop: 6, fontSize: 13 }}>Appointment trends, revenue charts, and staff activity will appear here.</div>
      </div>
    </div>
  )
}

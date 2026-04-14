import { C, R, GLOW } from '../../../styles/ds'

export default function ServiceReports() {
  return (
    <div style={{ padding: 28, overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: 0 }}>Reports</h2>
        <p style={{ color: C.textSub, fontSize: 13, margin: '4px 0 0' }}>Revenue, bookings, and staff performance</p>
      </div>

      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: '48px 24px',
        textAlign: 'center',
        boxShadow: GLOW.card,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
        <div style={{ color: C.textSub, fontWeight: 600, fontSize: 16 }}>Reports module coming soon</div>
        <div style={{ color: C.textMuted, fontSize: 13, marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
          Daily revenue, bookings by service, staff utilization, and end-of-day reports will be available here.
        </div>
      </div>
    </div>
  )
}

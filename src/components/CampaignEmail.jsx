const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const TEXT   = '#f1f5f9'
const MUTED  = '#94a3b8'
const DIM    = '#415569'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const BG     = '#030e1e'

export default function CampaignEmail() {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, padding: 40 }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>

        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
          background: 'rgba(59,130,246,0.12)', border: `1px solid rgba(59,130,246,0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          ✉
        </div>

        <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 22, marginBottom: 10 }}>Email Campaign</h2>
        <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          Email campaigns let you send personalized messages to your customer list.<br />
          This module is ready for configuration — just needs an email provider (SendGrid, Resend, or Mailgun).
        </p>

        {/* Feature list */}
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '20px 24px', textAlign: 'left', marginBottom: 20,
        }}>
          <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 14 }}>WHAT'S PLANNED</p>
          {[
            ['Same 3-step flow as SMS Campaign',         true],
            ['Select customers with filters',            true],
            ['HTML email composer with preview',         true],
            ['Variables: {first_name}, {store_name}',   true],
            ['Unsubscribe link (CAN-SPAM compliant)',    true],
            ['Send via SendGrid / Resend / Mailgun',     false],
            ['Open rate & click tracking',               false],
          ].map(([label, ready]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid rgba(37,51,73,0.5)` }}>
              <span style={{ fontSize: 14, color: ready ? '#22c55e' : DIM, flexShrink: 0 }}>{ready ? '✓' : '○'}</span>
              <span style={{ color: ready ? TEXT : MUTED, fontSize: 13 }}>{label}</span>
              {!ready && <span style={{ marginLeft: 'auto', fontSize: 10, color: DIM, background: 'rgba(71,85,105,0.15)', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '1px 6px' }}>Needs provider</span>}
            </div>
          ))}
        </div>

        {/* Note */}
        <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.07)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 8 }}>
          <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>To enable email sending</p>
          <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
            Add <code style={{ background: BG, padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>EMAIL_PROVIDER</code> and <code style={{ background: BG, padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>EMAIL_API_KEY</code> to <code style={{ background: BG, padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>server/.env</code> and deploy.
          </p>
        </div>

      </div>
    </div>
  )
}

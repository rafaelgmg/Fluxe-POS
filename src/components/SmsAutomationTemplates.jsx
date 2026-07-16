import { useState, useEffect, useCallback } from 'react'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const TEXT   = '#f1f5f9'
const SUB    = '#cbd0e0'
const MUTED  = '#94a3b8'
const DIM    = '#415569'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'

const TEMPLATE_META = [
  {
    key:    'thank_you',
    label:  'Thank You (D+1)',
    icon:   '🧴',
    desc:   'Enviada 1 dia após a compra, às 11h.',
    vars:   ['{first_name}', '{product}', '{store}', '{location}'],
    sample: { first_name: 'Maria', product: 'Tom Ford Black Orchid', store: 'Perfume Passage', location: 'Miracle Mall 01' },
  },
  {
    key:    'tip',
    label:  'Fragrance Tip (D+7)',
    icon:   '💡',
    desc:   'Enviada 7 dias após a compra, às 11h. {fragrance_tip} é preenchido automaticamente com base na preferência do cliente.',
    vars:   ['{first_name}', '{product}', '{fragrance_tip}', '{store}', '{location}'],
    sample: { first_name: 'Maria', product: 'Tom Ford Black Orchid', fragrance_tip: 'A little goes a long way with oud — 2 sprays is perfect for all day wear.', store: 'Perfume Passage', location: 'Miracle Mall 01' },
  },
  {
    key:    'comeback',
    label:  'Come Back (D+30)',
    icon:   '🌟',
    desc:   'Enviada 30 dias após a compra, às 11h. {pref_line} é preenchido automaticamente com base na preferência do cliente.',
    vars:   ['{first_name}', '{pref_line}', '{store}', '{location}'],
    sample: { first_name: 'Maria', pref_line: 'We have new arrivals in Oriental / Oud that we think you\'ll love. ', store: 'Perfume Passage', location: 'Miracle Mall 01' },
  },
  {
    key:     'birthday',
    label:   'Birthday',
    icon:    '🎂',
    desc:    'Enviada no aniversário do cliente, às 9h.',
    vars:    ['{first_name}', '{store}', '{location}'],
    sample:  { first_name: 'Maria', store: 'Perfume Passage', location: 'Miracle Mall 01' },
  },
]

const DEFAULT_TEMPLATES = {
  thank_you: `Hi {first_name}! 🧴 Thank you for visiting {store} at {location}. We hope you're loving your {product}! Any questions about your fragrance, just reply here. Reply STOP to unsubscribe.`,
  tip:       `Hi {first_name}! 💡 Quick tip for your {product}: {fragrance_tip} Visit us at {store} anytime for more personalized recommendations. Reply STOP to unsubscribe.`,
  comeback:  `Hi {first_name}! 🌟 It's been a month since your last visit to {store}. {pref_line}Come see us at {location} — mention this text for a special surprise! Reply STOP to unsubscribe.`,
  birthday:  `Happy Birthday {first_name}! 🎂🧴 The whole team at {store} wishes you an amazing day. Come visit us and we'll have a special birthday treat for you! Reply STOP to unsubscribe.`,
}

function resolvePreview(tpl, sample) {
  if (!tpl) return ''
  return Object.entries(sample).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
    tpl,
  )
}

function smsSegments(text) {
  const len = (text || '').length
  if (len === 0) return 0
  return len <= 160 ? 1 : Math.ceil(len / 153)
}

export default function SmsAutomationTemplates() {
  const [templates,    setTemplates]    = useState(DEFAULT_TEMPLATES)
  const [drafts,       setDrafts]       = useState(DEFAULT_TEMPLATES)
  const [activeKey,    setActiveKey]    = useState('thank_you')
  const [loadState,    setLoadState]    = useState('idle')   // idle | loading | loaded | error
  const [saveState,    setSaveState]    = useState('idle')   // idle | saving | saved | error
  const [serverOnline, setServerOnline] = useState(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const res  = await fetch(`${SERVER_URL}/api/sms/templates`, { signal: AbortSignal.timeout(4000) })
      const data = await res.json()
      setTemplates(data)
      setDrafts(data)
      setLoadState('loaded')
      setServerOnline(true)
    } catch {
      setLoadState('error')
      setServerOnline(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, value) => {
    setDrafts(d => ({ ...d, [key]: value }))
    if (saveState === 'saved') setSaveState('idle')
  }

  const handleReset = (key) => {
    handleChange(key, DEFAULT_TEMPLATES[key])
  }

  const handleResetAll = () => {
    setDrafts({ ...DEFAULT_TEMPLATES })
    if (saveState === 'saved') setSaveState('idle')
  }

  const isDirty = Object.keys(drafts).some(k => drafts[k] !== templates[k])
  const hasAnyChange = Object.keys(drafts).some(k => drafts[k] !== DEFAULT_TEMPLATES[k])

  const handleSave = async () => {
    if (saveState === 'saving') return
    setSaveState('saving')
    try {
      const res = await fetch(`${SERVER_URL}/api/sms/templates`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(drafts),
        signal:  AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Server error')
      }
      const saved = await res.json()
      setTemplates(saved)
      setDrafts(saved)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (err) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  const activeMeta = TEMPLATE_META.find(m => m.key === activeKey)
  const draft      = drafts[activeKey] || ''
  const preview    = resolvePreview(draft, activeMeta?.sample || {})
  const segments   = smsSegments(preview)
  const draftDirty = drafts[activeKey] !== templates[activeKey]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 800, fontSize: 16 }}>Auto-SMS Templates</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
            Mensagens enviadas automaticamente após cada compra (D+1, D+7, D+30) e no aniversário.
          </p>
        </div>
        <div style={{ flex: 1 }} />

        {/* Server status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {serverOnline === false && (
            <span style={{ fontSize: 12, color: AMBER, display: 'flex', alignItems: 'center', gap: 5 }}>
              ⚠ Servidor offline — editando localmente
            </span>
          )}
          {serverOnline === true && (
            <span style={{ fontSize: 12, color: GREEN }}>✓ Servidor conectado</span>
          )}
        </div>

        {/* Actions */}
        {hasAnyChange && (
          <button
            onClick={handleResetAll}
            style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED }}
          >
            Restaurar padrões
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={!isDirty || saveState === 'saving' || serverOnline === false}
          style={{
            padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: isDirty && saveState === 'idle' && serverOnline !== false ? 'pointer' : 'not-allowed',
            background: saveState === 'saved' ? 'rgba(34,197,94,0.15)'
              : saveState === 'error'  ? 'rgba(239,68,68,0.15)'
              : isDirty ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
              : 'rgba(59,130,246,0.06)',
            border: saveState === 'saved' ? `1px solid rgba(34,197,94,0.4)`
              : saveState === 'error'  ? `1px solid rgba(239,68,68,0.4)`
              : `1px solid ${isDirty ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)'}`,
            color: saveState === 'saved' ? GREEN
              : saveState === 'error'  ? RED
              : isDirty ? '#fff' : DIM,
            boxShadow: isDirty && saveState === 'idle' ? '0 0 14px rgba(59,130,246,0.25)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? '✓ Salvo' : saveState === 'error' ? '⚠ Erro' : 'Salvar templates'}
        </button>
      </div>

      {/* Loading state */}
      {loadState === 'loading' && (
        <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 14 }}>
          Carregando templates...
        </div>
      )}

      {loadState !== 'loading' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left sidebar — template selector */}
          <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${BORDER}`, background: PANEL, overflowY: 'auto', padding: '12px 0' }}>
            {TEMPLATE_META.map(meta => {
              const isActive  = meta.key === activeKey
              const isChanged = drafts[meta.key] !== DEFAULT_TEMPLATES[meta.key]
              return (
                <button
                  key={meta.key}
                  onClick={() => setActiveKey(meta.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 16px', background: isActive ? 'rgba(59,130,246,0.10)' : 'transparent',
                    border: 'none', borderLeft: `3px solid ${isActive ? BLUE : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: isActive ? TEXT : SUB, fontSize: 13, fontWeight: isActive ? 700 : 400, lineHeight: 1.2 }}>
                      {meta.label}
                    </div>
                    {isChanged && (
                      <div style={{ fontSize: 10, color: AMBER, marginTop: 2 }}>● modificado</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right — editor */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Template info */}
            <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.06)', border: `1px solid rgba(59,130,246,0.18)`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{activeMeta?.icon}</span>
                <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{activeMeta?.label}</span>
              </div>
              <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.5 }}>{activeMeta?.desc}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Variables */}
                <div>
                  <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
                    VARIÁVEIS DISPONÍVEIS
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {activeMeta?.vars.map(v => (
                      <button
                        key={v}
                        onClick={() => handleChange(activeKey, draft + v)}
                        title="Clique para inserir no final"
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
                          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
                          color: '#93c5fd', transition: 'all 0.15s',
                        }}
                      >{v}</button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
                    TEXTO DA MENSAGEM
                    {draftDirty && <span style={{ color: AMBER, marginLeft: 8, fontWeight: 400 }}>● não salvo</span>}
                  </label>
                  <textarea
                    value={draft}
                    onChange={e => handleChange(activeKey, e.target.value)}
                    style={{
                      flex: 1, minHeight: 140, padding: '10px 12px', background: CARD,
                      border: `1px solid ${draftDirty ? 'rgba(245,158,11,0.4)' : BORDER}`,
                      borderRadius: 8, color: TEXT, fontSize: 13,
                      outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = BLUE }}
                    onBlur={e => { e.target.style.borderColor = draftDirty ? 'rgba(245,158,11,0.4)' : BORDER }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: DIM }}>
                      <span style={{ color: segments > 1 ? AMBER : MUTED }}>{preview.length} chars</span>
                      {' · '}
                      <span style={{ color: segments > 1 ? AMBER : MUTED }}>{segments} SMS</span>
                      {segments > 1 && <span style={{ color: AMBER }}> (multipart)</span>}
                    </span>
                    <button
                      onClick={() => handleReset(activeKey)}
                      style={{ fontSize: 11, color: DIM, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Restaurar padrão
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
                    PREVIEW
                    <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>com dados de exemplo</span>
                  </label>

                  {/* Phone mockup */}
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, minHeight: 180 }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: DIM }}>Perfume Passage · agora</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{
                        background: BLUE, borderRadius: '16px 16px 4px 16px',
                        padding: '10px 14px', maxWidth: '90%',
                        color: '#fff', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                      }}>
                        {preview || <span style={{ opacity: 0.4 }}>Digite a mensagem...</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sample values reference */}
                <div style={{ padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                  <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>VALORES DE EXEMPLO</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {activeMeta && Object.entries(activeMeta.sample).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' }}>
                        <span style={{ color: '#93c5fd', fontFamily: 'monospace', flexShrink: 0 }}>{`{${k}}`}</span>
                        <span style={{ color: MUTED, flex: 1, lineHeight: 1.4 }}>→ {v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Carrier requirement */}
                <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 8 }}>
                  <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Requisito da operadora</p>
                  <p style={{ color: SUB, fontSize: 11, lineHeight: 1.5 }}>
                    Mantenha "Reply STOP to unsubscribe." no final. Clientes que respondem STOP são bloqueados automaticamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

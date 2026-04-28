/**
 * ds.js — Design System
 * Dark premium theme — Inter font, gradient primary, glow effects.
 * Import { C, R, GRAD, GLOW, ui } in any component.
 */

// ── Typography scale ──────────────────────────────────────────────────────────
export const FS = {
  xs:  11,   // labels, badges, hints
  sm:  12,   // secondary text, table labels
  md:  14,   // default body, inputs, buttons
  lg:  16,   // product names, section titles
  xl:  20,   // totals, large values
  xxl: 28,   // hero numbers
  mono: { family: "'Courier New', Courier, monospace", size: 15 },
}

// ── Color tokens — reference CSS variables so components using C.* auto-theme
export const C = {
  // Backgrounds (theme-aware via CSS vars set by ThemeProvider)
  bg:        'var(--c-bg)',
  bgPanel:   'var(--c-bg-panel)',
  bgCard:    'var(--c-bg-card)',
  bgHover:   'var(--c-bg-hover)',
  bgActive:  'var(--c-bg-active)',
  bgGlass:   'var(--c-bg-glass)',

  // Borders
  border:      'var(--c-border)',
  borderMd:    'var(--c-border-md)',
  borderFocus: '#3b82f6',
  borderGlass: 'rgba(255,255,255,0.07)',

  // Text
  text:      'var(--c-text)',
  textSub:   'var(--c-text-sub)',
  textMuted: 'var(--c-text-muted)',
  textDim:   'var(--c-text-dim)',

  // Brand (fixed — work on both light and dark)
  blue:      '#3b82f6',
  blueHv:    '#1d4ed8',
  blueDim:   'rgba(37,99,235,0.12)',
  blueGlow:  'rgba(37,99,235,0.30)',
  purple:    '#7c3aed',
  purpleSoft:'#8b5cf6',
  purpleDim: 'rgba(124,58,237,0.12)',

  // Semantic (fixed)
  green:     '#22c55e',
  greenDim:  'rgba(34,197,94,0.12)',
  red:       '#ef4444',
  redDim:    'rgba(239,68,68,0.12)',
  amber:     '#f59e0b',
  amberDim:  'rgba(245,158,11,0.12)',
  teal:      '#06b6d4',
  tealDim:   'rgba(6,182,212,0.12)',
}

// ── Border radii ──────────────────────────────────────────────────────────────
export const R = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   20,
  full: 9999,
}

// ── Gradients ─────────────────────────────────────────────────────────────────
export const GRAD = {
  primary:  'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
  primaryHv:'linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)',
  success:  'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
  danger:   'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
  amber:    'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
  dark:     'linear-gradient(160deg, #0d1829 0%, #0d1526 100%)',
  card:     'linear-gradient(160deg, #111d30 0%, #0d1526 100%)',
}

// ── Shadows / Glow ────────────────────────────────────────────────────────────
export const GLOW = {
  blue:   '0 0 20px rgba(37,99,235,0.35)',
  blueSm: '0 0 12px rgba(37,99,235,0.25)',
  blueLg: '0 0 40px rgba(37,99,235,0.45)',
  purple: '0 0 20px rgba(124,58,237,0.35)',
  green:  '0 0 16px rgba(34,197,94,0.30)',
  red:    '0 0 16px rgba(239,68,68,0.30)',
  amber:  '0 0 16px rgba(245,158,11,0.30)',
  modal:  '0 24px 80px rgba(0,0,0,0.75)',
  card:   '0 8px 32px rgba(0,0,0,0.40)',
}

// ── Transitions ───────────────────────────────────────────────────────────────
export const T = {
  fast:   'all 0.15s ease',
  std:    'all 0.2s ease',
  slow:   'all 0.3s ease',
}

// ── Shared style helpers ──────────────────────────────────────────────────────

export const modalOverlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,2,15,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

export const modalCard = (extra = {}) => ({
  background: GRAD.dark,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: GLOW.modal,
  ...extra,
})

export const panelHeader = (extra = {}) => ({
  padding: '14px 22px',
  background: C.bgCard,
  borderBottom: `1px solid ${C.border}`,
  display: 'flex', alignItems: 'center', gap: 12,
  flexShrink: 0,
  ...extra,
})

export const tableHeader = {
  background: C.bgCard,
  padding: '10px 14px',
  fontSize: 12,
  color: C.textMuted,
  fontWeight: 600,
  letterSpacing: 0.5,
  borderBottom: `1px solid ${C.border}`,
  textTransform: 'uppercase',
}

export const tableRow = (idx = 0, extra = {}) => ({
  borderBottom: `1px solid ${C.border}`,
  background: idx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.5)',
  transition: T.fast,
  ...extra,
})

export const inputStyle = (error = false, extra = {}) => ({
  width: '100%',
  padding: '9px 13px',
  background: C.bgCard,
  border: `1px solid ${error ? C.red : C.border}`,
  borderRadius: R.md,
  color: C.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: T.std,
  ...extra,
})

export const selectStyle = (extra = {}) => ({
  ...inputStyle(false),
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 34,
  ...extra,
})

/**
 * Tab button style — segmented control look.
 * active: gradient + glow  |  inactive: glass + gray text
 */
export const tabStyle = (active = false, extra = {}) => ({
  padding: '8px 16px',
  border: `1px solid ${active ? 'transparent' : C.border}`,
  borderRadius: R.md,
  background: active ? GRAD.primary : C.bgGlass,
  color: active ? '#fff' : C.textSub,
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  letterSpacing: 0.2,
  boxShadow: active ? GLOW.blue : 'none',
  transition: T.std,
  whiteSpace: 'nowrap',
  ...extra,
})

export const btnPrimary = (disabled = false, extra = {}) => ({
  padding: '11px 22px',
  background: disabled ? C.bgCard : GRAD.primary,
  border: 'none',
  borderRadius: R.md,
  color: disabled ? C.textMuted : '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.3,
  boxShadow: disabled ? 'none' : GLOW.blueSm,
  transition: T.std,
  ...extra,
})

export const btnSecondary = (extra = {}) => ({
  padding: '10px 20px',
  background: C.bgGlass,
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  color: C.textSub,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: T.std,
  ...extra,
})

export const btnGhost = (extra = {}) => ({
  padding: '9px 16px',
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  color: C.textSub,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: T.std,
  ...extra,
})

export const btnDanger = (extra = {}) => ({
  padding: '10px 20px',
  background: C.redDim,
  border: `1px solid rgba(239,68,68,0.3)`,
  borderRadius: R.md,
  color: '#fca5a5',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  transition: T.std,
  ...extra,
})

export const numpadBtn = (extra = {}) => ({
  padding: '14px 0',
  background: C.bgCard,
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  color: C.text,
  fontSize: 18,
  fontWeight: 600,
  cursor: 'pointer',
  transition: T.fast,
  ...extra,
})

export const label = (extra = {}) => ({
  display: 'block',
  color: C.textMuted,
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 6,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  ...extra,
})

export const cardStyle = (extra = {}) => ({
  background: C.bgGlass,
  border: `1px solid ${C.borderGlass}`,
  borderRadius: R.lg,
  boxShadow: GLOW.card,
  ...extra,
})

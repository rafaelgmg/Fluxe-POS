/**
 * themes.js — Fluxe Theme Tokens
 * Each theme is a flat object of CSS custom property key → value.
 * Applied via `style={tokens}` on the root div — cascades to all children.
 * Components that reference `var(--c-*)` in inline styles automatically respond.
 */

export const DARK = {
  // Backgrounds
  '--c-bg':        '#030e1e',
  '--c-bg-panel':  '#0d1526',
  '--c-bg-card':   '#111d30',
  '--c-bg-hover':  '#131d35',
  '--c-bg-active': '#1a2744',
  '--c-bg-glass':  'rgba(255,255,255,0.035)',
  // Borders
  '--c-border':    '#253349',
  '--c-border-md': '#263354',
  // Text
  '--c-text':       '#f1f5f9',
  '--c-text-sub':   '#cbd0e0',
  '--c-text-muted': '#94a3b8',
  '--c-text-dim':   '#415569',
  // Scrollbar
  '--c-scrollbar':  '#253349',
  '--c-scrollbar-hover': '#415569',
  // Overlay
  '--c-overlay':   'rgba(0,2,15,0.88)',
  // Gradient background
  '--c-bg-grad':   'radial-gradient(ellipse at top, #0d1829 0%, #030e1e 60%)',
}

export const LIGHT = {
  // Backgrounds
  '--c-bg':        '#f0f4f8',
  '--c-bg-panel':  '#ffffff',
  '--c-bg-card':   '#f8fafc',
  '--c-bg-hover':  '#e8edf2',
  '--c-bg-active': '#dde4eb',
  '--c-bg-glass':  'rgba(0,0,0,0.03)',
  // Borders
  '--c-border':    '#e2e8f0',
  '--c-border-md': '#cbd5e1',
  // Text
  '--c-text':       '#0f172a',
  '--c-text-sub':   '#1e293b',
  '--c-text-muted': '#475569',
  '--c-text-dim':   '#94a3b8',
  // Scrollbar
  '--c-scrollbar':  '#cbd5e1',
  '--c-scrollbar-hover': '#94a3b8',
  // Overlay
  '--c-overlay':   'rgba(0,0,0,0.60)',
  // Gradient background
  '--c-bg-grad':   '#f0f4f8',
}

/** The two named themes available in the app */
export const THEMES = {
  dark:  DARK,
  light: LIGHT,
}

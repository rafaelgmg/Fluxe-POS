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
  // Backgrounds — Stripe/Square inspired
  '--c-bg':        '#F9FAFB',      // page background (Tailwind gray-50)
  '--c-bg-panel':  '#FFFFFF',      // nav, sidebars, panels
  '--c-bg-card':   '#FFFFFF',      // cards, tables
  '--c-bg-hover':  '#F3F4F6',      // row hover
  '--c-bg-active': '#E5E7EB',      // pressed / active
  '--c-bg-glass':  'rgba(0,0,0,0.025)',
  // Borders — hair-thin, not heavy
  '--c-border':    '#E5E7EB',      // Tailwind gray-200
  '--c-border-md': '#D1D5DB',      // Tailwind gray-300
  // Text — near-black hierarchy
  '--c-text':       '#111827',     // Tailwind gray-900
  '--c-text-sub':   '#374151',     // Tailwind gray-700
  '--c-text-muted': '#6B7280',     // Tailwind gray-500 (Stripe secondary)
  '--c-text-dim':   '#9CA3AF',     // Tailwind gray-400
  // Scrollbar
  '--c-scrollbar':  '#D1D5DB',
  '--c-scrollbar-hover': '#9CA3AF',
  // Overlay
  '--c-overlay':   'rgba(17,24,39,0.55)',
  // Gradient background (flat in light — no gradient noise)
  '--c-bg-grad':   '#F9FAFB',
}

/** The two named themes available in the app */
export const THEMES = {
  dark:  DARK,
  light: LIGHT,
}

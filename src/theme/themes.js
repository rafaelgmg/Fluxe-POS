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
  '--c-bg-stripe': 'rgba(15,23,42,0.5)',   // alternating table rows
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
  // Backgrounds — Square/Stripe/Notion inspired
  '--c-bg':        '#F3F4F6',      // page bg — clearly separated from white cards
  '--c-bg-panel':  '#FFFFFF',      // nav, sidebar — white panels pop against bg
  '--c-bg-card':   '#FFFFFF',      // cards, modals
  '--c-bg-hover':  '#EAF0F7',      // visible but not aggressive row hover
  '--c-bg-active': '#DCE4EF',      // pressed state
  '--c-bg-glass':  'rgba(0,0,0,0.025)',
  '--c-bg-stripe': '#F8FAFC',      // alternating table rows (barely-there tint)
  // Borders — present but not heavy
  '--c-border':    '#E2E8F0',      // subtle section dividers
  '--c-border-md': '#C9D3DF',      // inputs, more prominent edges
  // Text — high contrast hierarchy
  '--c-text':       '#111827',     // near-black (Tailwind gray-900)
  '--c-text-sub':   '#374151',     // Tailwind gray-700
  '--c-text-muted': '#6B7280',     // Tailwind gray-500
  '--c-text-dim':   '#9CA3AF',     // Tailwind gray-400
  // Scrollbar
  '--c-scrollbar':  '#D1D5DB',
  '--c-scrollbar-hover': '#9CA3AF',
  // Overlay
  '--c-overlay':   'rgba(17,24,39,0.55)',
  // Gradient background
  '--c-bg-grad':   '#F3F4F6',
}

/** The two named themes available in the app */
export const THEMES = {
  dark:  DARK,
  light: LIGHT,
}

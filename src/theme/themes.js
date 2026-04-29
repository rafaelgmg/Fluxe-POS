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
  '--c-bg-stripe': 'rgba(15,23,42,0.5)',
  // Borders
  '--c-border':    '#253349',
  '--c-border-md': '#263354',
  '--c-border-row':'rgba(30,41,59,0.55)',   // row dividers (lighter than section borders)
  // Shadows
  '--c-shadow-card':     '0 8px 32px rgba(0,0,0,0.40)',
  '--c-shadow-bar':      'none',
  // CTA button (Complete Sale)
  '--c-btn-cta-bg':      'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
  '--c-btn-cta-shadow':  '0 0 24px rgba(37,99,235,0.35)',
  '--c-btn-cta-shadow-hv':'0 0 36px rgba(37,99,235,0.5)',
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
  '--c-bg-hover':  '#E5E7EB',      // row/button hover (Tailwind gray-200)
  '--c-bg-active': '#DCE4EF',      // pressed state
  '--c-bg-glass':  'rgba(0,0,0,0.025)',
  '--c-bg-stripe': '#F3F4F6',      // alternating table rows / keypad buttons
  // Borders — present but not heavy
  '--c-border':    '#D1D5DB',      // section dividers (Tailwind gray-300)
  '--c-border-md': '#C9D3DF',      // inputs, prominent edges
  '--c-border-row':'#E5E7EB',      // row dividers (Tailwind gray-200)
  // Shadows — subtle depth, no heavy drop shadows
  '--c-shadow-card':      '0 4px 12px rgba(0,0,0,0.08)',
  '--c-shadow-bar':       '0 1px 3px rgba(0,0,0,0.06)',
  // CTA button (Complete Sale)
  '--c-btn-cta-bg':       '#4F46E5',
  '--c-btn-cta-shadow':   '0 4px 12px rgba(79,70,229,0.30)',
  '--c-btn-cta-shadow-hv':'0 6px 18px rgba(79,70,229,0.45)',
  // Text — high contrast hierarchy
  '--c-text':       '#0F172A',     // Tailwind slate-900 — deep, high-contrast
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

import { useState, useEffect, useRef } from 'react'

/**
 * BarcodeModal — modal para digitar ou escanear um barcode.
 *
 * Props:
 *   onConfirm(code: string) — chamado ao confirmar
 *   onClose()               — chamado ao fechar
 *   title                   — texto do header (opcional)
 */
export default function BarcodeModal({ onConfirm, onClose, title = 'Scan / Enter Barcode' }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  // Foca o input ao abrir
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  // Fecha com Escape
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])

  const handleConfirm = () => {
    const code = value.trim()
    if (code) onConfirm(code)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleConfirm()
  }

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'var(--c-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-bg-panel)',
          border: '1px solid var(--c-border)', borderRadius: 16,
          padding: '28px 28px 24px', width: 360,
          boxShadow: 'var(--c-shadow-card)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Barcode icon */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" />
              <rect x="1" y="3" width="22" height="18" rx="2" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
            </svg>
            <span style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 15 }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--c-border)', borderRadius: 6,
              color: 'var(--c-text-muted)', fontSize: 16, cursor: 'pointer',
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Scan or type barcode..."
          style={{
            width: '100%', padding: '11px 14px', background: 'var(--c-bg-card)',
            border: '1px solid #3b82f6', borderRadius: 8,
            color: 'var(--c-text)', fontSize: 15, outline: 'none',
            boxSizing: 'border-box', letterSpacing: 1,
          }}
        />

        <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 8, marginBottom: 20 }}>
          Press Enter or click Confirm to search
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1, padding: '11px',
              background: 'var(--c-btn-cta-bg)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(37,99,235,0.35)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 32px rgba(37,99,235,0.5)'; e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(37,99,235,0.35)'; e.currentTarget.style.transform = 'scale(1)' }}
          >Confirm</button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', background: 'transparent',
              border: '1px solid var(--c-border)', borderRadius: 8,
              color: 'var(--c-text-muted)', fontSize: 14, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
          >Cancel</button>
        </div>
      </div>
    </div>
  )
}

/**
 * BarcodeIconButton — botão ícone de barcode para usar ao lado de campos de busca.
 *
 * Props:
 *   onClick()    — abre o modal
 *   active       — se o modal estiver aberto (destaca o botão)
 *   size         — tamanho do ícone em px (default 18)
 */
export function BarcodeIconButton({ onClick, active = false, size = 18 }) {
  return (
    <button
      onClick={onClick}
      title="Scan / Enter Barcode"
      style={{
        padding: '6px 10px', cursor: 'pointer', borderRadius: 6,
        background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
        border: `1px solid ${active ? 'rgba(37,99,235,0.5)' : 'var(--c-border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(37,99,235,0.12)'
        e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? 'rgba(37,99,235,0.15)' : 'transparent'
        e.currentTarget.style.borderColor = active ? 'rgba(37,99,235,0.5)' : 'var(--c-border)'
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={active ? '#3b82f6' : '#94a3b8'} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <rect x="1" y="3" width="22" height="18" rx="2"/>
        <line x1="5"  y1="7" x2="5"  y2="17"/>
        <line x1="8"  y1="7" x2="8"  y2="17"/>
        <line x1="11" y1="7" x2="11" y2="17"/>
        <line x1="14" y1="7" x2="14" y2="17"/>
        <line x1="17" y1="7" x2="17" y2="17"/>
        <line x1="20" y1="7" x2="20" y2="17"/>
      </svg>
    </button>
  )
}

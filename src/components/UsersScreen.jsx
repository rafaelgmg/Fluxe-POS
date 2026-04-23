import { useState, useMemo, useRef, useEffect } from 'react'
import { loadUsers, saveUsers, hadStorageError } from '../utils/usersStorage'
import { upsertUserToSupabase } from '../services/supabaseWrite'

const POSITIONS = ['Sales', 'Manager', 'Admin']

const PURPLE = '#8b5cf6'
const BG     = '#020817'
const PANEL  = '#0a0f1e'
const CARD   = '#0f172a'
const BORDER = '#1e293b'

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ user, size = 36 }) {
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || '?'
  if (user.photo) {
    return (
      <img src={user.photo} alt={initials}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BORDER}`, flexShrink: 0 }} />
    )
  }
  const colors = ['#2563eb', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e']
  const bg = colors[user.id % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg + '30', border: `2px solid ${bg}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: bg, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const active = status === 'active'
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
      background: active ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
      border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : '#1e293b'}`,
      color: active ? '#22c55e' : '#64748b',
    }}>
      {active ? '● Active' : '○ Inactive'}
    </span>
  )
}

// ─── User Form Panel (slide) ──────────────────────────────────────────────────

const EMPTY_FORM = {
  firstName: '', lastName: '', position: 'Sales', email: '',
  phone: '', pin: '', status: 'active', photo: null,
}

function UserFormPanel({ user, onSave, onDelete, onClose, isNew, allUsers }) {
  const [form,   setForm]   = useState(() => user ? {
    firstName: user.firstName || '',
    lastName:  user.lastName  || '',
    position:  user.position  || 'Sales',
    email:     user.email     || '',
    phone:     user.phone     || '',
    pin:       user.pin       || '',
    status:    user.status    || 'active',
    photo:     user.photo     || null,
  } : { ...EMPTY_FORM })

  const [errors,       setErrors]       = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'Required'
    if (!form.pin.trim())       e.pin       = 'Required'
    else if (form.pin.length < 4 || isNaN(form.pin)) e.pin = '4-digit number'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    onSave(form)
  }

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => set('photo', ev.target.result)
    reader.readAsDataURL(file)
  }

  const inp = (key, extra = {}) => ({
    value: form[key],
    onChange: e => set(key, e.target.value),
    style: {
      width: '100%', padding: '7px 10px', background: BG,
      border: `1px solid ${errors[key] ? '#ef4444' : BORDER}`,
      borderRadius: 4, color: '#f1f5f9', fontSize: 13,
      boxSizing: 'border-box', outline: 'none',
      ...extra.style,
    },
    onFocus: e => { e.target.style.borderColor = errors[key] ? '#ef4444' : '#2563eb' },
    onBlur:  e => { e.target.style.borderColor = errors[key] ? '#ef4444' : BORDER },
    ...extra,
  })

  const lbl = (text, optional) => (
    <label style={{ color: '#475569', fontSize: 11, marginBottom: 3, display: 'block', letterSpacing: 0.4 }}>
      {text}{optional && <span style={{ color: '#334155', marginLeft: 4, fontWeight: 400 }}>(optional)</span>}
    </label>
  )
  const err = (key) => errors[key] && (
    <p style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>{errors[key]}</p>
  )
  const row = (children, mb = 10) => <div style={{ marginBottom: mb }}>{children}</div>

  return (
    <div style={{
      width: 320, background: PANEL, borderLeft: `2px solid ${PURPLE}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: CARD,
        borderBottom: `1px solid ${PURPLE}44`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13, flex: 1 }}>
          {isNew ? '＋ New User' : '✏ Edit User'}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#64748b',
          fontSize: 20, cursor: 'pointer', lineHeight: 1,
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

        {/* Photo upload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: form.photo ? 'transparent' : CARD,
              border: `2px dashed ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = PURPLE }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER }}
          >
            {form.photo
              ? <img src={form.photo} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 22 }}>📷</span>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
          <div>
            <p style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Profile Photo</p>
            <button onClick={() => fileRef.current?.click()} style={{
              marginTop: 4, padding: '4px 10px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: 4,
              color: '#64748b', fontSize: 11, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = PURPLE; e.currentTarget.style.color = '#c4b5fd' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#64748b' }}
            >
              {form.photo ? 'Change Photo' : 'Upload Photo'}
            </button>
            {form.photo && (
              <button onClick={() => set('photo', null)} style={{
                marginTop: 4, marginLeft: 6, padding: '4px 10px', background: 'transparent',
                border: '1px solid #1e293b', borderRadius: 4,
                color: '#475569', fontSize: 11, cursor: 'pointer',
              }}>Remove</button>
            )}
          </div>
        </div>

        {/* Name row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            {lbl('First Name *')}
            <input {...inp('firstName')} placeholder="Rafael" />
            {err('firstName')}
          </div>
          <div>
            {lbl('Last Name', true)}
            <input {...inp('lastName')} placeholder="Silva" />
          </div>
        </div>

        {row(<>
          {lbl('Position')}
          <select value={form.position} onChange={e => set('position', e.target.value)} style={{
            width: '100%', padding: '7px 10px', background: BG,
            border: `1px solid ${BORDER}`, borderRadius: 4,
            color: '#f1f5f9', fontSize: 13, cursor: 'pointer', outline: 'none',
          }}>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </>)}

        {row(<>
          {lbl('Email', true)}
          <input {...inp('email')} placeholder="email@example.com" type="email" />
        </>)}

        {row(<>
          {lbl('Phone', true)}
          <input {...inp('phone')} placeholder="(702) 555-1234" type="tel" />
        </>)}

        {/* PIN */}
        <div style={{
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 6,
          padding: '10px 12px', marginBottom: 10,
        }}>
          <p style={{ color: '#f59e0b', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>
            🔐 ACCESS — CONFIDENTIAL
          </p>
          {row(<>
            {lbl('PIN * (4 digits — used to clock in/out)')}
            <input {...inp('pin')} placeholder="1234" type="password" maxLength={6} />
            {err('pin')}
          </>, 0)}
        </div>

        {/* Status */}
        <div style={{ marginBottom: 10 }}>
          {lbl('Status')}
          <div style={{ display: 'flex', gap: 8 }}>
            {['active', 'inactive'].map(s => (
              <button key={s} onClick={() => set('status', s)} style={{
                flex: 1, padding: '7px',
                background: form.status === s ? (s === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)') : BG,
                border: `1px solid ${form.status === s ? (s === 'active' ? 'rgba(34,197,94,0.4)' : '#475569') : BORDER}`,
                borderRadius: 4,
                color: form.status === s ? (s === 'active' ? '#22c55e' : '#94a3b8') : '#64748b',
                fontSize: 12, fontWeight: form.status === s ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}>
                {s === 'active' ? '● Active' : '○ Inactive'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: 14, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {!isNew && !confirmDelete && (
          <button onClick={() => setConfirmDelete(true)} style={{
            width: '100%', padding: '8px', marginBottom: 8,
            background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >🗑 Delete User</button>
        )}
        {confirmDelete && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6, padding: '10px 12px', marginBottom: 8,
          }}>
            <p style={{ color: '#fca5a5', fontSize: 11, marginBottom: 8 }}>Confirm delete this user?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onDelete(user.id)} style={{
                flex: 1, padding: '7px', background: '#ef4444', border: 'none',
                borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Yes, Delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{
                flex: 1, padding: '7px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 4, color: '#64748b', fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
        <button onClick={handleSave} style={{
          width: '100%', padding: '11px', background: PURPLE,
          border: 'none', borderRadius: 6, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 0 20px rgba(139,92,246,0.25)', transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed'; e.currentTarget.style.boxShadow = '0 0 28px rgba(139,92,246,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.background = PURPLE; e.currentTarget.style.boxShadow = '0 0 20px rgba(139,92,246,0.25)' }}
        >💾 Save User</button>
      </div>
    </div>
  )
}

// ─── Users Screen ─────────────────────────────────────────────────────────────

export default function UsersScreen({ onBack }) {
  const [users,        setUsers]        = useState(loadUsers)
  const [storageError, setStorageError] = useState(hadStorageError)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editingUser,  setEditingUser]  = useState(null)
  const [isNew,        setIsNew]        = useState(false)

  // On mount: sync from Supabase, merge with local to preserve PINs
  useEffect(() => {
    import('../services/supabaseRead').then(({ fetchUsers }) =>
      fetchUsers().then(remote => {
        if (!remote || remote.length === 0) return
        const local = loadUsers()
        const merged = remote.map(r => {
          const match = local.find(l =>
            l.supabaseId === r.id ||
            `${l.firstName} ${l.lastName}`.trim().toLowerCase() ===
            `${r.firstName} ${r.lastName}`.trim().toLowerCase()
          )
          return { ...r, id: match?.id ?? r.id, supabaseId: r.id, pin: match?.pin || '' }
        })
        saveUsers(merged)
        setUsers(merged)
      }).catch(() => {})
    )
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      const name = `${u.firstName} ${u.lastName}`.toLowerCase()
      const matchSearch = !q || name.includes(q) || (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(q)
      const matchStatus = filterStatus === 'all' || u.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [users, search, filterStatus])

  const persist = (updated) => {
    setUsers(updated)
    saveUsers(updated)
  }

  const normalizeForm = (form) => ({
    ...form,
    firstName: form.firstName.trim(),
    lastName:  form.lastName.trim(),
    email:     form.email.trim(),
    phone:     form.phone.trim(),
  })

  const handleAdd = (form) => {
    const numericIds = users.map(u => (typeof u.id === 'number' ? u.id : 0))
    const newId = Math.max(0, ...numericIds) + 1
    const newUser = { ...normalizeForm(form), id: newId, createdAt: new Date().toISOString() }
    persist([...users, newUser])
    setIsNew(false)
    setEditingUser(null)
    // Sync to Supabase — store returned UUID as supabaseId
    upsertUserToSupabase(newUser).then(supabaseId => {
      if (!supabaseId) return
      setUsers(prev => {
        const updated = prev.map(u => u.id === newId ? { ...u, supabaseId } : u)
        saveUsers(updated)
        return updated
      })
    }).catch(() => {})
  }

  const handleUpdate = (form) => {
    const updated = users.map(u =>
      u.id === editingUser.id ? { ...u, ...normalizeForm(form), updatedAt: new Date().toISOString() } : u
    )
    persist(updated)
    setEditingUser(null)
    // Sync to Supabase
    const target = updated.find(u => u.id === editingUser.id)
    if (target) upsertUserToSupabase(target).catch(() => {})
  }

  const handleDelete = (id) => {
    const target = users.find(u => u.id === id)
    persist(users.filter(u => u.id !== id))
    setEditingUser(null)
    // Soft-delete in Supabase if linked
    if (target?.supabaseId) upsertUserToSupabase({ ...target, status: 'inactive' }).catch(() => {})
  }

  const openNew  = () => { setEditingUser(null); setIsNew(true) }
  const openEdit = (u) => { setIsNew(false); setEditingUser(u) }
  const closePanel = () => { setEditingUser(null); setIsNew(false) }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Storage corruption warning */}
      {storageError && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ color: '#fca5a5', fontSize: 12, flex: 1 }}>
            User data could not be read — a backup was saved as <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>fluxe-users-v1-corrupted-backup</code> in LocalStorage. Showing default users. Check DevTools → Application → LocalStorage.
          </span>
          <button onClick={() => setStorageError(false)} style={{
            background: 'none', border: 'none', color: '#ef4444', fontSize: 16,
            cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {/* Sub-header */}
      <div style={{
        padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`,
        display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#64748b',
          fontSize: 18, cursor: 'pointer', paddingRight: 4, lineHeight: 1,
        }}>←</button>
        <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13 }}>👥 Users</span>
        <span style={{ color: '#475569', fontSize: 11 }}>Settings</span>
        <div style={{ width: 1, height: 16, background: BORDER, margin: '0 4px' }} />

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, phone..."
          style={{
            padding: '6px 12px', background: BG, border: `1px solid ${BORDER}`,
            borderRadius: 4, color: '#f1f5f9', fontSize: 13, width: 220, outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = '#2563eb' }}
          onBlur={e =>  { e.target.style.borderColor = BORDER }}
        />

        {['all', 'active', 'inactive'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            padding: '5px 12px', fontSize: 11, cursor: 'pointer',
            background: filterStatus === s ? PURPLE + '22' : 'transparent',
            border: `1px solid ${filterStatus === s ? PURPLE : BORDER}`,
            borderRadius: 4, color: filterStatus === s ? '#c4b5fd' : '#64748b',
            fontWeight: filterStatus === s ? 700 : 400, transition: 'all 0.2s ease',
          }}>
            {s === 'all' ? 'All' : s === 'active' ? '● Active' : '○ Inactive'}
          </button>
        ))}

        <span style={{ color: '#475569', fontSize: 12 }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>

        <div style={{ marginLeft: 'auto' }}>
          <button onClick={openNew} style={{
            padding: '6px 14px', background: PURPLE, border: 'none',
            borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 16px rgba(139,92,246,0.2)', transition: 'all 0.2s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed' }}
            onMouseLeave={e => { e.currentTarget.style.background = PURPLE }}
          >＋ Add User</button>
        </div>
      </div>

      {/* Table + Panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {['', 'Name', 'Position', 'Email', 'Phone', 'Status', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left', color: '#475569',
                    fontWeight: 600, fontSize: 11, background: CARD,
                    borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#334155' }}>
                    No users found
                  </td>
                </tr>
              )}
              {filtered.map(u => {
                const isActive = editingUser?.id === u.id
                return (
                  <tr key={u.id}
                    onClick={() => openEdit(u)}
                    style={{
                      borderBottom: `1px solid rgba(30,41,59,0.5)`,
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      background: isActive ? PURPLE + '12' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(139,92,246,0.05)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Avatar */}
                    <td style={{ padding: '10px 12px', width: 52 }}>
                      <Avatar user={u} size={36} />
                    </td>

                    {/* Name */}
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>
                        {u.firstName} {u.lastName}
                      </p>
                    </td>

                    {/* Position */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: CARD, border: `1px solid ${BORDER}`,
                        color: '#94a3b8',
                      }}>{u.position}</span>
                    </td>

                    {/* Email */}
                    <td style={{ padding: '10px 12px', color: '#475569', fontSize: 12 }}>
                      {u.email || <span style={{ color: '#334155' }}>—</span>}
                    </td>

                    {/* Phone */}
                    <td style={{ padding: '10px 12px', color: '#475569', fontSize: 12 }}>
                      {u.phone || <span style={{ color: '#334155' }}>—</span>}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={u.status} />
                    </td>

                    {/* Edit button */}
                    <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(u)} style={{
                        padding: '4px 10px', background: 'transparent',
                        border: `1px solid ${PURPLE}`, borderRadius: 4,
                        color: PURPLE, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.2s ease',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = PURPLE + '18' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >✏ Edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Form panel */}
        {(editingUser || isNew) && (
          <UserFormPanel
            user={editingUser}
            onSave={isNew ? handleAdd : handleUpdate}
            onDelete={handleDelete}
            onClose={closePanel}
            isNew={isNew}
            allUsers={users}
          />
        )}
      </div>
    </div>
  )
}

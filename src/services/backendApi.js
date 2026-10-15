import { awaitOrgSession } from './supabaseAuth'
import { getAccessToken } from './supabaseSession'

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '')

// Only relative API paths are accepted so credentials cannot be sent to another host.
export async function backendFetch(path, options = {}) {
  if (!path.startsWith('/api/') || path.includes('..')) throw new Error('Invalid backend path')
  if (localStorage.getItem('fluxe-demo-mode') === '1') throw new Error('Backend unavailable in demo mode')
  await awaitOrgSession()
  const token = getAccessToken()
  if (!token) throw new Error('Backend requires an online authenticated session')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${SERVER_URL}${path}`, { ...options, headers, redirect: 'error' })
}

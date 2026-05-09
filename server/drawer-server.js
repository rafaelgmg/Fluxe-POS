/**
 * drawer-server.js — standalone cash drawer server for Fluxe
 * Zero dependencies — only Node.js built-ins.
 * Run: node drawer-server.js
 * Listens on http://localhost:3001/api/drawer/kick
 */

const http = require('http')
const { spawn } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const PORT = 3001

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$bytes = [byte[]](0x1b, 0x70, 0x00, 0x19, 0xfa)
$port  = New-Object System.IO.Ports.SerialPort("COM3", 9600)
$port.Open()
$port.Write($bytes, 0, $bytes.Length)
$port.Close()
Write-Output "OK:COM3:5"
`

function kickDrawer(res) {
  const tmpFile = path.join(os.tmpdir(), `fluxe_drawer_${Date.now()}.ps1`)
  try { fs.writeFileSync(tmpFile, PS_SCRIPT, 'utf8') } catch (e) {
    return send(res, { ok: false, error: e.message })
  }

  const proc = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', tmpFile])
  let stdout = '', stderr = ''
  proc.stdout.on('data', d => { stdout += d })
  proc.stderr.on('data', d => { stderr += d })
  proc.on('close', code => {
    try { fs.unlinkSync(tmpFile) } catch {}
    const out = stdout.trim()
    if (code === 0 && out.startsWith('OK:')) {
      const parts = out.split(':')
      console.log(`[Fluxe] Drawer kicked → printer: "${parts[1]}" bytes: ${parts[2]}`)
      send(res, { ok: true, printer: parts[1], bytes: Number(parts[2]) })
    } else {
      const errMsg = stderr.trim() || `exit ${code}`
      console.error(`[Fluxe] Drawer kick failed → ${errMsg}`)
      send(res, { ok: false, error: errMsg })
    }
  })
  proc.on('error', e => {
    try { fs.unlinkSync(tmpFile) } catch {}
    send(res, { ok: false, error: e.message })
  })
}

function send(res, payload) {
  if (res.headersSent) return
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
  if (req.method === 'POST' && req.url === '/api/drawer/kick') return kickDrawer(res)
  res.writeHead(404); res.end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Fluxe] Cash drawer server running on http://localhost:${PORT}`)
})

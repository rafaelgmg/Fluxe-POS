/**
 * drawer-server.js — standalone cash drawer server for Fluxe
 * Zero dependencies — only Node.js built-ins.
 * Run: node drawer-server.js
 * Listens on http://localhost:3001/api/drawer/kick
 *
 * Uses Windows Print Spooler API (winspool.drv) to send BEL (0x07)
 * to the first Star printer found — works with Star TSP100 in Star line mode.
 */

const http = require('http')
const { spawn } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const PORT = 3001

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class FluxeRP { [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public struct DI { public string pDocName; public string pOutputFile; public string pDataType; } [DllImport(""winspool.drv"", CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d); [DllImport(""winspool.drv"")] public static extern bool ClosePrinter(IntPtr h); [DllImport(""winspool.drv"", CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h, int l, ref DI d); [DllImport(""winspool.drv"")] public static extern bool EndDocPrinter(IntPtr h); [DllImport(""winspool.drv"")] public static extern bool StartPagePrinter(IntPtr h); [DllImport(""winspool.drv"")] public static extern bool EndPagePrinter(IntPtr h); [DllImport(""winspool.drv"")] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w); }"
$printerName = (Get-Printer | Where-Object { $_.Name -like '*Star*' } | Select-Object -First 1).Name
if (-not $printerName) { throw 'Star printer not found. Check that the printer is installed.' }
$b = [byte[]](0x07)
$h = [IntPtr]::Zero
[FluxeRP]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)
$d = New-Object FluxeRP+DI
$d.pDocName = 'drawer'
$d.pOutputFile = $null
$d.pDataType = 'RAW'
[FluxeRP]::StartDocPrinter($h, 1, [ref]$d)
[FluxeRP]::StartPagePrinter($h)
$w = 0
[FluxeRP]::WritePrinter($h, $b, $b.Length, [ref]$w)
[FluxeRP]::EndPagePrinter($h)
[FluxeRP]::EndDocPrinter($h)
[FluxeRP]::ClosePrinter($h)
Write-Output "OK:$printerName:$w"
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

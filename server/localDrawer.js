// Compatibility for kiosks still launching server.js. Never enabled on a network bind.
function allowLocalDrawer(req, res, next) {
  const remote = req.socket?.remoteAddress
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  if (!loopback || req.headers.forwarded || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) {
    return res.status(403).json({ ok: false, error: 'Local hardware access only' })
  }
  next()
}

function kickDrawer(req, res) {
  const { location = 'unknown' } = req.body || {}
  const TAG = '[CashDrawer]'

  if (process.platform !== 'win32') {
    console.log(`${TAG} Location: ${location} → non-Windows — skipping`)
    return res.json({ ok: false, error: 'non-Windows platform' })
  }

  const { spawn }  = require('child_process')
  const fs         = require('fs')
  const os         = require('os')
  const path       = require('path')

  // PowerShell: find Star/TSP printer → send raw ESC/POS via Win32 Spooler API
  const psScript = `
$ErrorActionPreference = 'Stop'

# Find first Star/TSP printer installed on this machine
$printerName = (Get-Printer | Where-Object { $_.Name -match 'Star|TSP' } | Select-Object -First 1).Name
if (-not $printerName) {
  Write-Error "No Star/TSP printer found"
  exit 2
}

# Win32 Spooler API via inline C# (P/Invoke)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA",    CharSet=CharSet.Ansi)] public static extern bool   OpenPrinter   (string n, ref IntPtr h, IntPtr d);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter")]                          public static extern bool   ClosePrinter  (IntPtr h);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA",CharSet=CharSet.Ansi)] public static extern int    StartDocPrinter(IntPtr h, int l, ref DOC di);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter")]                         public static extern bool   EndDocPrinter (IntPtr h);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter")]                      public static extern bool   StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter")]                        public static extern bool   EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint="WritePrinter")]                          public static extern bool   WritePrinter  (IntPtr h, IntPtr p, int c, ref int w);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct DOC {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
    }
}
"@ -PassThru | Out-Null

# ESC p 0 25 250 — standard cash drawer kick (drawer 1)
$bytes = [byte[]](0x1b, 0x70, 0x00, 0x19, 0xfa)

$handle = [IntPtr]::Zero
if (-not [RawPrint]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)) {
  Write-Error "OpenPrinter failed: $printerName"
  exit 3
}

$doc           = New-Object RawPrint+DOC
$doc.pDocName  = "fluxe-drawer-kick"
$doc.pDatatype = "RAW"

$docId = [RawPrint]::StartDocPrinter($handle, 1, [ref]$doc)
if ($docId -le 0) {
  [RawPrint]::ClosePrinter($handle) | Out-Null
  Write-Error "StartDocPrinter failed"
  exit 4
}

[RawPrint]::StartPagePrinter($handle) | Out-Null
$ptr     = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
$written = 0
[RawPrint]::WritePrinter($handle, $ptr, $bytes.Length, [ref]$written) | Out-Null
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
[RawPrint]::EndPagePrinter($handle)  | Out-Null
[RawPrint]::EndDocPrinter($handle)   | Out-Null
[RawPrint]::ClosePrinter($handle)    | Out-Null

Write-Output ('OK:{0}:{1}' -f $printerName, $written)
`

  const tmpFile = path.join(os.tmpdir(), `fluxe_drawer_${Date.now()}.ps1`)

  try {
    fs.writeFileSync(tmpFile, psScript, 'utf8')
  } catch (e) {
    console.error(`${TAG} Failed to write PS script:`, e.message)
    return res.json({ ok: false, error: e.message })
  }

  let responded = false
  const safeReply = (payload) => {
    if (responded) return
    responded = true
    try { fs.unlinkSync(tmpFile) } catch {}
    res.json(payload)
  }

  const proc = spawn('powershell', [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    '-NonInteractive',
    '-File', tmpFile,
  ])

  let stdout = '', stderr = ''
  proc.stdout.on('data', d => { stdout += d.toString() })
  proc.stderr.on('data', d => { stderr += d.toString() })

  proc.on('close', code => {
    const out = stdout.trim()
    if (code === 0 && out.startsWith('OK:')) {
      const parts      = out.split(':')
      const printer    = parts[1] || 'unknown'
      const bytesWrote = parts[2] || '?'
      console.log(`${TAG} Location: ${location} → ESC/POS raw sent → printer: "${printer}" → bytes: ${bytesWrote}`)
      safeReply({ ok: true, printer, bytes: Number(bytesWrote) })
    } else {
      const errMsg = stderr.trim() || `exit ${code}`
      console.error(`${TAG} Location: ${location} → raw kick FAILED → ${errMsg}`)
      safeReply({ ok: false, error: errMsg, code })
    }
  })

  proc.on('error', e => {
    console.error(`${TAG} spawn error:`, e.message)
    safeReply({ ok: false, error: e.message })
  })

  // 10-second failsafe
  setTimeout(() => {
    if (!responded) { proc.kill(); safeReply({ ok: false, error: 'timeout' }) }
  }, 10_000)
}

function registerLocalDrawer(app, host, handler = kickDrawer) {
  if (host !== '127.0.0.1' && host !== '::1') return
  app.post('/api/drawer/kick', allowLocalDrawer, handler)
}
module.exports = { registerLocalDrawer, allowLocalDrawer }

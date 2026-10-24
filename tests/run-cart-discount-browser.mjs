// Uses an installed Chromium browser and a disposable profile; no production access.
import { createServer } from 'node:http'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['tests/cartDiscount.integration.jsx'], bundle: true,
  write: false, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
})

const browser = process.env.TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = await mkdtemp(join(tmpdir(), 'fluxe-discount-browser-'))
const server = createServer(async (req, res) => {
  if (req.url === '/hook-test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return }
  res.end('<html><body>Cart discount test</body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  if (!port) throw new Error('Browser did not start')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  })
  const call = (method, params = {}) => new Promise(resolve => {
    const requestId = ++id
    pending.set(requestId, resolve)
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  await call('Page.navigate', { url: origin })
  await delay(500)
  const response = await Promise.race([
    call('Runtime.evaluate', { expression: "import('/hook-test.js').then(m => m.run())", awaitPromise: true, returnByValue: true }),
    delay(30000, null, { ref: false }).then(() => { throw new Error('Cart discount tests timed out') }),
  ])
  if (response.error || response.result?.exceptionDetails) throw new Error(JSON.stringify(response))
  const results = response.result.result.value
  for (const result of results) console.log(`PASS: ${result}`)
  console.log(`${results.length} real-browser checks passed. Disposable profile: ${profile}`)
} finally {
  socket?.close()
  child.kill()
  server.close()
}

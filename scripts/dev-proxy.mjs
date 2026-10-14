// Development only: lets the app run in a plain browser (next dev, headless
// tests) by standing in for the Tauri side. It forwards HTTP and WebSocket
// calls without CORS, and answers identity/instance from this machine, with
// the instance kept in .tmp/instance.json. Listens on localhost:1431 only.
import { createServer } from 'node:http'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { homedir } from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = 1431
const INSTANCE = process.env.GILD_DEV_INSTANCE ?? '.tmp/instance.json'
const IDENTITY = process.env.GILD_DEV_IDENTITY ?? `${homedir()}/.config/gild/identity.json`
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const git = key => { try { return execFileSync('git', ['config', '--global', key], { encoding: 'utf8' }).trim() || null } catch { return null } }
const read = path => { try { return readFileSync(path, 'utf8') } catch { return null } }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
  const body = await new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))) })
  const json = value => res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(value))
  if (url.pathname === '/identity') {
    const id = JSON.parse(read(IDENTITY) ?? 'null')
    return json({ name: git('user.name'), email: git('user.email'), public_key: id?.publicKey ?? null, gild_name: id?.name ?? null, key_path: IDENTITY })
  }
  if (url.pathname === '/vm') {
    if (process.platform === 'linux') { let kvm = false; try { closeSync(openSync('/dev/kvm', 'r+')); kvm = true } catch {} return json({ backend: 'firecracker', ready: kvm, found: kvm ? 'KVM (/dev/kvm)' : null }) }
    for (const bin of ['/usr/local/bin/multipass', '/opt/homebrew/bin/multipass', 'multipass']) {
      const r = spawnSync(bin, ['version'], { encoding: 'utf8' })
      if (r.status === 0) return json({ backend: 'multipass', ready: true, found: r.stdout.split('\n')[0].split(/\s+/).join(' ') })
    }
    return json({ backend: 'multipass', ready: false, found: null })
  }
  if (url.pathname === '/instance') {
    if (req.method === 'PUT') { mkdirSync('.tmp', { recursive: true }); writeFileSync(INSTANCE, body, { mode: 0o600 }); return json(null) }
    if (req.method === 'DELETE') { rmSync(INSTANCE, { force: true }); return json(null) }
    const text = read(INSTANCE)
    return json(text ? JSON.parse(text) : null)
  }
  if (url.pathname === '/proxy') {
    const target = url.searchParams.get('u')
    if (!/^https:\/\/(api\.cloudflare\.com|[a-z0-9.-]+\.workers\.dev)\//.test(target ?? '')) return res.writeHead(403, cors).end('target not allowed')
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'].includes(k) && !k.startsWith('sec-')))
    try {
      const upstream = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body })
      const out = Buffer.from(await upstream.arrayBuffer())
      const pass = Object.fromEntries([...upstream.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)))
      return res.writeHead(upstream.status, { ...pass, ...cors }).end(out)
    } catch (error) {
      return res.writeHead(502, cors).end(String(error))
    }
  }
  res.writeHead(404, cors).end()
})

const sockets = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const target = url.searchParams.get('u') ?? ''
  if (url.pathname !== '/ws' || !/^wss:\/\/[a-z0-9.-]+\.workers\.dev\//.test(target)) return socket.destroy()
  sockets.handleUpgrade(req, socket, head, client => {
    const upstream = new WebSocket(target, { headers: { authorization: `Bearer ${url.searchParams.get('t')}` } })
    const pending = []
    upstream.on('open', () => { for (const m of pending.splice(0)) upstream.send(m) })
    upstream.on('message', data => client.send(String(data)))
    upstream.on('close', () => client.close())
    upstream.on('error', () => client.close())
    client.on('message', data => upstream.readyState === WebSocket.OPEN ? upstream.send(String(data)) : pending.push(String(data)))
    client.on('close', () => upstream.close())
  })
})
server.listen(PORT, '127.0.0.1', () => console.log(`dev proxy on http://localhost:${PORT}`))

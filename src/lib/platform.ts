// The two places this window runs: inside gild desktop (Tauri), where the
// Rust side reaches Cloudflare and the instance directly, and a plain browser
// during development, where scripts/dev-proxy.mjs stands in for that side.
import type { ChannelSocket } from '@gildforge/kit/ui/repo/Channel'

export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const PROXY = 'http://localhost:1431'

/** fetch without the webview's CORS: Tauri's HTTP client, or the dev proxy. */
export const httpFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (inTauri()) {
    const { fetch } = await import('@tauri-apps/plugin-http')
    return fetch(url, init)
  }
  return fetch(`${PROXY}/proxy?u=${encodeURIComponent(url)}`, init)
}

/** A WebSocket that sends the Authorization header a webview's own cannot. */
export function authSocket(url: string, token: string): ChannelSocket {
  const socket: ChannelSocket = { onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} }
  if (!inTauri()) {
    const ws = new WebSocket(`${PROXY.replace('http', 'ws')}/ws?u=${encodeURIComponent(url)}&t=${encodeURIComponent(token)}`)
    ws.onopen = () => socket.onopen?.()
    ws.onmessage = e => socket.onmessage?.({ data: String(e.data) })
    ws.onclose = () => socket.onclose?.()
    ws.onerror = () => socket.onerror?.()
    socket.send = data => ws.send(data)
    socket.close = () => ws.close()
    return socket
  }
  let closed = false
  let live: { send(m: string): Promise<void>; disconnect(): Promise<void> } | undefined
  void import('@tauri-apps/plugin-websocket').then(async ({ default: WebSocket }) => {
    const ws = await WebSocket.connect(url, { headers: { authorization: `Bearer ${token}` } })
    if (closed) return void ws.disconnect()
    live = ws
    ws.addListener(message => {
      if (message.type === 'Text') socket.onmessage?.({ data: message.data })
      else if (message.type === 'Close') { live = undefined; socket.onclose?.() }
    })
    socket.onopen?.()
  }).catch(() => { socket.onerror?.(); socket.onclose?.() })
  socket.send = data => void live?.send(data).catch(() => socket.onclose?.())
  socket.close = () => { closed = true; void live?.disconnect().catch(() => {}); live = undefined }
  return socket
}

export async function openExternal(url: string) {
  if (inTauri()) return (await import('@tauri-apps/plugin-opener')).openUrl(url)
  window.open(url, '_blank', 'noopener')
}

export interface Identity { name: string | null; email: string | null; public_key: string | null; gild_name: string | null; key_path: string }

export interface Instance { url: string; owner: string; token: string; account_id: string; name: string; version: string }

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

// In a browser the dev proxy plays the Rust side for these too.
const dev = async <T,>(path: string, init?: RequestInit): Promise<T> => (await fetch(`${PROXY}${path}`, init)).json() as Promise<T>

export const identity = () => (inTauri() ? invoke<Identity>('identity') : dev<Identity>('/identity'))
/** Make a gild identity (as `gild auth init` would) on a machine without one. */
export const createIdentity = (name: string) => (inTauri() ? invoke<Identity>('identity_create', { name }) : dev<Identity>('/identity', { method: 'POST', body: JSON.stringify({ name }) }))
export const readInstance = () => (inTauri() ? invoke<Instance | null>('instance_read') : dev<Instance | null>('/instance'))
export const writeInstance = (instance: Instance) =>
  inTauri() ? invoke<void>('instance_write', { instance }) : dev<void>('/instance', { method: 'PUT', body: JSON.stringify(instance) })
export const forgetInstance = () => (inTauri() ? invoke<void>('instance_forget') : dev<void>('/instance', { method: 'DELETE' }))

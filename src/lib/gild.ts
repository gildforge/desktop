// The installed instance, reached through the kit's typed API client.
import { GildClient } from '@gildforge/kit/engine/api/client'
import type { ChannelTransport } from '@gildforge/kit/ui/repo/Channel'
import { authSocket, httpFetch, type Instance } from './platform'

export const client = (instance: Instance) => new GildClient(`${instance.url}/api/v1`, instance.token, httpFetch)

/** Raw authenticated GET for the few reads the client's schemas don't cover. */
export async function get<T>(instance: Instance, path: string): Promise<T> {
  const res = await httpFetch(`${instance.url}/api/v1${path}`, { headers: { authorization: `Bearer ${instance.token}` } })
  const data = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
  return data as T
}

export function channelTransport(instance: Instance, open: (href: string) => void): ChannelTransport {
  const fetcher: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('authorization', `Bearer ${instance.token}`)
    return httpFetch(input, { ...init, headers })
  }
  return {
    origin: instance.url,
    fetch: fetcher,
    socket: path => authSocket(`${instance.url.replace(/^http/, 'ws')}${path}`, instance.token),
    open,
    sitePages: false,
  }
}

export const cloneURL = (instance: Instance, owner: string, repo: string) => `${instance.url}/git/${owner}/${repo}.git`

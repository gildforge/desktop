// The Worker this desktop installs: the kit's template, copied into the app
// at build time (scripts/template.mjs).
import type { Manifest, Template } from '@gildforge/kit/install/index'

export async function template(): Promise<Template & { version: string }> {
  const [manifest, version] = await Promise.all([
    fetch('/template/worker/manifest.json').then(r => r.json() as Promise<Manifest>),
    fetch('/template/version.json').then(r => r.json() as Promise<{ kit: string }>),
  ])
  return {
    manifest,
    version: version.kit,
    read: async path => {
      const res = await fetch(`/template/${path}`)
      if (!res.ok) throw new Error(`The app is missing template/${path}`)
      return path.endsWith('.sql') ? res.text() : new Uint8Array(await res.arrayBuffer())
    },
  }
}

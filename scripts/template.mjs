// Copy the kit's install template (the prebuilt Worker, its manifest and the
// migrations) into public/template, where the installer reads it from the
// app's own files. The kit version pinned in package.json is the gild version
// this desktop installs.
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const kit = dirname(require.resolve('@gildforge/kit/package.json'))
const out = 'public/template'
rmSync(out, { recursive: true, force: true })
const manifest = JSON.parse(readFileSync(join(kit, 'template/worker/manifest.json'), 'utf8'))
cpSync(join(kit, 'template/worker'), join(out, 'worker'), { recursive: true })
for (const d of manifest.d1_databases) cpSync(join(kit, 'template', d.migrations_dir), join(out, d.migrations_dir), { recursive: true })
const { version } = JSON.parse(readFileSync(join(kit, 'package.json'), 'utf8'))
writeFileSync(join(out, 'version.json'), JSON.stringify({ kit: version }) + '\n')
console.log(`public/template: gild ${version}`)

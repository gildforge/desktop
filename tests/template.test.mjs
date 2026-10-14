// The app installs exactly the files the kit's manifest names: if the copy
// misses a module or a migration, an install would upload a broken Worker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

test('every module and migration the manifest names is in the app', () => {
  execFileSync(process.execPath, ['scripts/template.mjs'])
  const manifest = JSON.parse(readFileSync('public/template/worker/manifest.json', 'utf8'))
  assert.ok(manifest.modules.some(m => m.name === manifest.main), 'the main module is listed')
  for (const m of manifest.modules) assert.ok(existsSync(`public/template/worker/${m.name}`), m.name)
  for (const d of manifest.d1_databases) {
    assert.ok(d.migrations.length > 0, `${d.binding} has migrations`)
    for (const f of d.migrations) assert.ok(existsSync(`public/template/${d.migrations_dir}/${f}`), `${d.migrations_dir}/${f}`)
  }
  const pinned = JSON.parse(readFileSync('package.json', 'utf8')).dependencies['@gildforge/kit']
  assert.equal(JSON.parse(readFileSync('public/template/version.json', 'utf8')).kit, pinned, 'the app installs the kit it pins')
})

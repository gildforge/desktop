// The built app, driven through tauri-driver (Linux CI, under Xvfb): the
// parts a browser run cannot reach. Tauri's HTTP client reaches Cloudflare
// without CORS, the Rust commands answer, and the app carries the template
// it installs.
//   tauri-driver &   node tests/e2e/smoke.mjs <path to the built binary>
import { Builder, By, until } from 'selenium-webdriver'
import assert from 'node:assert/strict'

const application = process.argv[2]
const driver = await new Builder()
  .usingServer('http://127.0.0.1:4444/')
  .withCapabilities({ browserName: 'wry', 'tauri:options': { application } })
  .build()
try {
  await driver.wait(until.elementLocated(By.css('#token')), 30000)

  // A token Cloudflare refuses: the answer has to come back from
  // api.cloudflare.com through the HTTP plugin and be shown.
  await driver.findElement(By.css('#token')).sendKeys('not-a-real-token')
  await driver.findElement(By.css('form button.primary')).click()
  const refused = await driver.wait(until.elementLocated(By.css('.error')), 30000)
  const text = await refused.getText()
  assert.match(text, /Cloudflare did not accept this token/, text)
  assert.doesNotMatch(text, /Failed to fetch|NetworkError|not allowed|scope/i, text)
  console.log('http plugin:', text)

  // The Rust side answers, and the template the installer uploads is in the app.
  const result = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    Promise.all([
      window.__TAURI_INTERNALS__.invoke('identity'),
      window.__TAURI_INTERNALS__.invoke('instance_read'),
      fetch('/template/worker/manifest.json').then(r => r.json()),
    ]).then(([identity, instance, manifest]) => done({ identity, instance, modules: manifest.modules.map(m => m.name) }), e => done({ error: String(e) }))
  `)
  assert.equal(result.error, undefined, result.error)
  assert.match(result.identity.key_path, /\.config\/gild\/identity\.json$/)
  assert.equal(result.instance, null)
  assert.ok(result.modules.includes('worker.js'), JSON.stringify(result.modules))
  console.log('commands + template:', JSON.stringify({ key_path: result.identity.key_path, modules: result.modules }))
} finally {
  await driver.quit()
}

'use client'
// First run: one Cloudflare API token installs gild into the user's own
// account (the kit's installer, step by step), and they become its owner.
import { useEffect, useState } from 'react'
import { accounts, install, STEPS, type Account, type Progress, type StepId } from '@gildforge/kit/install/index'
import { createIdentity, httpFetch, identity, openExternal, writeInstance, type Identity, type Instance } from '@/lib/platform'
import { template } from '@/lib/template'

const PERMISSIONS = [
  ['Workers Scripts', 'Edit'],
  ['D1', 'Edit'],
  ['Workers R2 Storage', 'Edit'],
  ['Queues', 'Edit'],
  ['Artifacts', 'Edit'],
  ['Account API Tokens', 'Edit'],
  ['Account Settings', 'Read'],
]

type Stage = 'token' | 'owner' | 'install'

const slug = (name: string | null) => (name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39)

export function Setup({ onInstalled }: { onInstalled(instance: Instance): void }) {
  const [stage, setStage] = useState<Stage>('token')
  const [token, setToken] = useState('')
  const [found, setFound] = useState<Account[]>([])
  const [account, setAccount] = useState('')
  const [me, setMe] = useState<Identity | null>(null)
  const [owner, setOwner] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('gild')
  const [steps, setSteps] = useState<Partial<Record<StepId, Progress>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    identity().then(id => { setMe(id); setOwner(o => o || slug(id.gild_name ?? id.name)); setEmail(e => e || (id.email ?? '')) }, () => {})
  }, [])

  async function checkToken(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const list = await accounts(token.trim(), httpFetch)
      if (!list.length) throw new Error('This token reaches no Cloudflare account.')
      setFound(list); setAccount(list[0].id); setStage('owner')
    } catch (err) {
      setError(`Cloudflare did not accept this token: ${(err as Error).message}`)
    } finally { setBusy(false) }
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!me?.public_key) return
    setStage('install'); setBusy(true); setError(''); setSteps({})
    try {
      const t = await template()
      const done = await install({
        token: token.trim(), accountId: account, name, fetch: httpFetch, template: t,
        owner: { name: owner, email, publicKey: me.public_key },
        onProgress: p => setSteps(s => ({ ...s, [p.step]: p })),
      })
      const instance: Instance = { url: done.url, owner, token: done.token, account_id: done.accountId, name: done.name, version: t.version }
      await writeInstance(instance)
      onInstalled(instance)
    } catch (err) {
      setError((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <main className="setup">
      <header className="setup-head">
        <img src="/logo.svg" alt="" width={36} height={36} />
        <div>
          <h1>Your own gild, on your Cloudflare</h1>
          <p className="dim">The git forge for agents, installed into your account. You need Workers Paid and an API token. That&apos;s the whole setup.</p>
        </div>
      </header>

      <ol className="stages" aria-label="Setup">
        <li data-on={stage === 'token'} data-done={stage !== 'token'}>API token</li>
        <li data-on={stage === 'owner'} data-done={stage === 'install'}>Owner</li>
        <li data-on={stage === 'install'}>Install</li>
      </ol>

      {stage === 'token' && (
        <form className="card" onSubmit={checkToken}>
          <label htmlFor="token">Cloudflare API token</label>
          <input id="token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={e => setToken(e.target.value)} placeholder="Paste a token" autoFocus />
          <p className="dim small">
            <button type="button" className="link" onClick={() => openExternal('https://dash.cloudflare.com/profile/api-tokens')}>Create a token</button>{' '}
            with these account permissions. It stays on this machine; gild gives its Worker a narrower token of its own.
          </p>
          <ul className="perms">{PERMISSIONS.map(([name, level]) => <li key={name}><span>{name}</span><span className="dim">{level}</span></li>)}</ul>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !token.trim()}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
      )}

      {stage === 'owner' && (
        <form className="card" onSubmit={run}>
          {found.length > 1 && (<>
            <label htmlFor="account">Account</label>
            <select id="account" value={account} onChange={e => setAccount(e.target.value)}>
              {found.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>)}
          {found.length === 1 && <p className="dim small">Installing into <strong>{found[0].name}</strong></p>}
          <label htmlFor="owner">Your name on gild</label>
          <input id="owner" value={owner} onChange={e => setOwner(slug(e.target.value))} placeholder="sami" />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <label>Your gild key</label>
          {me?.public_key
            ? <code className="key" title={me.key_path}>{me.public_key}</code>
            : <div className="row">
                <span className="dim small">No gild identity on this machine yet.</span>
                <button type="button" className="ghost small" onClick={async () => { try { setMe(await createIdentity(owner)) } catch (err) { setError(String(err)) } }}>Create one</button>
              </div>}
          <p className="dim small">gild knows you by this key, the same one the <code>gild</code> CLI signs in with ({me?.key_path ?? '~/.config/gild/identity.json'}). Agents you approve are sponsored by it.</p>
          <details className="advanced" open={name !== 'gild' || /another name/.test(error) || undefined}>
            <summary className="dim small">Advanced</summary>
            <label htmlFor="name">Worker name</label>
            <input id="name" value={name} onChange={e => setName(slug(e.target.value) || 'gild')} />
            <p className="dim small">Names the Worker and prefixes its databases, bucket and queues. One install per name.</p>
          </details>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setStage('token')}>Back</button>
            <button className="primary" disabled={!owner || !email || !name || !me?.public_key}>Install gild</button>
          </div>
        </form>
      )}

      {stage === 'install' && (
        <section className="card" aria-label="Install progress">
          <ol className="steps">
            {STEPS.map(s => {
              const p = steps[s.id]
              const state = p?.state ?? (error ? 'idle' : 'waiting')
              return (
                <li key={s.id} data-state={p ? p.state : state}>
                  <span className="mark" aria-hidden="true">{p?.state === 'done' ? '✓' : p?.state === 'running' ? (error ? '✕' : '…') : ''}</span>
                  <span>{s.label}</span>
                  {p?.detail && <span className="dim small detail">{p.detail}</span>}
                </li>
              )
            })}
          </ol>
          {error && (<>
            <p className="error" role="alert">{error}</p>
            <div className="row">
              <button className="ghost" onClick={() => setStage('owner')}>{/another name/.test(error) ? 'Choose a name' : 'Back'}</button>
              <button className="primary" onClick={() => run()} disabled={busy}>Try again</button>
            </div>
            <p className="dim small">Running it again picks up where it stopped; nothing is created twice.</p>
          </>)}
        </section>
      )}
    </main>
  )
}

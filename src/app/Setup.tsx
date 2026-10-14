'use client'
// First run: one Cloudflare API token installs gild into the user's own
// account (the kit's installer, step by step), and they become its owner.
import { useEffect, useState } from 'react'
import { accounts, install, STEPS, type Account, type Progress, type StepId } from '@gildforge/kit/install/index'
import { createIdentity, httpFetch, identity, openExternal, vmStatus, writeInstance, type Identity, type Instance, type VmStatus } from '@/lib/platform'
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

type Stage = 'token' | 'owner' | 'install' | 'vms'

/** The next name to try when one is taken: gild → gild-2 → gild-3. */
const nextName = (name: string) => { const m = name.match(/^(.*)-(\d+)$/); return m ? `${m[1]}-${Number(m[2]) + 1}` : `${name}-2` }
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
  const [installed, setInstalled] = useState<Instance | null>(null)

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

  async function run(e?: React.FormEvent, as?: string) {
    e?.preventDefault()
    const worker = as ?? slug(name)
    if (!me?.public_key || !worker) return
    if (as) setName(as)
    setStage('install'); setBusy(true); setError(''); setSteps({})
    try {
      const t = await template()
      const done = await install({
        token: token.trim(), accountId: account, name: worker, fetch: httpFetch, template: t,
        owner: { name: owner, email, publicKey: me.public_key },
        onProgress: p => setSteps(s => ({ ...s, [p.step]: p })),
      })
      const instance: Instance = { url: done.url, owner, token: done.token, account_id: done.accountId, name: done.name, version: t.version }
      await writeInstance(instance)
      setInstalled(instance); setStage('vms')
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
        <li data-on={stage === 'owner'} data-done={stage === 'install' || stage === 'vms'}>Owner</li>
        <li data-on={stage === 'install'} data-done={stage === 'vms'}>Install</li>
        <li data-on={stage === 'vms'}>Agent VMs</li>
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
            <input id="name" value={name} onChange={e => setName(e.target.value.toLowerCase())} onBlur={() => setName(n => slug(n) || 'gild')} />
            <p className="dim small">Names the Worker and prefixes its databases, bucket and queues. One install per name.</p>
          </details>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setStage('token')}>Back</button>
            <button className="primary" disabled={!owner || !email || !slug(name) || !me?.public_key}>Install gild</button>
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
              {/another name/.test(error)
                ? <button className="primary" onClick={() => run(undefined, nextName(slug(name)))} disabled={busy}>Install as {nextName(slug(name))}</button>
                : <button className="primary" onClick={() => run()} disabled={busy}>Try again</button>}
            </div>
            <p className="dim small">Running it again picks up where it stopped; nothing is created twice.</p>
          </>)}
        </section>
      )}
      {stage === 'vms' && installed && (
        <AgentVms onDone={async agents => { const instance = { ...installed, agents }; await writeInstance(instance); onInstalled(instance) }} />
      )}
    </main>
  )
}

/** Optional: agents in a VM. Multipass is the person's to install; skipping keeps agents on this computer. */
function AgentVms({ onDone }: { onDone(agents: 'vm' | 'host'): void }) {
  const [status, setStatus] = useState<VmStatus | null>(null)
  const check = () => { setStatus(null); vmStatus().then(setStatus, () => setStatus({ backend: 'multipass', ready: false, found: null })) }
  useEffect(check, [])
  const linux = status?.backend === 'firecracker'
  return (
    <section className="card" aria-label="Agent VMs">
      <h2 className="title">Agent VMs <span className="dim small">optional</span></h2>
      <p>gild can run each agent inside a Linux VM. There it sees only the repository it works on and its own key, never your files or your other keys.</p>
      {linux
        ? <p className="dim small">On Linux the VM is Firecracker. gild sets it up the first time an agent asks for one; it needs KVM (<code>/dev/kvm</code>) you can use.</p>
        : <p className="dim small">On this computer the VM runs in <strong>Multipass</strong>, a free, open-source tool from Canonical. gild doesn&apos;t include it: you install it once, and it keeps itself up to date.</p>}
      <p className={status?.ready ? 'ok' : 'dim'} role="status">
        {!status ? 'Checking…' : status.ready ? `✓ ${status.found} is ready` : linux ? 'KVM is not available to you here.' : 'Multipass is not installed.'}
      </p>
      {status && !status.ready && !linux && (<>
        <p className="dim small">Install it from the download page, or in Terminal with <code>brew install --cask multipass</code>. It asks for your password because it runs a small background service. Then check again.</p>
        <div className="row"><button type="button" className="ghost small" onClick={() => openExternal('https://canonical.com/multipass/install')}>Open the Multipass download page</button></div>
      </>)}
      {status?.ready && <p className="dim small">Agents start in the VM with <code>gild spawn --vm</code> or <code>gild agent launch --vm</code>. Sign Claude Code in for VMs once with <code>gild vm login claude</code>. The first VM takes about two minutes to make.</p>}
      <div className="row">
        <button type="button" className="ghost" onClick={() => onDone('host')}>Skip: run agents on this computer</button>
        {status && !status.ready && <button type="button" className="ghost" onClick={check}>Check again</button>}
        <button type="button" className="primary" disabled={!status?.ready} onClick={() => onDone('vm')}>Use agent VMs</button>
      </div>
      <p className="dim small">Skipping keeps agents on this computer, running as you. You can set up VMs later.</p>
    </section>
  )
}

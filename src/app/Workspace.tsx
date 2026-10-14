'use client'
// The installed instance: your repositories down the side, one open beside.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeToggle } from '@gildforge/kit/ui/theme'
import { client } from '@/lib/gild'
import { forgetInstance, openExternal, type Instance } from '@/lib/platform'
import { Repo } from './Repo'

interface RepoRow { name: string; full_name: string; description: string | null; private: boolean; updated_at: string; owner: { login: string } }

export function Workspace({ instance, onForget }: { instance: Instance; onForget(): void }) {
  const api = useMemo(() => client(instance), [instance])
  const [repos, setRepos] = useState<RepoRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const list = (await api.request('repos')) as unknown as RepoRow[]
      // The list is prepared after a change; keep a repository just created.
      setRepos(old => {
        const names = new Set(list.map(r => r.full_name))
        return [...list, ...(old ?? []).filter(r => !names.has(r.full_name))].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      })
      setOpen(o => o ?? list[0]?.full_name ?? null)
      setError('')
    } catch (e) { setError((e as Error).message) }
  }, [api])
  useEffect(() => { void load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      const repo = (await api.request('createRepository', {}, { name } as never)) as unknown as RepoRow
      setName(''); setCreating(false)
      setRepos(old => [repo, ...(old ?? []).filter(r => r.full_name !== repo.full_name)])
      void load()
      setOpen(repo.full_name)
    } catch (err) { setError((err as Error).message) }
  }

  const host = new URL(instance.url).host
  return (
    <div className="workspace">
      <aside className="side">
        <div className="brand">
          <img src="/logo.svg" alt="" width={22} height={22} />
          <div>
            <strong>gild</strong>
            <button className="host link" title={instance.url} onClick={() => openExternal(instance.url + '/api/v1/user/account')}>{host}</button>
          </div>
        </div>
        <div className="side-head">
          <span className="dim small">Repositories</span>
          <button className="ghost small" onClick={() => setCreating(c => !c)} aria-expanded={creating}>New</button>
        </div>
        {creating && (
          <form className="new" onSubmit={create}>
            <input aria-label="Repository name" placeholder="name" value={name} onChange={e => setName(e.target.value.replace(/[^A-Za-z0-9._-]/g, '-'))} autoFocus />
            <button className="primary small" disabled={!name}>Create</button>
          </form>
        )}
        <nav className="repos" aria-label="Repositories">
          {repos === null && !error && <span className="dim small">Loading…</span>}
          {repos?.length === 0 && <span className="dim small">No repositories yet.</span>}
          {repos?.map(r => (
            <button key={r.full_name} className="repo-link" aria-current={open === r.full_name ? 'page' : undefined} onClick={() => setOpen(r.full_name)}>
              <span>{r.owner.login === instance.owner ? r.name : r.full_name}</span>
              {r.private && <span className="badge">private</span>}
            </button>
          ))}
        </nav>
        {error && <p className="error small" role="alert">{error}</p>}
        <footer className="side-foot">
          <span className="dim small">@{instance.owner} · gild {instance.version}</span>
          <div className="row">
            <ThemeToggle />
            <button className="ghost small" onClick={async () => { if (confirm('Forget this instance on this machine? It keeps running in your Cloudflare account.')) { await forgetInstance(); onForget() } }}>Disconnect</button>
          </div>
        </footer>
      </aside>
      <main className="main">
        {open ? <Repo key={open} instance={instance} fullName={open} /> : (
          <section className="empty">
            <h2>Your gild is ready</h2>
            <p className="dim">Create a repository, or push one you have:</p>
            <pre className="block">{`git remote add gild ${instance.url}/git/${instance.owner}/<repo>.git\ngit push gild main`}</pre>
          </section>
        )}
      </main>
    </div>
  )
}

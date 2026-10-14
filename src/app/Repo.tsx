'use client'
// One repository: its code, history, pull requests, Agents channel and cqx
// health. The diff, treemap and channel are the kit's own views, the same
// ones gild.gg renders.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Diff, fileAnchor } from '@gildforge/kit/render/Diff'
import { Glance } from '@gildforge/kit/render/Glance'
import { RepoChannel } from '@gildforge/kit/ui/repo/Channel'
import type { Change } from '@gildforge/kit/engine/types'
import { channelTransport, cloneURL, get } from '@/lib/gild'
import type { Instance } from '@/lib/platform'

type Tab = 'code' | 'commits' | 'pulls' | 'agents' | 'health'
const TABS: { id: Tab; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'commits', label: 'Commits' },
  { id: 'pulls', label: 'Pull requests' },
  { id: 'agents', label: 'Agents' },
  { id: 'health', label: 'Health' },
]

interface Entry { type: 'file' | 'dir' | 'symlink' | 'submodule'; name: string; path: string; size: number }
interface File extends Entry { content?: string; encoding?: string }
interface CommitRow { sha: string; commit: { message: string; author: { name: string; date: string } } }
interface PullRow { number: number; title: string; state: string; user: { login: string }; head: { ref: string }; base: { ref: string }; created_at: string; merged_at?: string | null }
interface Health { lines: number; scores: Record<string, number> | null }

/** Retry the reads an instance answers 503 to while it prepares them. */
async function prepared<T>(read: () => Promise<T>, tries = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await read() } catch (e) {
      if (i >= tries || !/prepar/i.test((e as Error).message)) throw e
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)))
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000
  return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`
}

export function Repo({ instance, fullName }: { instance: Instance; fullName: string }) {
  const [owner, repo] = fullName.split('/')
  const base = `/repos/${owner}/${repo}`
  const [tab, setTab] = useState<Tab>('code')
  const [focus, setFocus] = useState<{ kind: 'commit' | 'pull'; id: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const clone = cloneURL(instance, owner, repo)
  const transport = useMemo(() => channelTransport(instance, href => {
    const pull = href.match(/pulls?\/(\d+)/), commit = href.match(/commits?\/([0-9a-f]{7,40})/)
    if (pull) { setTab('pulls'); setFocus({ kind: 'pull', id: pull[1] }) }
    else if (commit) { setTab('commits'); setFocus({ kind: 'commit', id: commit[1] }) }
  }), [instance])

  return (
    <div className="repo">
      <header className="repo-head">
        <h1><span className="dim">{owner} /</span> {repo}</h1>
        <button className="clone" title="Copy the clone URL" onClick={() => { void navigator.clipboard.writeText(clone); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
          <code>{clone}</code><span className="dim small">{copied ? 'copied' : 'copy'}</span>
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setFocus(null) }}>{t.label}</button>)}
      </nav>
      <div className="tab-body">
        {tab === 'code' && <Code instance={instance} base={base} />}
        {tab === 'commits' && (focus?.kind === 'commit' ? <ChangeView instance={instance} path={`${base}/changes/${focus.id}`} title={`Commit ${focus.id.slice(0, 7)}`} onBack={() => setFocus(null)} /> : <Commits instance={instance} base={base} onOpen={sha => setFocus({ kind: 'commit', id: sha })} />)}
        {tab === 'pulls' && (focus?.kind === 'pull' ? <Pull instance={instance} base={base} number={focus.id} onBack={() => setFocus(null)} /> : <Pulls instance={instance} base={base} onOpen={n => setFocus({ kind: 'pull', id: String(n) })} />)}
        {tab === 'agents' && <div className="channel-wrap"><RepoChannel owner={owner} repo={repo} transport={transport} /></div>}
        {tab === 'health' && <HealthView instance={instance} base={base} />}
      </div>
    </div>
  )
}

function useRead<T>(instance: Instance, path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    if (!path) return
    setError('')
    prepared(() => get<T>(instance, path)).then(d => { setData(d); setLoaded(true) }, e => setError((e as Error).message))
  }, [instance, path])
  useEffect(() => { setData(null); setLoaded(false); load() }, [load])
  return { data, loaded, error, reload: load }
}

function Code({ instance, base }: { instance: Instance; base: string }) {
  const [path, setPath] = useState('')
  const listing = useRead<Entry[] | File>(instance, `${base}/contents${path ? '/' + path.split('/').map(encodeURIComponent).join('/') : ''}`)
  const entries = Array.isArray(listing.data) ? [...listing.data].sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name)) : null
  const file = listing.data && !Array.isArray(listing.data) ? listing.data : null
  const readme = entries?.find(e => /^readme(\.md|\.txt)?$/i.test(e.name))
  const readmeFile = useRead<File>(instance, readme ? `${base}/contents/${readme.path.split('/').map(encodeURIComponent).join('/')}` : null)
  const crumbs = path ? path.split('/') : []
  return (
    <section>
      <div className="crumbs">
        <button className="link" onClick={() => setPath('')}>root</button>
        {crumbs.map((c, i) => <span key={i}> / <button className="link" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>)}
      </div>
      {listing.error && <Problem message={listing.error} retry={listing.reload} />}
      {!listing.data && !listing.error && <p className="dim">Loading…</p>}
      {entries && (
        <ul className="tree">
          {entries.length === 0 && <li className="dim">Empty</li>}
          {entries.map(e => (
            <li key={e.path}>
              <button className="tree-row" onClick={() => setPath(e.path)}>
                <span aria-hidden="true" className="icon">{e.type === 'dir' ? '▸' : '·'}</span>
                <span>{e.name}</span>
                {e.type === 'file' && <span className="dim small">{e.size.toLocaleString()} B</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {file && <FileBody file={file} />}
      {entries && readmeFile.data && <FileBody file={readmeFile.data} heading />}
    </section>
  )
}

function FileBody({ file, heading }: { file: File; heading?: boolean }) {
  const text = file.content && file.encoding === 'base64' ? decode(file.content) : null
  if (text === null) return <p className="dim">This file is not shown ({file.size.toLocaleString()} bytes).</p>
  const lines = text.replace(/\n$/, '').split('\n')
  return (
    <figure className="file">
      {heading && <figcaption>{file.name}</figcaption>}
      <pre className="code">{lines.map((l, i) => <span key={i} className="code-line"><span className="ln">{i + 1}</span>{l || ' '}{'\n'}</span>)}</pre>
    </figure>
  )
}

function Commits({ instance, base, onOpen }: { instance: Instance; base: string; onOpen(sha: string): void }) {
  const { data, error, reload } = useRead<CommitRow[]>(instance, `${base}/commits`)
  if (error) return <Problem message={error} retry={reload} />
  if (!data) return <p className="dim">Loading…</p>
  return (
    <ul className="list">
      {data.map(c => (
        <li key={c.sha}>
          <button className="list-row" onClick={() => onOpen(c.sha)}>
            <span>{c.commit.message.split('\n')[0]}</span>
            <span className="dim small">{c.commit.author.name} · {ago(c.commit.author.date)} · <code>{c.sha.slice(0, 7)}</code></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Pulls({ instance, base, onOpen }: { instance: Instance; base: string; onOpen(n: number): void }) {
  const { data, error, reload } = useRead<PullRow[]>(instance, `${base}/pulls?state=all`)
  if (error) return <Problem message={error} retry={reload} />
  if (!data) return <p className="dim">Loading…</p>
  if (!data.length) return <p className="dim">No pull requests yet.</p>
  return (
    <ul className="list">
      {data.map(p => (
        <li key={p.number}>
          <button className="list-row" onClick={() => onOpen(p.number)}>
            <span><span className={`state ${p.merged_at ? 'merged' : p.state}`}>{p.merged_at ? 'merged' : p.state}</span> {p.title} <span className="dim">#{p.number}</span></span>
            <span className="dim small">{p.user.login} · {p.head.ref} → {p.base.ref} · {ago(p.created_at)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Pull({ instance, base, number, onBack }: { instance: Instance; base: string; number: string; onBack(): void }) {
  const { data } = useRead<PullRow & { body: string | null }>(instance, `${base}/pulls/${number}`)
  return (
    <section>
      <button className="link" onClick={onBack}>← Pull requests</button>
      {data && <h2 className="title">{data.title} <span className="dim">#{data.number}</span></h2>}
      {data?.body && <p className="body">{data.body}</p>}
      <ChangeView instance={instance} path={`${base}/pulls/${number}/changes`} />
    </section>
  )
}

/** A change at a glance (the kit's treemap), then every file's diff. */
function ChangeView({ instance, path, title, onBack }: { instance: Instance; path: string; title?: string; onBack?(): void }) {
  const { data, error, reload } = useRead<Change>(instance, path)
  const [root, setRoot] = useState('')
  useEffect(() => {
    const zoom = () => { const m = location.hash.match(/^#zoom=(.*)$/); if (m) setRoot(decodeURIComponent(m[1])) }
    window.addEventListener('hashchange', zoom)
    return () => window.removeEventListener('hashchange', zoom)
  }, [])
  return (
    <section className="change">
      {onBack && <button className="link" onClick={onBack}>← Commits</button>}
      {title && <h2 className="title">{title}</h2>}
      {error && <Problem message={error} retry={reload} />}
      {!data && !error && <p className="dim">Preparing the diff…</p>}
      {data && (<>
        <p className="dim small">{data.files.length} files · +{data.files.reduce((n, f) => n + f.additions, 0)} −{data.files.reduce((n, f) => n + f.deletions, 0)}{data.truncated ? ' · truncated' : ''}</p>
        {data.files.length > 0 && data.sizes.length > 0 && (
          <div className="glance">
            {root && <button className="link small" onClick={() => setRoot('')}>← whole repository</button>}
            <Glance sizes={data.sizes} files={data.files} root={root} what="change" zoomHref={dir => `#zoom=${encodeURIComponent(dir)}`} fileHref={p => `#${fileAnchor(p)}`} />
          </div>
        )}
        {data.files.map(f => <Diff key={f.path} file={f} />)}
      </>)}
    </section>
  )
}

const CATEGORIES = ['quality', 'containment', 'legibility', 'security', 'modularity']

function HealthView({ instance, base }: { instance: Instance; base: string }) {
  const { data, loaded, error, reload } = useRead<Health>(instance, `${base}/health`)
  if (error) return <Problem message={error} retry={reload} />
  if (!loaded) return <p className="dim">Scoring with cqx…</p>
  // null: nothing cqx reads (only docs, config, assets). No scores yet: cqx is still running.
  if (!data) return <p className="dim">Nothing to score yet. cqx reads code in 13 languages, among them Rust, TypeScript, Go, Python and Swift; push some and the scores appear here.</p>
  if (!data.scores) return <p className="dim">cqx is still scoring this repository. Check back in a minute. <button className="link" onClick={reload}>Refresh</button></p>
  const scores = data.scores
  return (
    <section className="health">
      <p className="dim small">cqx, run inside your Worker, over {data.lines.toLocaleString()} lines</p>
      {CATEGORIES.map(c => (
        <div key={c} className="bar">
          <span>{c}</span>
          <span className="track"><span className="fill" style={{ width: `${scores[c] ?? 0}%` }} /></span>
          <span className="num">{Math.round(scores[c] ?? 0)}</span>
        </div>
      ))}
    </section>
  )
}

function Problem({ message, retry }: { message: string; retry(): void }) {
  return <p className="error" role="alert">{message} <button className="link" onClick={retry}>Retry</button></p>
}

'use client'
// Agents ask to join with `gild agent join <label> --server <instance>`; the
// owner approves them here, as gild.gg's approval page does.
import { useCallback, useEffect, useState } from 'react'
import { httpFetch, type Instance } from '@/lib/platform'

interface Request { id: string; label: string; sponsor: string; repo: string | null; grants: string[]; note: string | null; createdAt: string }

export function AgentRequests({ instance }: { instance: Instance }) {
  const [requests, setRequests] = useState<Request[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const call = useCallback((path: string, init?: RequestInit) =>
    httpFetch(`${instance.url}${path}`, { ...init, headers: { authorization: `Bearer ${instance.token}`, 'content-type': 'application/json' } }), [instance])
  const load = useCallback(async () => {
    try {
      const res = await call('/api/agents/requests')
      if (res.ok) setRequests(((await res.json()) as { requests: Request[] }).requests)
    } catch { /* offline: the list stays as it was */ }
  }, [call])
  // Asked again whenever the window comes back to the front: a join is
  // something you start in a terminal and then come here to approve.
  useEffect(() => {
    void load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  async function decide(r: Request, decision: 'approve' | 'deny') {
    setBusy(r.id); setError('')
    try {
      const res = await call(`/api/agents/requests/${r.id}`, { method: 'POST', body: JSON.stringify({ decision, grants: r.grants }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string; message?: string }).error ?? `HTTP ${res.status}`)
      setRequests(list => list.filter(x => x.id !== r.id))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  return (
    <section className="requests" aria-label="Agent requests">
      <div className="side-head">
        <span className="dim small">Agents asking to join</span>
        <button className="ghost small" onClick={() => void load()} aria-label="Check for agent requests">↻</button>
      </div>
      {requests.length === 0 && <p className="dim small pad" title={`gild agent join <label> --sponsor ${instance.owner} --server ${instance.url}`}>None waiting.</p>}
      {requests.map(r => (
        <div key={r.id} className="request">
          <strong>@{r.sponsor}/{r.label}</strong>
          <span className="dim small">{r.repo ? `in ${r.repo}` : 'any repository you allow'}{r.grants.length ? ` · ${r.grants.join(', ')}` : ''}</span>
          {r.note && <span className="small">{r.note}</span>}
          <div className="row">
            <button className="primary small" disabled={busy === r.id} onClick={() => decide(r, 'approve')}>Approve</button>
            <button className="ghost small" disabled={busy === r.id} onClick={() => decide(r, 'deny')}>Deny</button>
          </div>
        </div>
      ))}
      {error && <p className="error small pad" role="alert">{error}</p>}
    </section>
  )
}

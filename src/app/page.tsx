'use client'
import { useEffect, useState } from 'react'
import { readInstance, type Instance } from '@/lib/platform'
import { Setup } from './Setup'
import { Workspace } from './Workspace'

export default function App() {
  const [instance, setInstance] = useState<Instance | null | undefined>(undefined)
  const [error, setError] = useState('')
  useEffect(() => { readInstance().then(setInstance, e => setError(String(e))) }, [])
  if (error) return <main className="center"><p className="error">{error}</p></main>
  if (instance === undefined) return <main className="center" aria-busy="true" />
  return instance ? <Workspace instance={instance} onForget={() => setInstance(null)} /> : <Setup onInstalled={setInstance} />
}

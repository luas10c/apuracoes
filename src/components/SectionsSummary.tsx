'use client'

import { useEffect, useState } from 'react'

type Sections = { total: number | null; done: number | null } | null

export function SectionsSummary() {
  const [sections, setSections] = useState<Sections>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/elections/results')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setSections(d.sections ?? null)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const total = sections?.total ?? 0
  const done = sections?.done ?? 0
  const remaining = Math.max(0, total - done)

  return (
    <p>
      Total de seções: {total.toLocaleString('pt-BR')} · Apuradas:{' '}
      {done.toLocaleString('pt-BR')} · Restantes:{' '}
      {remaining.toLocaleString('pt-BR')}
    </p>
  )
}

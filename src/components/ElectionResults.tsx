'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { Tabs } from './Tab'
import { Scrollable } from './Scrollable'

type Candidate = {
  id: number
  coalition: string
  party_number: number
  name: string
  name_vice: string
  position: number
  image_url: string
  pvap: string
  status: string
  votes: string
  elected?: boolean
}

const CARGOS = [
  { key: 'presidente', label: 'Presidente' },
  { key: 'governador', label: 'Governador' },
  { key: 'senador', label: 'Senador' },
  { key: 'federal', label: 'Deputados federais' },
  { key: 'estadual', label: 'Deputados estaduais' }
]

function toNumber(v: string | number) {
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const n = Number.parseFloat(
    s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  )
  return Number.isFinite(n) ? n : 0
}

function CandidateRow({
  c,
  elected
}: {
  c: Candidate
  elected: boolean
}) {
  const p = toNumber(c.pvap)
  return (
    <div>
      <div className="flex gap-4">
        <div className="relative size-16 overflow-hidden rounded-full">
          <Image
            src={c.image_url}
            className="object-cover object-top"
            fill
            alt={c.name}
          />
        </div>
        <div className="flex flex-1 justify-between gap-4">
          <div className="text-woodsmoke-400">
            <div className="flex items-center gap-2">
              <span className="text-woodsmoke-100 text-base font-bold md:text-lg">
                {c.name}
              </span>
              <span className="text-woodsmoke-100 inline-flex h-5 items-center rounded bg-royal-purple-500 px-1.5 text-[11px] font-bold">
                {c.party_number}
              </span>
              {elected && (
                <span className="bg-royal-purple-500 text-woodsmoke-100 inline-flex h-5 items-center rounded px-2 text-[10px] font-bold uppercase">
                  Eleito
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px]">{c.coalition}</p>
            <p className="mt-0.5 text-[11px]">Vice: {c.name_vice}</p>
          </div>
          <div>
            <span className="text-foreground text-2xl font-bold tabular-nums md:text-3xl">
              {p.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              <span className="text-muted-foreground text-base font-normal">
                %
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-2 py-4">
        <div className="bg-woodsmoke-800 relative h-2 w-full overflow-hidden rounded">
          <div
            className="bg-royal-purple-500 absolute h-2 rounded"
            style={{ width: `${Math.min(100, p)}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-woodsmoke-400 text-xs">
            {toNumber(c.votes).toLocaleString('pt-BR')} votos
          </span>
          <span className="text-woodsmoke-400 text-xs">{c.status}</span>
        </div>
      </div>
    </div>
  )
}

function StateResults({ uf }: { uf: string }) {
  const [data, setData] = useState<Record<string, Candidate[]>>({})

  useEffect(() => {
    let cancelled = false
    const load = () => {
      Promise.all(
        CARGOS.map((c) =>
          fetch(`/api/elections/state?uf=${uf}&cargo=${c.key}`)
            .then((r) => (r.ok ? r.json() : { cand: [] }))
            .then((d) => [c.key, (d.cand ?? []) as Candidate[]] as const)
            .catch(() => [c.key, [] as Candidate[]] as const)
        )
      ).then((entries) => {
        if (!cancelled) setData(Object.fromEntries(entries))
      })
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [uf])

  return (
    <Tabs.Root defaultValue="presidente" className="py-4">
      <Tabs.List>
        {CARGOS.map((c) => (
          <Tabs.Item key={c.key} value={c.key}>
            {c.label}
          </Tabs.Item>
        ))}
        <Tabs.Indicator />
      </Tabs.List>
      {CARGOS.map((c) => {
        const list = (data[c.key] ?? []) as Candidate[]
        return (
          <Tabs.Panel key={c.key} value={c.key}>
            <Scrollable className="max-h-[60vh]">
              <div className="space-y-4">
                {list.length === 0 ? (
                  <p className="text-woodsmoke-400 rounded bg-woodsmoke-800 p-3 text-sm">
                    Aguardando dados do TSE.
                  </p>
                ) : (
                  list.map((cand) => (
                    <CandidateRow
                      key={`${c.key}-${cand.id}`}
                      c={cand}
                      elected={!!cand.elected}
                    />
                  ))
                )}
              </div>
            </Scrollable>
          </Tabs.Panel>
        )
      })}
    </Tabs.Root>
  )
}

export function ElectionResults({
  selected
}: {
  selected: string | null
}) {
  const [cands, setCands] = useState<Candidate[]>([])
  const [waiting, setWaiting] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/elections/results')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return
          const list = (d.cand ?? []) as Candidate[]
          setCands(
            [...list].sort((a, b) => toNumber(b.pvap) - toNumber(a.pvap))
          )
          setWaiting(list.length === 0)
        })
        .catch(() => {
          if (!cancelled) setWaiting(true)
        })
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const winner = cands.find((c) => c.elected)

  return (
    <>
      {!selected && winner && (
        <div className="bg-woodsmoke-800/60 border-royal-purple-500 border-l-3 p-4">
          <p className="text-royal-purple-500 text-sm font-bold">
            Eleito presidente
          </p>
          <p className="text-foreground mt-0.5 text-sm">
            {winner.name} vence com{' '}
            {toNumber(winner.pvap).toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}
            % dos votos válidos.
          </p>
        </div>
      )}

      {selected ? (
        <StateResults uf={selected} />
      ) : (
        <div className="space-y-4 py-4">
          <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
            Candidatos
          </h2>
          <div className="space-y-4">
            {waiting && cands.length === 0 && (
              <p className="text-woodsmoke-400 rounded bg-woodsmoke-800 p-3 text-sm">
                Aguardando dados do TSE. O serviço oficial começa a divulgar às
                17h (Brasília); a página tenta de novo a cada 10 segundos.
              </p>
            )}
            {cands.map((c) => {
              const p = toNumber(c.pvap)
              return (
                    <CandidateRow
                      key={c.id}
                      c={c}
                      elected={!!c.elected}
                    />
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

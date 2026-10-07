'use client'

import { useMemo, useState } from 'react'

import { cn } from 'tailwind-variants'

import { Scrollable } from '#/components/Scrollable'
import { UF_NAMES } from '#/components/RegionCard'

export type SenatorElected = {
  nmu: string
  sg: string
  n: string
  sq: string
  vap: number
}

export type SenatorsSnapshot = {
  meta: {
    fotos: string
    atualizadoEm: string
  }
  ufs: Record<
    string,
    { elected: SenatorElected[]; hg: string | null; sectionsPct: number | null }
  >
}

type FeedItem = {
  key: string
  time: string
  sortKey: string
  photo: string
  photoName: string
  title: string
}

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

/** "03:00:00" -> "03h00" (quando vier com data, ignora o resto). */
function fmtHour(hg: string | null): string {
  if (!hg) return '–'
  const m = hg.match(/(\d{1,2}):(\d{2})/)
  if (!m) return '–'
  return `${m[1].padStart(2, '0')}h${m[2]}`
}

function FeedAvatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    return (
      <span
        aria-hidden="true"
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      >
        {initials || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-woodsmoke-700 h-9 w-9 shrink-0 rounded-full object-cover"
    />
  )
}

/**
 * Card "Últimas atualizações": senadores eleitos por UF a partir do
 * agregado ao vivo, ordenados pela hora de geração (`hg`) do TSE.
 */
export function LatestUpdates({
  senators,
  className
}: {
  senators: SenatorsSnapshot | null
  className?: string
}) {
  const items = useMemo<FeedItem[]>(() => {
    if (!senators) return []
    const fotos = senators.meta.fotos
    const out: FeedItem[] = []
    for (const [uf, data] of Object.entries(senators.ufs)) {
      if (data.elected.length === 0) continue
      const names = data.elected.map((e) => toTitle(e.nmu))
      const ufName = UF_NAMES[uf] ?? uf
      const title =
        names.length === 1
          ? `${ufName}: ${names[0]} é eleito para o Senado.`
          : `${ufName}: ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} são eleitos para o Senado.`
      const first = data.elected[0]
      out.push({
        key: `${uf}-${first.sq}`,
        time: fmtHour(data.hg),
        sortKey: data.hg ?? '',
        photo: fotos
          .replace('{uf}', uf.toLowerCase())
          .replace('{sqcand}', first.sq),
        photoName: toTitle(first.nmu),
        title
      })
    }
    out.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
    return out
  }, [senators])

  if (items.length === 0) return null

  return (
    <section
      aria-label="Últimas atualizações da apuração"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-2xl border p-4',
        className
      )}
    >
      <h2 className="text-woodsmoke-50 text-sm font-bold">
        Últimas atualizações
      </h2>
      <Scrollable aria-label="Atualizações" className="mt-1 max-h-72">
        <ul className="divide-y divide-woodsmoke-800">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2.5 py-2.5">
              <span className="text-woodsmoke-400 w-10 shrink-0 pt-1.5 text-[11px] tabular-nums">
                {item.time}
              </span>
              <FeedAvatar name={item.photoName} src={item.photo} />
              <p className="text-woodsmoke-200 min-w-0 flex-1 text-[13px] leading-snug">
                {item.title}
              </p>
            </li>
          ))}
        </ul>
      </Scrollable>
    </section>
  )
}

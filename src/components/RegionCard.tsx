'use client'

import { useMemo, useState } from 'react'

import { cn } from 'tailwind-variants'

import type { ExteriorSnapshot, PastSnapshot, TseSnapshot } from '#/components/Map'

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
  RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe',
  TO: 'Tocantins'
}

const REGIONS: { name: string; ufs: string[] }[] = [
  { name: 'Norte', ufs: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { name: 'Nordeste', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { name: 'Centro-Oeste', ufs: ['DF', 'GO', 'MT', 'MS'] },
  { name: 'Sudeste', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { name: 'Sul', ufs: ['PR', 'RS', 'SC'] }
]

function CandidateAvatar({ name, src }: { name: string; src: string }) {
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
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
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
      className="bg-woodsmoke-700 h-7 w-7 shrink-0 rounded-full object-cover"
    />
  )
}

function fmtPct1(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`
}

function fmtDelta(v: number): string {
  const s = v > 0 ? '+' : ''
  return `${s}${v.toFixed(1).replace('.', ',')}`
}

type RegionRow = {
  key: string
  name: string
  sections: string
  photo: string
  photoName: string
  sg: string
  pct: number
  delta: number | null
}

function accentOfSg(sg: string): string {
  if (sg === 'PL') return '#5b8def'
  if (sg === 'PT') return '#f87171'
  return '#9ca3af'
}

/**
 * Card "Por região": quem lidera para presidente em cada região,
 * com % das seções, foto do líder e variação vs 2022 (mesmo partido).
 */
export function RegionCard({
  results,
  past,
  exterior,
  className
}: {
  results: TseSnapshot | null
  past: PastSnapshot | null
  exterior: ExteriorSnapshot | null
  className?: string
}) {
  const rows = useMemo<RegionRow[]>(() => {
    if (!results) return []
    const out: RegionRow[] = []
    for (const region of REGIONS) {
      const vapBySq = new Map<string, number>()
      let vv = 0
      let st = 0
      let ts = 0
      for (const uf of region.ufs) {
        const place = results.ufs[uf]
        if (!place) continue
        vv += place.vv ?? 0
        st += place.st ?? 0
        ts += place.ts ?? 0
        for (const c of place.top) {
          vapBySq.set(c.sq, (vapBySq.get(c.sq) ?? 0) + c.vap)
        }
      }
      if (vv <= 0) continue
      const [sq, vap] = [...vapBySq.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
      if (!sq) continue
      const info = results.candidatos?.[sq]
      const pct = Math.round((vap / vv) * 1000) / 10
      // Variação vs 2022: mesmo partido (sg) somado nas UFs da região.
      let delta: number | null = null
      if (past && info?.sg) {
        let vap22 = 0
        let vv22 = 0
        for (const uf of region.ufs) {
          const p = past.ufs[uf]
          if (!p) continue
          vv22 += p.vv ?? 0
          for (const c of p.top) {
            if (c.sg === info.sg) vap22 += c.vap
          }
        }
        if (vv22 > 0) {
          delta = Math.round((pct - (vap22 / vv22) * 100) * 10) / 10
        }
      }
      out.push({
        key: region.name,
        name: region.name,
        sections: ts > 0 ? `${Math.round((st / ts) * 100)}%` : '–',
        photo: results.meta.fotos.replace('{sqcand}', sq),
        photoName: info?.nmu ?? '',
        sg: info?.sg ?? '',
        pct,
        delta
      })
    }
    // Linha do exterior (agregado ZZ ao vivo).
    if (exterior && exterior.total.top.length > 0) {
      const t0 = exterior.total.top[0]
      const info = results.candidatos?.[t0.sq]
      const pct = exterior.total.vv
        ? Math.round((t0.vap / (exterior.total.vv ?? 1)) * 1000) / 10
        : 0
      out.push({
        key: 'Exterior',
        name: 'Exterior',
        sections:
          exterior.total.ts != null && exterior.total.ts > 0
            ? `${Math.round(((exterior.total.st ?? 0) / (exterior.total.ts ?? 1)) * 100)}%`
            : '–',
        photo: exterior.meta.fotos.replace('{sqcand}', t0.sq),
        photoName: info?.nmu ?? t0.nmu,
        sg: info?.sg ?? t0.sg,
        pct,
        delta: null
      })
    }
    return out
  }, [results, past, exterior])

  if (rows.length === 0) return null

  return (
    <section
      aria-label="Apuração por região"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-2xl border p-4',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-woodsmoke-50 text-sm font-bold">Por região</h2>
        <p className="text-woodsmoke-400 text-[11px]">
          Quem lidera para presidente
        </p>
      </div>
      <ul className="mt-2 divide-y divide-woodsmoke-800">
        {rows.map((r) => (
          <li key={r.key} className="py-2.5 first:pt-1 last:pb-0">
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-woodsmoke-50 truncate text-sm font-bold">
                  {r.key === 'Exterior' ? '🌐 Exterior' : r.name}
                </p>
                <p className="text-woodsmoke-400 text-[11px] tabular-nums">
                  {r.sections}
                </p>
              </div>
              <CandidateAvatar name={r.photoName} src={r.photo} />
              <p className="text-right leading-tight tabular-nums">
                <span
                  className="text-xs font-bold"
                  style={{ color: accentOfSg(r.sg) }}
                >
                  {r.sg}
                </span>{' '}
                <span className="text-woodsmoke-50 text-sm font-bold">
                  {fmtPct1(r.pct)}
                </span>
                {r.delta != null && (
                  <span
                    className={cn(
                      'ml-1.5 text-[11px] font-semibold',
                      r.delta > 0
                        ? 'text-emerald-400'
                        : r.delta < 0
                          ? 'text-red-400'
                          : 'text-woodsmoke-400'
                    )}
                  >
                    {fmtDelta(r.delta)}
                  </span>
                )}
              </p>
            </div>
            <div
              className="bg-woodsmoke-800 mt-1.5 h-1 overflow-hidden rounded-full"
              role="img"
              aria-label={`${r.sg} ${fmtPct1(r.pct)} na região ${r.name}`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, r.pct))}%`,
                  backgroundColor: accentOfSg(r.sg)
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

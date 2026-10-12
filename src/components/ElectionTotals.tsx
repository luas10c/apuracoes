'use client'

import { cn } from 'tailwind-variants'

import type { TseSnapshot } from '#/components/Map'

function fmtInt(v: number | null): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function fmtPct(v: number | null, base: number | null): string {
  if (v == null || base == null || base <= 0) return '–'
  return `${((v / base) * 100).toFixed(2).replace('.', ',')}%`
}

/** Card "Votos": válidos, brancos, nulos, abstenções e comparecimento. */
export function ElectionTotals({
  results,
  className
}: {
  results: TseSnapshot | null
  className?: string
}) {
  if (!results) return null
  const n = results.nacional
  const tv = n.tv ?? (n.vv ?? 0) + (n.vb ?? 0) + (n.vn ?? 0)
  const voters = n.te != null && n.a != null ? n.te - n.a : null
  const turnout = fmtPct(voters, n.te)
  const cells = [
    { label: 'Válidos', value: fmtInt(n.vv), pct: fmtPct(n.vv, tv) },
    { label: 'Brancos', value: fmtInt(n.vb), pct: fmtPct(n.vb, tv) },
    { label: 'Nulos', value: fmtInt(n.vn), pct: fmtPct(n.vn, tv) },
    { label: 'Abstenções', value: fmtInt(n.a), pct: fmtPct(n.a, n.te) }
  ]
  return (
    <section
      aria-label="Total de votos"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-woodsmoke-50 text-xs font-bold">Votos</h2>
        <p className="text-woodsmoke-400 text-[11px] tabular-nums">
          Comparecimento{' '}
          <strong className="text-woodsmoke-200">{turnout}</strong>
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-woodsmoke-400 text-[11px]">{c.label}</dt>
            <dd className="text-woodsmoke-50 text-[13px] leading-snug font-bold tabular-nums">
              {c.value}{' '}
              <span className="text-woodsmoke-400 text-[11px] font-semibold">
                {c.pct}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

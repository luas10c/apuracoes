'use client'

import { useMemo } from 'react'

import { cn } from 'tailwind-variants'

export type TrendPoint = {
  /** Timestamp da coleta. */
  t: number
  /** % de seções apuradas (eixo X). */
  pst: number | null
  /** % do 1º colocado (azul). */
  a: number
  /** % do 2º colocado (vermelho). */
  b: number
}

const W = 320
const H = 170
const PAD_L = 34
const PAD_R = 8
const PAD_T = 8
const PAD_B = 20

function fmtPct1(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`
}

/**
 * Gráfico "Ao longo da apuração": % dos 2 primeiros colocados (eixo Y)
 * pela % de seções apuradas (eixo X). A série é coletada ao vivo no
 * client (polling + localStorage) — sem histórico, mostra estado vazio.
 */
export function TrendChart({
  points,
  nameA,
  nameB,
  className
}: {
  points: TrendPoint[]
  nameA: string
  nameB: string
  className?: string
}) {
  const geom = useMemo(() => {
    if (points.length < 2) return null
    const vals = points.flatMap((p) => [p.a, p.b])
    let lo = Math.min(...vals)
    let hi = Math.max(...vals)
    if (hi - lo < 4) {
      const mid = (hi + lo) / 2
      lo = mid - 2
      hi = mid + 2
    }
    lo = Math.floor(lo - 1)
    hi = Math.ceil(hi + 1)
    const x = (pst: number | null, i: number) => {
      const px = pst ?? (i / Math.max(1, points.length - 1)) * 100
      return PAD_L + (Math.min(100, Math.max(0, px)) / 100) * (W - PAD_L - PAD_R)
    }
    const y = (v: number) =>
      PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B)
    const line = (pick: (p: TrendPoint) => number) =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.pst, i).toFixed(1)},${y(pick(p)).toFixed(1)}`)
        .join(' ')
    const steps = 5
    const ticks = Array.from(
      { length: steps + 1 },
      (_, i) => lo + ((hi - lo) / steps) * i
    )
    return { lo, hi, x, y, lineA: line((p) => p.a), lineB: line((p) => p.b), ticks }
  }, [points])

  return (
    <section
      aria-label="Evolução ao longo da apuração"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-2xl border p-4',
        className
      )}
    >
      <h2 className="text-woodsmoke-50 text-sm font-bold">
        Ao longo da apuração
      </h2>
      {geom ? (
        <>
          <p className="mt-1 flex items-center gap-3 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-[#f87171]">
              <i className="inline-block h-0.5 w-4 bg-[#f87171]" aria-hidden="true" />
              {nameB}
            </span>
            <span className="inline-flex items-center gap-1 text-[#5b8def]">
              <i className="inline-block h-0.5 w-4 bg-[#5b8def]" aria-hidden="true" />
              {nameA}
            </span>
          </p>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Evolução de ${nameA} e ${nameB} por seções apuradas`}
            className="mt-1 block w-full"
          >
            {geom.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={geom.y(t)}
                  y2={geom.y(t)}
                  stroke="#3f3f46"
                  strokeWidth={0.5}
                  strokeOpacity={0.6}
                />
                <text
                  x={PAD_L - 4}
                  y={geom.y(t) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="#71717a"
                >
                  {Math.round(t)}%
                </text>
              </g>
            ))}
            <text x={PAD_L} y={H - 6} fontSize={9} fill="#71717a">
              0% das seções
            </text>
            <text x={W / 2} y={H - 6} fontSize={9} fill="#71717a" textAnchor="middle">
              50%
            </text>
            <text x={W - PAD_R} y={H - 6} fontSize={9} fill="#71717a" textAnchor="end">
              100%
            </text>
            <path
              d={geom.lineB}
              fill="none"
              stroke="#f87171"
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={geom.lineA}
              fill="none"
              stroke="#5b8def"
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length > 0 && (
              <g>
                <circle
                  cx={geom.x(points[points.length - 1].pst, points.length - 1)}
                  cy={geom.y(points[points.length - 1].a)}
                  r={3}
                  fill="#5b8def"
                />
                <circle
                  cx={geom.x(points[points.length - 1].pst, points.length - 1)}
                  cy={geom.y(points[points.length - 1].b)}
                  r={3}
                  fill="#f87171"
                />
              </g>
            )}
          </svg>
        </>
      ) : (
        <p className="text-woodsmoke-400 mt-2 text-xs">
          Coletando dados ao vivo — o gráfico se forma a cada atualização da
          apuração.
        </p>
      )}
    </section>
  )
}

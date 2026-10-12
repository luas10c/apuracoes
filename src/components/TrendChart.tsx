'use client'

import { useMemo } from 'react'

import { cn } from 'tailwind-variants'
import { defineChart, dot, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { WINNER_COLORS } from '#/data/parties'

export type TrendPoint = {
  t: number
  pst: number | null
  a: number
  b: number
}

const BLUE = WINNER_COLORS.flavio
const RED = WINNER_COLORS.lula
const AXIS_TEXT = '#71717a'
const GRID = '#3f3f46'

type Row = { pst: number; a: number; b: number }

type TrendTicks = { lo: number; hi: number; ticks: number[] }

export function trendTicks(rows: Row[]): TrendTicks | null {
  if (rows.length < 2) return null
  const vals = rows.flatMap((r) => [r.a, r.b])
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo < 4) {
    const mid = (hi + lo) / 2
    lo = mid - 2
    hi = mid + 2
  }
  lo = Math.floor((lo - 1) / 4) * 4
  hi = Math.ceil((hi + 1) / 4) * 4
  const ticks: number[] = []
  for (let t = Math.ceil(lo / 4) * 4; t <= hi; t += 4) ticks.push(t)
  return { lo, hi, ticks }
}

export function buildTrendDefinition(rows: Row[], ticks: TrendTicks) {
  const last = rows[rows.length - 1]
  return defineChart({
    marks: [
      lineY(rows, { x: 'pst', y: 'b', stroke: RED, strokeWidth: 1.8 }),
      lineY(rows, { x: 'pst', y: 'a', stroke: BLUE, strokeWidth: 1.8 }),
      dot([last], { x: 'pst', y: 'b', fill: RED, r: 3 }),
      dot([last], { x: 'pst', y: 'a', fill: BLUE, r: 3 })
    ],
    scales: {
      x: {
        scale: scaleLinear,
        viewport: { domain: [0, 100] },
        axis: {
          line: false,
          ticks: {
            values: [0, 50, 100],
            size: 0,
            format: (v) => (v === 0 ? '0% das seções' : `${v}%`)
          },
          tickLabels: { fontSize: 9 }
        }
      },
      y: {
        scale: scaleLinear,
        viewport: { domain: [ticks.lo, ticks.hi] },
        grid: { stroke: GRID, strokeOpacity: 0.6, strokeWidth: 0.5 },
        axis: {
          line: false,
          ticks: {
            values: ticks.ticks,
            size: 0,
            format: (v) => `${v}%`
          },
          tickLabels: { fontSize: 9 }
        }
      }
    },
    theme: { foreground: AXIS_TEXT, grid: GRID }
  })
}

/** Gráfico "Ao longo da apuração" (série coletada ao vivo + servidor). */
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
  const rows = useMemo<Row[]>(
    () =>
      points
        .filter((p) => p.pst != null)
        .map((p) => ({ pst: p.pst as number, a: p.a, b: p.b })),
    [points]
  )

  const yTicks = useMemo(() => trendTicks(rows), [rows])

  const spread = useMemo(() => new Set(rows.map((r) => r.pst)).size, [rows])

  const definition = useMemo(() => {
    if (rows.length < 2 || spread < 2 || !yTicks) return null
    return buildTrendDefinition(rows, yTicks)
  }, [rows, spread, yTicks])

  const last = rows[rows.length - 1]

  return (
    <section
      aria-label="Evolução ao longo da apuração"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3',
        className
      )}
    >
      <h2 className="text-woodsmoke-50 text-xs font-bold">
        Ao longo da apuração
      </h2>
      {definition ? (
        <>
          <p className="mt-1 flex items-center gap-3 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1.5" style={{ color: RED }}>
              <i
                className="inline-block h-[3px] w-5 rounded-full"
                style={{ backgroundColor: RED }}
                aria-hidden="true"
              />
              {nameB}
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: BLUE }}>
              <i
                className="inline-block h-[3px] w-5 rounded-full"
                style={{ backgroundColor: BLUE }}
                aria-hidden="true"
              />
              {nameA}
            </span>
          </p>
          <Chart
            definition={definition}
            height={130}
            ariaLabel={`Evolução de ${nameA} e ${nameB} por seções apuradas`}
          />
        </>
      ) : last ? (
        <div className="mt-1">
          <p className="flex items-center gap-3 text-[11px] font-semibold tabular-nums">
            <span style={{ color: RED }}>
              {nameB} {last.b.toFixed(1).replace('.', ',')}%
            </span>
            <span style={{ color: BLUE }}>
              {nameA} {last.a.toFixed(1).replace('.', ',')}%
            </span>
          </p>
          <p className="text-woodsmoke-400 mt-1 text-xs">
            Pontos acumulados em {last.pst}% das seções — a curva aparece
            assim que a apuração avançar.
          </p>
        </div>
      ) : (
        <p className="text-woodsmoke-400 mt-2 text-xs">
          Coletando dados ao vivo — o gráfico se forma a cada atualização da
          apuração.
        </p>
      )}
    </section>
  )
}

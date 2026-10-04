'use client'

import { useEffect, useRef, useState } from 'react'

import { SVGPATHS } from './svg-paths'
import { Tooltip } from './Tooltip'

const UFS = [
  { s: 'AC', n: 'Acre' },
  { s: 'AL', n: 'Alagoas' },
  { s: 'AP', n: 'Amapá' },
  { s: 'AM', n: 'Amazonas' },
  { s: 'BA', n: 'Bahia' },
  { s: 'CE', n: 'Ceará' },
  { s: 'DF', n: 'Distrito Federal' },
  { s: 'ES', n: 'Espírito Santo' },
  { s: 'GO', n: 'Goiás' },
  { s: 'MA', n: 'Maranhão' },
  { s: 'MT', n: 'Mato Grosso' },
  { s: 'MS', n: 'Mato Grosso do Sul' },
  { s: 'MG', n: 'Minas Gerais' },
  { s: 'PA', n: 'Pará' },
  { s: 'PB', n: 'Paraíba' },
  { s: 'PR', n: 'Paraná' },
  { s: 'PE', n: 'Pernambuco' },
  { s: 'PI', n: 'Piauí' },
  { s: 'RJ', n: 'Rio de Janeiro' },
  { s: 'RN', n: 'Rio Grande do Norte' },
  { s: 'RS', n: 'Rio Grande do Sul' },
  { s: 'RO', n: 'Rondônia' },
  { s: 'RR', n: 'Roraima' },
  { s: 'SC', n: 'Santa Catarina' },
  { s: 'SP', n: 'São Paulo' },
  { s: 'SE', n: 'Sergipe' },
  { s: 'TO', n: 'Tocantins' }
]

export function Map({
  selected,
  onSelect
}: {
  selected: string | null
  onSelect: (s: string | null) => void
}) {
  const [tip, setTip] = useState<{ x: number; y: number; name: string } | null>(
    null
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [labels, setLabels] = useState<
    { x: number; y: number; sig: string }[]
  >([])
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    setLabels(
      Array.from(svg.querySelectorAll('path')).map((p) => {
        const bb = p.getBBox()
        return {
          x: bb.x + bb.width / 2,
          y: bb.y + bb.height / 2,
          sig: p.getAttribute('data-s') ?? ''
        }
      })
    )
  }, [])

  const toggle = (s: string) => {
    setTip(null)
    onSelect(selected === s ? null : s)
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-[clamp(360px,58vh,620px)] w-full"
    >
      <svg
        ref={svgRef}
        viewBox="0 0 613 639"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Mapa do Brasil por estado"
        className="block h-full w-full"
      >
        {UFS.map((u) => (
          <path
            key={u.s}
            data-s={u.s}
            d={SVGPATHS[u.s.toLowerCase()]}
            tabIndex={0}
            role="button"
            aria-label={u.n}
            style={{
              cursor: 'pointer',
              fill: 'var(--color-royal-purple-500)',
              stroke:
                selected === u.s ? '#fff' : 'var(--color-woodsmoke-900)',
              strokeWidth: selected === u.s ? 2.2 : 0.9,
              opacity:
                selected && selected !== u.s
                  ? 0.5
                  : hovered === u.s
                    ? 0.8
                    : 1,
              transition: 'opacity .2s, stroke-width .2s',
              outline: 'none'
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggle(u.s)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(u.s)
              }
            }}
            onMouseEnter={() => setHovered(u.s)}
            onMouseMove={(e) => {
              const r = wrapRef.current?.getBoundingClientRect()
              if (!r) return
              setTip({ x: e.clientX - r.left, y: e.clientY - r.top, name: u.n })
            }}
            onMouseLeave={() => {
              setTip(null)
              setHovered(null)
            }}
          />
        ))}
        {labels.map((l) => (
          <text
            key={l.sig}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
            className="fill-royal-purple-950 text-[10px] font-bold"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {l.sig}
          </text>
        ))}
      </svg>
      {tip && (
        <Tooltip
          x={tip.x}
          y={tip.y}
          maxLeft={(wrapRef.current?.clientWidth ?? 0) - 200}
        >
          {tip.name}
        </Tooltip>
      )}
    </div>
  )
}

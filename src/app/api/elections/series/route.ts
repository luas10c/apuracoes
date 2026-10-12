/**
 * Série "Ao longo da apuração" — Eleições 2026, Presidente.
 *
 * GET /api/elections/series?turno=1|2
 * Devolve os pontos coletados pelo servidor a cada agregação com conteúdo
 * novo (`{ t, pst, a, b }`: timestamp, % de seções, % dos 2 primeiros sobre
 * votos válidos). Permite ao gráfico renderizar a curva completa mesmo para
 * quem abriu a página no meio/fim da apuração. Arquivos separados por
 * turno; a curva de referência (seed) existe só para o 1T.
 */
export const dynamic = 'force-dynamic'

import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  pleitoPresidente,
  turnoSuffix,
  type Turno
} from '#/data/election'

function filesFor(turno: Turno) {
  const eleicao = pleitoPresidente(turno)
  const sfx = turnoSuffix(turno)
  return {
    live: join(tmpdir(), 'tse-cache', `series-${eleicao}-${sfx}.json`),
    seed:
      turno === 1
        ? join(process.cwd(), 'public', 'maps', `series-${eleicao}-${sfx}-seed.json`)
        : null
  }
}
const SERIES_MAX = 500

function validPoint(p: unknown): p is {
  t: number
  pst: number | null
  a: number
  b: number
} {
  if (typeof p !== 'object' || p === null) return false
  const o = p as Record<string, unknown>
  return (
    Number.isFinite(o.t) &&
    (o.pst == null || Number.isFinite(o.pst)) &&
    Number.isFinite(o.a) &&
    Number.isFinite(o.b)
  )
}

async function readPoints(file: string) {
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(validPoint)
  } catch {
    return []
  }
}

export async function GET(request: Request) {
  const turno: Turno =
    new URL(request.url).searchParams.get('turno') === '2' ? 2 : 1
  const files = filesFor(turno)
  const [seed, live] = await Promise.all([
    files.seed ? readPoints(files.seed) : Promise.resolve([]),
    readPoints(files.live)
  ])
  return Response.json({ points: [...seed, ...live].slice(-SERIES_MAX) })
}

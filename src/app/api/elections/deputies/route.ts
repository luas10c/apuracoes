/**
 * Deputados por UF AO VIVO — Eleições 2026 (pleito 6259, cargos 0006
 * Deputado Federal e 0007 Deputado Estadual).
 *
 * GET /api/elections/deputies
 * Agrega os 27 arquivos oficiais de cada cargo, conta eleitos por partido
 * (`st` "Eleito…", quociente já calculado pelo TSE) e devolve composição da
 * Câmara/assembleias, top votados por UF e ranking nacional. Mesmo SWR em
 * arquivo das demais rotas (`/tmp/tse-cache` + snapshot do build).
 */
export const dynamic = 'force-dynamic'

import { after } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELEICAO = '6259'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

/** Vagas constitucionais da Câmara por UF (federais). */
const VAGAS_FEDERAL: Record<string, number> = {
  AC: 8, AL: 9, AP: 8, AM: 8, BA: 39, CE: 22, DF: 8, ES: 10, GO: 17,
  MA: 18, MT: 8, MS: 8, MG: 53, PA: 17, PB: 12, PR: 30, PE: 25, PI: 10,
  RJ: 46, RN: 8, RS: 31, RO: 8, RR: 8, SC: 16, SP: 70, SE: 8, TO: 8
}

const CARGOS = [
  { key: 'federal', cargo: '0006', nome: 'Deputado Federal' },
  { key: 'estadual', cargo: '0007', nome: 'Deputado Estadual' }
] as const

const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')
const CACHE_FILE = join(CACHE_DIR, `deputies-${ELEICAO}-1t.json`)
const CACHE_FILE_FULL = join(CACHE_DIR, `deputies-${ELEICAO}-1t-full.json`)
/** Snapshot gerado no build (`npm run prebuild`) — fallback instantâneo. */
const STATIC_FILE = join(
  process.cwd(),
  'public',
  'maps',
  `tse-deputados-2026-1t.json`
)

const CONCURRENCY = 12
const UPSTREAM_TIMEOUT_MS = 15000
const RANKING_N = 50
const UF_TOP_N = 10

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function getJSON(url: string) {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { 'User-Agent': 'apuracoes/1.0 (+agregador ele2026)' }
  })
  if (!res.ok) throw new Error(`TSE respondeu ${res.status}`)
  return res.json()
}

async function getJSONRetry(url: string, retries = 2): Promise<unknown> {
  let lastErr: unknown = null
  for (let i = 0; i <= retries; i++) {
    try {
      return await getJSON(url)
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  throw lastErr
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<{ ok: boolean; value?: R }[]> {
  const out: { ok: boolean; value?: R }[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    new Array(Math.min(size, items.length)).fill(null).map(async () => {
      while (cursor < items.length) {
        const i = cursor++
        try {
          out[i] = { ok: true, value: await fn(items[i]) }
        } catch {
          out[i] = { ok: false }
        }
      }
    })
  )
  return out
}

type Candidate = {
  sq: string
  nmu: string
  sg: string
  n: string
  vap: number
  elected: boolean
  uf: string
}

function extractCandidates(data: unknown, uf: string): Candidate[] {
  const d = data as {
    carg?: { agr?: { par?: { sg?: string; n?: string; cand?: Record<string, unknown>[] }[] }[] }[]
  }
  const list: Candidate[] = []
  for (const agr of d?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        list.push({
          sq: String(c.sqcand),
          nmu: String(c.nmu ?? c.nm ?? ''),
          sg: String(par?.sg ?? ''),
          n: String(par?.n ?? ''),
          vap: num(c.vap) ?? 0,
          elected: /^\s*eleit/i.test(String(c.st ?? '')),
          uf
        })
      }
    }
  }
  list.sort((a, b) => b.vap - a.vap)
  return list
}

type UfData = {
  seats: { sg: string; eleitos: number }[]
  top: Candidate[]
  totalEleitos: number
  totalCandidatos: number
  vv: number | null
  sectionsPct: number | null
}

type CargoData = {
  vagas: number | null
  totalEleitos: number
  totalCandidatos: number
  partidos: { sg: string; eleitos: number }[]
  ufs: Record<string, UfData>
  ranking: Candidate[]
  all?: Candidate[]
}

type Payload = {
  meta: Record<string, unknown>
  federal: CargoData
  estadual: CargoData
}

type CacheEntry = { at: number; payload: Payload }

async function readCache(file: string = CACHE_FILE): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(file, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.payload || typeof entry.at !== 'number') return null
    return entry
  } catch {
    return null
  }
}

/** Snapshot do build — sempre existe após `prebuild` bem-sucedido. */
async function readStatic(): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(STATIC_FILE, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.payload || typeof entry.at !== 'number') return null
    return entry
  } catch {
    return null
  }
}

async function writeCache(entry: CacheEntry, file: string = CACHE_FILE): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, JSON.stringify(entry))
}

/** Dedup por variante (resumo ou completa). */
const inflight = new Map<string, Promise<CacheEntry>>()

function refresh(variant: string): Promise<CacheEntry> {
  const cached = inflight.get(variant)
  if (cached) return cached
  const p = aggregate(variant === 'full')
    .then(async (payload) => {
      const entry = { at: Date.now(), payload }
      await writeCache(entry, variant === 'full' ? CACHE_FILE_FULL : CACHE_FILE).catch(() => {})
      return entry
    })
    .finally(() => {
      inflight.delete(variant)
    })
  inflight.set(variant, p)
  return p
}

async function aggregateCargo(
  cargo: string,
  vagas: Record<string, number> | null,
  includeAll: boolean
): Promise<CargoData> {
  const files = await mapPool(UFS, CONCURRENCY, (uf) =>
    getJSONRetry(`${BASE}/dados/${uf}/${uf}-c${cargo}-e00${ELEICAO}-u.json`)
  )
  const ufs: Record<string, UfData> = {}
  const partySeats = new Map<string, number>()
  const all: Candidate[] = []
  let totalCandidatos = 0
  UFS.forEach((uf, i) => {
    const r = files[i]
    if (!r.ok) return
    const UF = uf.toUpperCase()
    const cands = extractCandidates(r.value, UF)
    totalCandidatos += cands.length
    const elected = cands.filter((c) => c.elected)
    const seats = new Map<string, number>()
    for (const c of elected) {
      seats.set(c.sg, (seats.get(c.sg) ?? 0) + 1)
      partySeats.set(c.sg, (partySeats.get(c.sg) ?? 0) + 1)
    }
    const d = r.value as { s?: Record<string, unknown>; v?: Record<string, unknown> }
    ufs[UF] = {
      seats: [...seats.entries()]
        .map(([sg, eleitos]) => ({ sg, eleitos }))
        .sort((a, b) => b.eleitos - a.eleitos),
      top: cands.slice(0, UF_TOP_N),
      totalEleitos: elected.length,
      totalCandidatos: cands.length,
      vv: num(d?.v?.vv),
      sectionsPct: num(d?.s?.pst)
    }
    all.push(...cands)
  })
  all.sort((a, b) => b.vap - a.vap)
  const totalEleitos = [...partySeats.values()].reduce((s, v) => s + v, 0)
  return {
    vagas: vagas
      ? Object.values(vagas).reduce((s, v) => s + v, 0)
      : null,
    totalEleitos,
    totalCandidatos,
    partidos: [...partySeats.entries()]
      .map(([sg, eleitos]) => ({ sg, eleitos }))
      .sort((a, b) => b.eleitos - a.eleitos),
    ufs,
    ranking: all.slice(0, RANKING_N),
    ...(includeAll ? { all } : {})
  }
}

async function aggregate(includeAll: boolean): Promise<Payload> {
  try {
    const [federal, estadual] = await Promise.all([
      aggregateCargo(CARGOS[0].cargo, VAGAS_FEDERAL, includeAll),
      aggregateCargo(CARGOS[1].cargo, null, includeAll)
    ])
    return {
      meta: {
        fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
        eleicao: ELEICAO,
        turno: 1,
        cargo: 'Deputados',
        atualizadoEm: new Date().toISOString(),
        fotos: `${BASE}/fotos/{uf}/{sqcand}.jpeg`
      },
      federal,
      estadual
    }
  } catch {
    throw new Error('Falha ao buscar TSE')
  }
}

export async function GET(request: Request) {
  const full = new URL(request.url).searchParams.get('full') === '1'
  const variant = full ? 'full' : 'summary'
  const [tmp, statik] = await Promise.all([
    readCache(full ? CACHE_FILE_FULL : CACHE_FILE),
    full ? Promise.resolve(null) : readStatic()
  ])
  const fresh = tmp && Date.now() - tmp.at < CACHE_TTL_MS ? tmp : null
  if (fresh) {
    return Response.json({ ...fresh.payload, meta: { ...fresh.payload.meta, cached: true } })
  }
  const best =
    tmp && statik ? (tmp.at >= statik.at ? tmp : statik) : (tmp ?? statik)
  if (best) {
    after(() => refresh(variant).catch(() => {}))
    return Response.json({
      ...best.payload,
      meta: { ...best.payload.meta, cached: true, revalidating: true }
    })
  }
  try {
    const entry = await refresh(variant)
    return Response.json({ ...entry.payload, meta: { ...entry.payload.meta, cached: false } })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

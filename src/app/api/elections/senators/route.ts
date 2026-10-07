/**
 * Senadores eleitos por UF AO VIVO — Eleições 2026, 1º turno (pleito 6259,
 * cargo 0005). Alimenta o card "Últimas atualizações".
 *
 * GET /api/elections/senators
 * Agrega os 27 arquivos oficiais de senador, extrai os eleitos
 * (`e === 's'`) com foto e o carimbo `hg` (hora de geração) para ordenar
 * o feed. Mesmo SWR em arquivo das demais rotas
 * (`/tmp/tse-cache` + snapshot do build).
 */
export const dynamic = 'force-dynamic'

import { after } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELEICAO = '6259'
const CARGO = '0005'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')
const CACHE_FILE = join(CACHE_DIR, `senators-${ELEICAO}-1t.json`)
/** Snapshot gerado no build (`npm run prebuild`) — fallback instantâneo. */
const STATIC_FILE = join(
  process.cwd(),
  'public',
  'maps',
  `tse-senadores-2026-1t.json`
)

const CONCURRENCY = 12
const UPSTREAM_TIMEOUT_MS = 15000

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

type Elected = {
  nmu: string
  sg: string
  n: string
  sq: string
  vap: number
}

function extractElected(data: unknown): Elected[] {
  const d = data as {
    carg?: { agr?: { par?: { sg?: string; n?: string; cand?: Record<string, unknown>[] }[] }[] }[]
  }
  const list: (Elected & { seq: number })[] = []
  for (const agr of d?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        const elected =
          c.e === 's' || /^\s*eleito\b/i.test(String(c.st ?? ''))
        if (!elected) continue
        list.push({
          nmu: String(c.nmu ?? c.nm ?? ''),
          sg: String(par?.sg ?? ''),
          n: String(par?.n ?? ''),
          sq: String(c.sqcand),
          vap: num(c.vap) ?? 0,
          seq: Number(c.seq ?? 999)
        })
      }
    }
  }
  list.sort((a, b) => a.seq - b.seq)
  return list.map(({ seq: _seq, ...rest }) => rest)
}

type Payload = {
  meta: Record<string, unknown>
  ufs: Record<
    string,
    { elected: Elected[]; hg: string | null; sectionsPct: number | null }
  >
}

type CacheEntry = { at: number; payload: Payload }

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8')
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

async function writeCache(entry: CacheEntry): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(CACHE_FILE, JSON.stringify(entry))
}

/** Dedup: 1 única revalidação em voo (evita estouro no TSE). */
let inflight: Promise<CacheEntry> | null = null

function refresh(): Promise<CacheEntry> {
  if (!inflight) {
    inflight = aggregate()
      .then(async (payload) => {
        const entry = { at: Date.now(), payload }
        await writeCache(entry).catch(() => {})
        return entry
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

async function aggregate(): Promise<Payload> {
  try {
    const files = await mapPool(UFS, CONCURRENCY, (uf) =>
      getJSONRetry(`${BASE}/dados/${uf}/${uf}-c${CARGO}-e00${ELEICAO}-u.json`)
    )
    const ufs: Payload['ufs'] = {}
    UFS.forEach((uf, i) => {
      const r = files[i]
      if (!r.ok) return
      const d = r.value as {
        hg?: unknown
        s?: Record<string, unknown>
      }
      ufs[uf.toUpperCase()] = {
        elected: extractElected(r.value),
        hg: typeof d?.hg === 'string' ? d.hg : null,
        sectionsPct: num(d?.s?.pst)
      }
    })
    return {
      meta: {
        fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
        eleicao: ELEICAO,
        turno: 1,
        cargo: 'Senador',
        atualizadoEm: new Date().toISOString(),
        fotos: `${BASE}/fotos/{uf}/{sqcand}.jpeg`
      },
      ufs
    }
  } catch {
    throw new Error('Falha ao buscar TSE')
  }
}

export async function GET() {
  const [tmp, statik] = await Promise.all([readCache(), readStatic()])
  const fresh = tmp && Date.now() - tmp.at < CACHE_TTL_MS ? tmp : null
  if (fresh) {
    return Response.json({ ...fresh.payload, meta: { ...fresh.payload.meta, cached: true } })
  }
  const best =
    tmp && statik ? (tmp.at >= statik.at ? tmp : statik) : (tmp ?? statik)
  if (best) {
    after(() => refresh().catch(() => {}))
    return Response.json({
      ...best.payload,
      meta: { ...best.payload.meta, cached: true, revalidating: true }
    })
  }
  try {
    const entry = await refresh()
    return Response.json({ ...entry.payload, meta: { ...entry.payload.meta, cached: false } })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

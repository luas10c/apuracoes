/**
 * Governadores por UF AO VIVO — Eleições 2026 (pleito 6259, cargo 0003).
 *
 * GET /api/elections/governors?turno=1|2
 * Agrega os 27 arquivos oficiais de governador, extrai top-2 por UF e os
 * eleitos (`st` "Eleito…"; `e === 's'` também marca quem foi ao 2º turno).
 * No 2º turno, UFs sem segundo
 * turno são preenchidas com o resultado do 1T marcadas como `decidido1T`.
 * Mesmo SWR em arquivo das demais rotas (`/tmp/tse-cache` + snapshot).
 */
export const dynamic = 'force-dynamic'

import { after } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  pleitoGovernador,
  turnoSuffix,
  type Turno
} from '#/data/election'

function ctxFor(turno: Turno) {
  const eleicao = pleitoGovernador(turno)
  const sfx = turnoSuffix(turno)
  return {
    turno,
    eleicao,
    cargo: '0003',
    base: `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`,
    cacheFile: join(tmpdir(), 'tse-cache', `governors-${eleicao}-${sfx}.json`),
    staticFile: join(process.cwd(), 'public', 'maps', `tse-governadores-2026-${sfx}.json`)
  }
}

type Ctx = ReturnType<typeof ctxFor>

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')

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

type Candidate = {
  nmu: string
  sg: string
  n: string
  sq: string
  vap: number
  elected: boolean
}

function extractCandidates(data: unknown): Candidate[] {
  const d = data as {
    carg?: { agr?: { par?: { sg?: string; n?: string; cand?: Record<string, unknown>[] }[] }[] }[]
  }
  const list: Candidate[] = []
  for (const agr of d?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        list.push({
          nmu: String(c.nmu ?? c.nm ?? ''),
          sg: String(par?.sg ?? ''),
          n: String(par?.n ?? ''),
          sq: String(c.sqcand),
          vap: num(c.vap) ?? 0,
          // `e === 's'` vale p/ eleitos E p/ quem foi ao 2º turno;
          // só o `st` ("Eleito…") é autoritativo.
          elected: /^\s*eleit/i.test(String(c.st ?? ''))
        })
      }
    }
  }
  list.sort((a, b) => b.vap - a.vap)
  return list
}

type Payload = {
  meta: Record<string, unknown>
  ufs: Record<
    string,
    {
      elected: Candidate[]
      top: Candidate[]
      vv: number | null
      vb: number | null
      vn: number | null
      te: number | null
      abst: number | null
      hg: string | null
      sectionsPct: number | null
      decidido1T?: boolean
    }
  >
}

type CacheEntry = { at: number; payload: Payload }

async function readCache(ctx: Ctx): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(ctx.cacheFile, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.payload || typeof entry.at !== 'number') return null
    return entry
  } catch {
    return null
  }
}

/** Snapshot do build — sempre existe após `prebuild` bem-sucedido. */
async function readStatic(ctx: Ctx): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(ctx.staticFile, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.payload || typeof entry.at !== 'number') return null
    return entry
  } catch {
    return null
  }
}

async function writeCache(ctx: Ctx, entry: CacheEntry): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(ctx.cacheFile, JSON.stringify(entry))
}

/** Dedup por turno: 1 única revalidação em voo por turno. */
const inflight = new Map<Turno, Promise<CacheEntry>>()

function refresh(ctx: Ctx): Promise<CacheEntry> {
  const running = inflight.get(ctx.turno)
  if (running) return running
  const p = aggregate(ctx)
    .then(async (payload) => {
      const entry = { at: Date.now(), payload }
      await writeCache(ctx, entry).catch(() => {})
      return entry
    })
    .finally(() => {
      if (inflight.get(ctx.turno) === p) inflight.delete(ctx.turno)
    })
  inflight.set(ctx.turno, p)
  return p
}

async function aggregate(ctx: Ctx): Promise<Payload> {
  try {
    const files = await mapPool(UFS, CONCURRENCY, (uf) =>
      getJSONRetry(`${ctx.base}/dados/${uf}/${uf}-c${ctx.cargo}-e00${ctx.eleicao}-u.json`)
    )
    const ufs: Payload['ufs'] = {}
    UFS.forEach((uf, i) => {
      const r = files[i]
      if (!r.ok) return
      const d = r.value as {
        hg?: unknown
        s?: Record<string, unknown>
        v?: Record<string, unknown>
        e?: Record<string, unknown>
      }
      const all = extractCandidates(r.value)
      ufs[uf.toUpperCase()] = {
        elected: all.filter((c) => c.elected),
        top: all.slice(0, 2),
        vv: num(d?.v?.vv),
        vb: num(d?.v?.vb),
        vn: num(d?.v?.vn),
        te: num(d?.e?.te),
        abst: num(d?.e?.a),
        hg: typeof d?.hg === 'string' ? d.hg : null,
        sectionsPct: num(d?.s?.pst)
      }
    })
    if (ctx.turno === 2) {
      const ufs1T = await readBest1T().catch(
        () => ({}) as Payload['ufs']
      )
      for (const [uf, entry] of Object.entries(ufs1T)) {
        if (!ufs[uf] && entry) ufs[uf] = { ...entry, decidido1T: true }
      }
    }
    return {
      meta: {
        fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
        eleicao: ctx.eleicao,
        turno: ctx.turno,
        cargo: 'Governador',
        atualizadoEm: new Date().toISOString(),
        fotos: `${ctx.base}/fotos/{uf}/{sqcand}.jpeg`
      },
      ufs
    }
  } catch {
    throw new Error('Falha ao buscar TSE')
  }
}

/**
 * Melhor 1T disponível (cache runtime ou snapshot) para preencher UFs
 * decididas no 1º turno quando o payload é do 2T.
 */
async function readBest1T(): Promise<Payload['ufs']> {
  const ctx1 = ctxFor(1)
  const [tmp, statik] = await Promise.all([
    readCache(ctx1),
    readStatic(ctx1)
  ])
  const best =
    tmp && statik ? (tmp.at >= statik.at ? tmp : statik) : (tmp ?? statik)
  const ufs = best?.payload.ufs
  return ufs && typeof ufs === 'object' ? ufs : {}
}

export async function GET(request: Request) {
  const turno: Turno =
    new URL(request.url).searchParams.get('turno') === '2' ? 2 : 1
  const ctx = ctxFor(turno)
  const [tmp, statik] = await Promise.all([
    readCache(ctx),
    readStatic(ctx)
  ])
  const fresh = tmp && Date.now() - tmp.at < CACHE_TTL_MS ? tmp : null
  if (fresh) {
    return Response.json({ ...fresh.payload, meta: { ...fresh.payload.meta, cached: true } })
  }
  const best =
    tmp && statik ? (tmp.at >= statik.at ? tmp : statik) : (tmp ?? statik)
  if (best) {
    after(() => refresh(ctx).catch(() => {}))
    return Response.json({
      ...best.payload,
      meta: { ...best.payload.meta, cached: true, revalidating: true }
    })
  }
  try {
    const entry = await refresh(ctx)
    return Response.json({ ...entry.payload, meta: { ...entry.payload.meta, cached: false } })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

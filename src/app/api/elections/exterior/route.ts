/**
 * Voto no exterior AO VIVO — TSE 2026, Presidente.
 *
 * GET /api/elections/exterior?turno=1|2
 * Agrega os arquivos oficiais do TSE para a abrangência ZZ
 * (1 agregado + 186 cidades no exterior), compacta para top-2 por cidade
 * e responde em 1 único JSON. Mesma estratégia da rota municipalities:
 * stale-while-revalidate (cache runtime em /tmp + snapshot do build em
 * `public/maps/tse-exterior-2026-{1t,2t}.json`, com refresh em background
 * via `after()`).
 *
 * Coordenadas das cidades: `public/maps/exterior-cities.json`
 * (país + lon/lat por código TSE, curadoria a partir dos nomes oficiais).
 */
export const dynamic = 'force-dynamic'

import { after } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  pleitoPresidente,
  turnoSuffix,
  type Turno
} from '#/data/election'

function ctxFor(turno: Turno) {
  const eleicao = pleitoPresidente(turno)
  const sfx = turnoSuffix(turno)
  return {
    turno,
    eleicao,
    cargo: '0001',
    base: `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`,
    cacheFile: join(tmpdir(), 'tse-cache', `exterior-${eleicao}-${sfx}.json`),
    staticFile: join(process.cwd(), 'public', 'maps', `tse-exterior-2026-${sfx}.json`)
  }
}

type Ctx = ReturnType<typeof ctxFor>

const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')

const CONCURRENCY = 16
const UPSTREAM_TIMEOUT_MS = 15000

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

type Job = { tse: string; nome: string }

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

async function loadJobs(ctx: Ctx): Promise<Job[]> {
  const cm = (await getJSONRetry(
    `${ctx.base}/config/mun-e00${ctx.eleicao}-cm.json`
  )) as { abr?: { cd?: string; mu?: { cd?: string; nm?: string }[] }[] }
  const zz = (cm?.abr ?? []).find(
    (a) => String(a.cd ?? '').toLowerCase() === 'zz'
  )
  return (zz?.mu ?? []).map((mu) => ({
    tse: String(mu.cd ?? '').padStart(5, '0'),
    nome: mu.nm ?? ''
  }))
}

function extractTop(data: unknown, limit = 2) {
  const d = data as {
    carg?: { agr?: { par?: { sg?: string; n?: string; cand?: Record<string, unknown>[] }[] }[] }[]
  }
  const list: {
    sq: string
    nmu: string
    sg: string
    n: string
    vap: number
  }[] = []
  for (const agr of d?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        list.push({
          sq: String(c.sqcand),
          nmu: String(c.nmu ?? c.nm ?? ''),
          sg: String(par?.sg ?? ''),
          n: String(par?.n ?? ''),
          vap: num(c.vap) ?? 0
        })
      }
    }
  }
  list.sort((a, b) => b.vap - a.vap)
  return list.slice(0, limit)
}

function sectionsOf(data: unknown) {
  const d = data as {
    s?: Record<string, unknown>
    v?: Record<string, unknown>
    e?: Record<string, unknown>
  }
  const s = d?.s ?? {}
  return {
    ts: num(s.ts),
    st: num(s.st),
    pst: num(s.pst),
    vv: num(d?.v?.vv),
    vb: num(d?.v?.vb),
    vn: num(d?.v?.vn),
    te: num(d?.e?.te),
    a: num(d?.e?.a)
  }
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

type Payload = {
  meta: Record<string, unknown>
  total: unknown
  cidades: Record<string, { n: string; top: { sq: string; vap: number }[] } & Record<string, unknown>>
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

function contentHash(cidades: Payload['cidades']): string {
  let h = 2166136261
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  for (const code of Object.keys(cidades).sort()) {
    const t = cidades[code]?.top ?? []
    mix(code)
    mix(t[0]?.sq ?? '')
    mix(String(t[0]?.vap ?? 0))
    mix(t[1]?.sq ?? '')
    mix(String(t[1]?.vap ?? 0))
    mix(';')
  }
  return (h >>> 0).toString(16)
}

async function aggregate(ctx: Ctx): Promise<Payload> {
  try {
    const jobs = await loadJobs(ctx)

    const zzData = await getJSONRetry(
      `${ctx.base}/dados/zz/zz-c${ctx.cargo}-e00${ctx.eleicao}-u.json`
    )

    const cityFiles = await mapPool(jobs, CONCURRENCY, (j) =>
      getJSONRetry(
        `${ctx.base}/dados/zz/zz${j.tse}-c${ctx.cargo}-e00${ctx.eleicao}-u.json`
      )
    )

    const cidades: Payload['cidades'] = {}
    let falhas = 0
    cityFiles.forEach((r, i) => {
      if (!r.ok) {
        falhas++
        return
      }
      const j = jobs[i]
      cidades[j.tse] = {
        n: j.nome,
        ...(sectionsOf(r.value)),
        top: extractTop(r.value)
      } as Payload['cidades'][string]
    })

    return {
      meta: {
        fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
        eleicao: ctx.eleicao,
        turno: ctx.turno,
        cargo: 'Presidente',
        atualizadoEm: new Date().toISOString(),
        fotos: `${ctx.base}/fotos/br/{sqcand}.jpeg`,
        totalCidades: jobs.length,
        falhas,
        hash: contentHash(cidades)
      },
      total: { ...(sectionsOf(zzData)), top: extractTop(zzData) },
      cidades
    }
  } catch {
    throw new Error('Falha ao buscar TSE')
  }
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

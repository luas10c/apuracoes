/**
 * Municípios de UMA UF p/ governador AO VIVO — Eleições 2026 (pleito 6259,
 * cargo 0003).
 *
 * GET /api/elections/governor-municipalities?uf=rn&turno=1|2
 * Agrega sob demanda os arquivos municipais de uma UF (top-2 + seções por
 * município). Sem snapshot de build: só cache runtime em /tmp
 * (a seleção de estado é transitória e o volume por UF é pequeno).
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

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')
const CONCURRENCY = 24
const UPSTREAM_TIMEOUT_MS = 15000

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

type Job = { tse: string; ibge: string; nome: string }

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

async function loadJobs(
  base: string,
  eleicao: string,
  uf: string
): Promise<Job[]> {
  const cm = (await getJSONRetry(
    `${base}/config/mun-e00${eleicao}-cm.json`
  )) as { abr?: { cd?: string; mu?: { cd?: string; cdi?: string | number; nm?: string }[] }[] }
  const jobs: Job[] = []
  for (const abr of cm?.abr ?? []) {
    if (String(abr.cd ?? '').toLowerCase() !== uf) continue
    for (const mu of abr.mu ?? []) {
      jobs.push({
        tse: String(mu.cd ?? '').padStart(5, '0'),
        ibge: String(mu.cdi ?? ''),
        nome: mu.nm ?? ''
      })
    }
  }
  return jobs
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

export type GovMunCity = {
  tse: string
  n: string
  top: { sq: string; nmu: string; sg: string; n: string; vap: number }[]
  vv: number | null
  vb: number | null
  vn: number | null
  te: number | null
  a: number | null
  pst: number | null
  st: number | null
  ts: number | null
}

type Payload = {
  meta: Record<string, unknown>
  uf: string
  candidatos: Record<string, { nmu: string; sg: string; n: string }>
  cidades: Record<string, GovMunCity>
}

type CacheEntry = { at: number; payload: Payload }

function cacheFile(eleicao: string, sfx: string, uf: string) {
  return join(CACHE_DIR, `gov-mun-${eleicao}-${sfx}-${uf}.json`)
}

async function readCache(file: string): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(file, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.payload || typeof entry.at !== 'number') return null
    return entry
  } catch {
    return null
  }
}

/** Dedup por UF+turno: 1 única agregação em voo. */
const inflight = new Map<string, Promise<CacheEntry>>()

function refresh(
  eleicao: string,
  sfx: string,
  turno: Turno,
  uf: string
): Promise<CacheEntry> {
  const key = `${eleicao}-${sfx}-${uf}`
  const running = inflight.get(key)
  if (running) return running
  const p = aggregate(eleicao, turno, uf)
    .then(async (payload) => {
      const entry = { at: Date.now(), payload }
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(cacheFile(eleicao, sfx, uf), JSON.stringify(entry)).catch(
        () => {}
      )
      return entry
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

function contentHash(
  cidades: Record<string, GovMunCity>
): string {
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

async function aggregate(
  eleicao: string,
  turno: Turno,
  uf: string
): Promise<Payload> {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`
  const jobs = await loadJobs(base, eleicao, uf)
  const munFiles = await mapPool(jobs, CONCURRENCY, (j) =>
    getJSONRetry(
      `${base}/dados/${uf}/${uf}${j.tse}-c0003-e00${eleicao}-u.json`
    )
  )
  const cidades: Record<string, GovMunCity> = {}
  const candIdx: Record<string, { nmu: string; sg: string; n: string }> = {}
  let falhas = 0
  munFiles.forEach((r, i) => {
    if (!r.ok) {
      falhas++
      return
    }
    const j = jobs[i]
    const d = r.value as {
      s?: Record<string, unknown>
      v?: Record<string, unknown>
      e?: Record<string, unknown>
      carg?: { agr?: { par?: { sg?: string; n?: string; cand?: Record<string, unknown>[] }[] }[] }[]
    }
    const list: GovMunCity['top'] = []
    for (const agr of d?.carg?.[0]?.agr ?? []) {
      for (const par of agr?.par ?? []) {
        for (const c of par?.cand ?? []) {
          const sq = String(c.sqcand)
          list.push({
            sq,
            nmu: String(c.nmu ?? c.nm ?? ''),
            sg: String(par?.sg ?? ''),
            n: String(par?.n ?? ''),
            vap: num(c.vap) ?? 0
          })
          candIdx[sq] = {
            nmu: String(c.nmu ?? c.nm ?? ''),
            sg: String(par?.sg ?? ''),
            n: String(par?.n ?? '')
          }
        }
      }
    }
    list.sort((a, b) => b.vap - a.vap)
    cidades[j.ibge] = {
      tse: j.tse,
      n: j.nome,
      top: list.slice(0, 2),
      vv: num(d?.v?.vv),
      vb: num(d?.v?.vb),
      vn: num(d?.v?.vn),
      te: num(d?.e?.te),
      a: num(d?.e?.a),
      pst: num(d?.s?.pst),
      st: num(d?.s?.st),
      ts: num(d?.s?.ts)
    }
  })
  return {
    meta: {
      fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
      eleicao,
      turno,
      cargo: 'Governador',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/${uf}/{sqcand}.jpeg`,
      falhas,
      hash: contentHash(cidades)
    },
    uf: uf.toUpperCase(),
    candidatos: candIdx,
    cidades
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const uf = (params.get('uf') ?? '').toLowerCase()
  const turno: Turno = params.get('turno') === '2' ? 2 : 1
  if (!UFS.includes(uf)) {
    return Response.json({ error: 'Parâmetro uf inválido' }, { status: 400 })
  }
  const eleicao = pleitoGovernador(turno)
  const sfx = turnoSuffix(turno)
  const tmp = await readCache(cacheFile(eleicao, sfx, uf))
  const fresh = tmp && Date.now() - tmp.at < CACHE_TTL_MS ? tmp : null
  if (fresh) {
    return Response.json({ ...fresh.payload, meta: { ...fresh.payload.meta, cached: true } })
  }
  if (tmp) {
    after(() => refresh(eleicao, sfx, turno, uf).catch(() => {}))
    return Response.json({
      ...tmp.payload,
      meta: { ...tmp.payload.meta, cached: true, revalidating: true }
    })
  }
  try {
    const entry = await refresh(eleicao, sfx, turno, uf)
    return Response.json({ ...entry.payload, meta: { ...entry.payload.meta, cached: false } })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

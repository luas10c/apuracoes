/**
 * Agregado AO VIVO do TSE — Eleições 2026, 1º turno, Presidente (pleito 6257).
 *
 * GET /api/elections/municipalities
 * O servidor busca os arquivos oficiais em resultados.tse.jus.br
 * (agregado nacional + 27 UFs + 5.571 municípios), compacta para top-2 por
 * localidade e responde em 1 único JSON.
 *
 * Estratégia (stale-while-revalidate):
 * - Em produção (disco somente-leitura) o cache de runtime vive em
 *   `/tmp/tse-cache` e um snapshot gerado no build
 *   (`public/maps/tse-2026-1t-presidente.json`, via `npm run prebuild`)
 *   garante primeira resposta instantânea.
 * - Cache fresco (< CACHE_TTL_MS): resposta imediata, sem tocar no TSE.
 * - Cache velho/estático: responde na hora e revalida em background
 *   (via `after()`, que sobrevive ao fim da resposta no serverless).
 * - `meta.hash` muda só quando os votos mudam → o client só re-renderiza
 *   se houver dado novo de verdade.
 *
 * Esquema de URLs oficiais (extraído do app do TSE):
 * - config:  ele2026/6257/config/mun-e006257-cm.json (códigos TSE↔IBGE)
 * - agregado: ele2026/6257/dados/{uf}/{uf}{cdMun5}-c0001-e006257-u.json
 */
export const dynamic = 'force-dynamic'

import { after } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELEICAO = '6257'
const CARGO = '0001'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

/** Janela em que o .json é servido sem tocar no TSE. */
const CACHE_TTL_MS = 120_000
const CACHE_DIR = join(tmpdir(), 'tse-cache')
const CACHE_FILE = join(CACHE_DIR, `municipalities-${ELEICAO}-1t.json`)
/** Snapshot gerado no build (`npm run prebuild`) — fallback instantâneo. */
const STATIC_FILE = join(
  process.cwd(),
  'public',
  'maps',
  `tse-2026-1t-presidente.json`
)

const CONCURRENCY = 24
const UPSTREAM_TIMEOUT_MS = 15000

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

type Job = { uf: string; tse: string; ibge: string; nome: string }

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

async function loadJobs(): Promise<Job[]> {
  const cm = (await getJSONRetry(
    `${BASE}/config/mun-e00${ELEICAO}-cm.json`
  )) as { abr?: { cd?: string; mu?: { cd?: string; cdi?: string | number; nm?: string }[] }[] }
  const jobs: Job[] = []
  for (const abr of cm?.abr ?? []) {
    const uf = String(abr.cd ?? '').toLowerCase()
    if (!UFS.includes(uf)) continue
    for (const mu of abr.mu ?? []) {
      jobs.push({
        uf,
        tse: String(mu.cd ?? '').padStart(5, '0'),
        ibge: String(mu.cdi ?? ''),
        nome: mu.nm ?? ''
      })
    }
  }
  return jobs
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

/** Lista completa e compacta [[sq, vap], ...] para calor por candidato. */
function extractAll(data: unknown): [string, number][] {
  return extractTop(data, Number.MAX_SAFE_INTEGER).map((c) => [c.sq, c.vap])
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

export async function GET() {
  const [tmp, statik] = await Promise.all([readCache(), readStatic()])
  const fresh =
    tmp && Date.now() - tmp.at < CACHE_TTL_MS ? tmp : null
  if (fresh) {
    return Response.json({ ...fresh.payload, meta: { ...fresh.payload.meta, cached: true } })
  }
  // Melhor disponível (tmp velho ou snapshot do build): responde na hora
  // e revalida em background — nunca prende a requisição na agregação fria.
  const best =
    tmp && statik ? (tmp.at >= statik.at ? tmp : statik) : (tmp ?? statik)
  if (best) {
    after(() => refresh().catch(() => {}))
    return Response.json({
      ...best.payload,
      meta: { ...best.payload.meta, cached: true, revalidating: true }
    })
  }
  // Último recurso (sem nenhum arquivo): aguarda a agregação.
  try {
    const entry = await refresh()
    return Response.json({ ...entry.payload, meta: { ...entry.payload.meta, cached: false } })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

type Payload = {
  meta: Record<string, unknown>
  nacional: unknown
  candidatos: Record<string, unknown>
  ufs: Record<string, unknown>
  cidades: Record<string, { top: { sq: string; vap: number }[] }>
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

/** Hash do conteúdo (votos): só muda se a apuração andar de verdade. */
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

async function aggregate(): Promise<Payload> {
  try {
    const jobs = await loadJobs()

    const brData = await getJSONRetry(
      `${BASE}/dados/br/br-c${CARGO}-e00${ELEICAO}-u.json`
    )

    const ufFiles = await mapPool(UFS, CONCURRENCY, (uf) =>
      getJSONRetry(`${BASE}/dados/${uf}/${uf}-c${CARGO}-e00${ELEICAO}-u.json`)
    )

    const ufs: Record<string, unknown> = {}
    UFS.forEach((uf, i) => {
      const r = ufFiles[i]
      if (!r.ok) return
      ufs[uf.toUpperCase()] = { ...(sectionsOf(r.value)), top: extractTop(r.value) }
    })

    // Registro global de candidatos (nomes/partidos) + ranking nacional full.
    const brFull = extractTop(brData, Number.MAX_SAFE_INTEGER)
    const candidatos: Record<string, unknown> = {}
    for (const c of brFull) {
      candidatos[c.sq] = { nmu: c.nmu, sg: c.sg, n: c.n }
    }

    const munFiles = await mapPool(jobs, CONCURRENCY, (j) =>
      getJSONRetry(
        `${BASE}/dados/${j.uf}/${j.uf}${j.tse}-c${CARGO}-e00${ELEICAO}-u.json`
      )
    )

    const cidades: Payload['cidades'] = {}
    let falhas = 0
    munFiles.forEach((r, i) => {
      if (!r.ok) {
        falhas++
        return
      }
      const j = jobs[i]
      cidades[j.ibge] = {
        tse: j.tse,
        n: j.nome,
        uf: j.uf.toUpperCase(),
        ...(sectionsOf(r.value)),
        top: extractTop(r.value),
        all: extractAll(r.value)
      } as Payload['cidades'][string]
    })

    return {
      meta: {
        fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
        eleicao: ELEICAO,
        turno: 1,
        cargo: 'Presidente',
        atualizadoEm: new Date().toISOString(),
        fotos: `${BASE}/fotos/br/{sqcand}.jpeg`,
        totalMunicipios: jobs.length,
        falhas,
        hash: contentHash(cidades)
      },
      nacional: {
        ...(sectionsOf(brData)),
        top: extractTop(brData),
        full: brFull.map((c) => ({ sq: c.sq, vap: c.vap }))
      },
      candidatos,
      ufs,
      cidades
    }
  } catch {
    throw new Error('Falha ao buscar TSE')
  }
}

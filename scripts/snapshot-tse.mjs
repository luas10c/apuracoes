/**
 * Snapshot build-time dos agregados TSE — Eleições 2026, 1º turno, Presidente.
 *
 * Roda no `prebuild` (nunca quebra o deploy: em falha, mantém os arquivos
 * anteriores e sai com código 0). Gera, no MESMO formato das rotas
 * `/api/elections/municipalities` e `/api/elections/exterior`:
 * - public/maps/tse-2026-1t-presidente.json (nacional + 27 UFs + municípios)
 * - public/maps/tse-exterior-2026-1t.json (total ZZ + 186 cidades)
 *
 * Por que existe, se os dados são ao vivo? Em serverless (Vercel) o disco é
 * somente-leitura (só /tmp grava) e functions têm timeout curto — a
 * agregação fria de ~5,6k arquivos nunca terminaria a tempo. O snapshot
 * garante primeira resposta instantânea; as rotas revalidam em background
 * (stale-while-revalidate em /tmp) e o client só re-renderiza se
 * `meta.hash` mudar.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_BR = join(ROOT, 'public', 'maps', 'tse-2026-1t-presidente.json')
const OUT_ZZ = join(ROOT, 'public', 'maps', 'tse-exterior-2026-1t.json')

const ELEICAO = '6257'
const CARGO = '0001'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`

const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc',
  'sp', 'se', 'to'
]

const CONCURRENCY = 24
const UPSTREAM_TIMEOUT_MS = 15000

const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function getJSON(url) {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { 'User-Agent': 'apuracoes/1.0 (+snapshot ele2026)' }
  })
  if (!res.ok) throw new Error(`TSE respondeu ${res.status}`)
  return res.json()
}

async function getJSONRetry(url, retries = 2) {
  let lastErr = null
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

async function mapPool(items, size, fn) {
  const out = new Array(items.length)
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

function extractTop(data, limit = 2) {
  const list = []
  for (const agr of data?.carg?.[0]?.agr ?? []) {
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

function extractAll(data) {
  return extractTop(data, Number.MAX_SAFE_INTEGER).map((c) => [c.sq, c.vap])
}

function sectionsOf(data) {
  const s = data?.s ?? {}
  return { ts: num(s.ts), st: num(s.st), pst: num(s.pst), vv: num(data?.v?.vv), vb: num(data?.v?.vb), vn: num(data?.v?.vn), te: num(data?.e?.te), a: num(data?.e?.a) }
}

function contentHash(cidades) {
  let h = 2166136261
  const mix = (s) => {
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

async function aggregateBrasil() {
  const cm = await getJSONRetry(`${BASE}/config/mun-e00${ELEICAO}-cm.json`)
  const jobs = []
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
  const brData = await getJSONRetry(
    `${BASE}/dados/br/br-c${CARGO}-e00${ELEICAO}-u.json`
  )
  const brFull = extractTop(brData, Number.MAX_SAFE_INTEGER)
  const candidatos = {}
  for (const c of brFull) {
    candidatos[c.sq] = { nmu: c.nmu, sg: c.sg, n: c.n }
  }
  const ufFiles = await mapPool(UFS, CONCURRENCY, (uf) =>
    getJSONRetry(`${BASE}/dados/${uf}/${uf}-c${CARGO}-e00${ELEICAO}-u.json`)
  )
  const ufs = {}
  UFS.forEach((uf, i) => {
    const r = ufFiles[i]
    if (!r.ok) return
    ufs[uf.toUpperCase()] = { ...sectionsOf(r.value), top: extractTop(r.value) }
  })
  const munFiles = await mapPool(jobs, CONCURRENCY, (j) =>
    getJSONRetry(
      `${BASE}/dados/${j.uf}/${j.uf}${j.tse}-c${CARGO}-e00${ELEICAO}-u.json`
    )
  )
  const cidades = {}
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
      ...sectionsOf(r.value),
      top: extractTop(r.value),
      all: extractAll(r.value)
    }
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
      ...sectionsOf(brData),
      top: extractTop(brData),
      full: brFull.map((c) => ({ sq: c.sq, vap: c.vap }))
    },
    candidatos,
    ufs,
    cidades
  }
}

async function aggregateExterior() {
  const cm = await getJSONRetry(`${BASE}/config/mun-e00${ELEICAO}-cm.json`)
  const zz = (cm?.abr ?? []).find(
    (a) => String(a.cd ?? '').toLowerCase() === 'zz'
  )
  const jobs = (zz?.mu ?? []).map((mu) => ({
    tse: String(mu.cd ?? '').padStart(5, '0'),
    nome: mu.nm ?? ''
  }))
  const zzData = await getJSONRetry(
    `${BASE}/dados/zz/zz-c${CARGO}-e00${ELEICAO}-u.json`
  )
  const cityFiles = await mapPool(jobs, 16, (j) =>
    getJSONRetry(
      `${BASE}/dados/zz/zz${j.tse}-c${CARGO}-e00${ELEICAO}-u.json`
    )
  )
  const cidades = {}
  let falhas = 0
  cityFiles.forEach((r, i) => {
    if (!r.ok) {
      falhas++
      return
    }
    const j = jobs[i]
    cidades[j.tse] = {
      n: j.nome,
      ...sectionsOf(r.value),
      top: extractTop(r.value)
    }
  })
  return {
    meta: {
      fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
      eleicao: ELEICAO,
      turno: 1,
      cargo: 'Presidente',
      atualizadoEm: new Date().toISOString(),
      fotos: `${BASE}/fotos/br/{sqcand}.jpeg`,
      totalCidades: jobs.length,
      falhas,
      hash: contentHash(cidades)
    },
    total: { ...sectionsOf(zzData), top: extractTop(zzData) },
    cidades
  }
}

async function writeEnvelope(path, payload) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ at: Date.now(), payload }))
}

async function main() {
  const started = Date.now()
  try {
    console.log('[snapshot] agregando Brasil…')
    const br = await aggregateBrasil()
    await writeEnvelope(OUT_BR, br)
    console.log(
      `[snapshot] Brasil: ${Object.keys(br.cidades).length} cidades, ${br.meta.falhas} falhas`
    )
    console.log('[snapshot] agregando exterior…')
    const zz = await aggregateExterior()
    await writeEnvelope(OUT_ZZ, zz)
    console.log(
      `[snapshot] exterior: ${Object.keys(zz.cidades).length} cidades, ${zz.meta.falhas} falhas`
    )
    console.log(`[snapshot] OK em ${Math.round((Date.now() - started) / 1000)}s`)
  } catch (err) {
    // Best-effort: nunca quebra o deploy; rotas usam o snapshot anterior.
    console.error('[snapshot] falhou (deploy segue):', err?.message ?? err)
  }
}

main()

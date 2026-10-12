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
const OUT_BR_2T = join(ROOT, 'public', 'maps', 'tse-2026-2t-presidente.json')
const OUT_ZZ = join(ROOT, 'public', 'maps', 'tse-exterior-2026-1t.json')
const OUT_ZZ_2T = join(ROOT, 'public', 'maps', 'tse-exterior-2026-2t.json')
const OUT_SEN = join(ROOT, 'public', 'maps', 'tse-senadores-2026-1t.json')
const OUT_GOV = join(ROOT, 'public', 'maps', 'tse-governadores-2026-1t.json')
const OUT_GOV_2T = join(ROOT, 'public', 'maps', 'tse-governadores-2026-2t.json')
const OUT_DEP = join(ROOT, 'public', 'maps', 'tse-deputados-2026-1t.json')

const ELEICAO = '6257'
const CARGO = '0001'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`
// TODO(2T): trocar pelo pleito do 2º turno quando o TSE publicar.
const ELEICAO_2T = '6257'

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
  return { ts: num(s.ts), st: num(s.st), pst: num(s.pst), vv: num(data?.v?.vv), vb: num(data?.v?.vb), vn: num(data?.v?.vn), tv: num(data?.v?.tv), te: num(data?.e?.te), a: num(data?.e?.a) }
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

async function aggregateBrasil(eleicao = ELEICAO, turno = 1) {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`
  const cm = await getJSONRetry(`${base}/config/mun-e00${eleicao}-cm.json`)
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
    `${base}/dados/br/br-c${CARGO}-e00${eleicao}-u.json`
  )
  const brFull = extractTop(brData, Number.MAX_SAFE_INTEGER)
  const candidatos = {}
  for (const c of brFull) {
    candidatos[c.sq] = { nmu: c.nmu, sg: c.sg, n: c.n }
  }
  const ufFiles = await mapPool(UFS, CONCURRENCY, (uf) =>
    getJSONRetry(`${base}/dados/${uf}/${uf}-c${CARGO}-e00${eleicao}-u.json`)
  )
  const ufs = {}
  UFS.forEach((uf, i) => {
    const r = ufFiles[i]
    if (!r.ok) return
    ufs[uf.toUpperCase()] = { ...sectionsOf(r.value), top: extractTop(r.value) }
  })
  const munFiles = await mapPool(jobs, CONCURRENCY, (j) =>
    getJSONRetry(
      `${base}/dados/${j.uf}/${j.uf}${j.tse}-c${CARGO}-e00${eleicao}-u.json`
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
      eleicao,
      turno,
      cargo: 'Presidente',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/br/{sqcand}.jpeg`,
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

async function aggregateExterior(eleicao = ELEICAO, turno = 1) {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`
  const cm = await getJSONRetry(`${base}/config/mun-e00${eleicao}-cm.json`)
  const zz = (cm?.abr ?? []).find(
    (a) => String(a.cd ?? '').toLowerCase() === 'zz'
  )
  const jobs = (zz?.mu ?? []).map((mu) => ({
    tse: String(mu.cd ?? '').padStart(5, '0'),
    nome: mu.nm ?? ''
  }))
  const zzData = await getJSONRetry(
    `${base}/dados/zz/zz-c${CARGO}-e00${eleicao}-u.json`
  )
  const cityFiles = await mapPool(jobs, 16, (j) =>
    getJSONRetry(
      `${base}/dados/zz/zz${j.tse}-c${CARGO}-e00${eleicao}-u.json`
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
      eleicao,
      turno,
      cargo: 'Presidente',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/br/{sqcand}.jpeg`,
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

function extractElected(data) {
  const list = []
  for (const agr of data?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        const elected =
          /^\s*eleit/i.test(String(c.st ?? ''))
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

async function aggregateSenators() {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/6259`
  const files = await mapPool(UFS, 12, (uf) =>
    getJSONRetry(`${base}/dados/${uf}/${uf}-c0005-e006259-u.json`)
  )
  const ufs = {}
  files.forEach((r, i) => {
    if (!r.ok) return
    const uf = UFS[i].toUpperCase()
    ufs[uf] = {
      elected: extractElected(r.value),
      top: extractGovCandidates(r.value).slice(0, 2).map(({ elected: _e, ...rest }) => rest),
      vv: num(r.value?.v?.vv),
      hg: typeof r.value?.hg === 'string' ? r.value.hg : null,
      sectionsPct: num(r.value?.s?.pst)
    }
  })
  return {
    meta: {
      fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
      eleicao: '6259',
      turno: 1,
      cargo: 'Senador',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/{uf}/{sqcand}.jpeg`
    },
    ufs
  }
}

function extractGovCandidates(data) {
  const list = []
  for (const agr of data?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) {
      for (const c of par?.cand ?? []) {
        list.push({
          nmu: String(c.nmu ?? c.nm ?? ''),
          sg: String(par?.sg ?? ''),
          n: String(par?.n ?? ''),
          sq: String(c.sqcand),
          vap: num(c.vap) ?? 0,
          elected: /^\s*eleit/i.test(String(c.st ?? ''))
        })
      }
    }
  }
  list.sort((a, b) => b.vap - a.vap)
  return list
}

async function aggregateGovernors(eleicao = '6259', turno = 1) {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/${eleicao}`
  const files = await mapPool(UFS, 12, (uf) =>
    getJSONRetry(`${base}/dados/${uf}/${uf}-c0003-e00${eleicao}-u.json`)
  )
  const ufs = {}
  files.forEach((r, i) => {
    if (!r.ok) return
    const uf = UFS[i].toUpperCase()
    const all = extractGovCandidates(r.value)
    ufs[uf] = {
      elected: all.filter((c) => c.elected),
      top: all.slice(0, 2),
      vv: num(r.value?.v?.vv),
      vb: num(r.value?.v?.vb),
      vn: num(r.value?.v?.vn),
      te: num(r.value?.e?.te),
      abst: num(r.value?.e?.a),
      hg: typeof r.value?.hg === 'string' ? r.value.hg : null,
      sectionsPct: num(r.value?.s?.pst)
    }
  })
  return {
    meta: {
      fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
      eleicao,
      turno,
      cargo: 'Governador',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/{uf}/{sqcand}.jpeg`
    },
    ufs
  }
}

const VAGAS_FEDERAL = {
  AC: 8, AL: 9, AP: 8, AM: 8, BA: 39, CE: 22, DF: 8, ES: 10, GO: 17,
  MA: 18, MT: 8, MS: 8, MG: 53, PA: 17, PB: 12, PR: 30, PE: 25, PI: 10,
  RJ: 46, RN: 8, RS: 31, RO: 8, RR: 8, SC: 16, SP: 70, SE: 8, TO: 8
}

async function aggregateDeputiesCargo(cargo, withVagas) {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/6259`
  const files = await mapPool(UFS, 12, (uf) =>
    getJSONRetry(`${base}/dados/${uf}/${uf}-c${cargo}-e006259-u.json`)
  )
  const ufs = {}
  const partySeats = new Map()
  const all = []
  let totalCandidatos = 0
  files.forEach((r, i) => {
    if (!r.ok) return
    const UF = UFS[i].toUpperCase()
    const cands = extractGovCandidates(r.value).map((c) => ({ ...c, uf: UF }))
    totalCandidatos += cands.length
    const elected = cands.filter((c) => c.elected)
    const seats = new Map()
    for (const c of elected) {
      seats.set(c.sg, (seats.get(c.sg) ?? 0) + 1)
      partySeats.set(c.sg, (partySeats.get(c.sg) ?? 0) + 1)
    }
    ufs[UF] = {
      seats: [...seats.entries()]
        .map(([sg, eleitos]) => ({ sg, eleitos }))
        .sort((a, b) => b.eleitos - a.eleitos),
      top: cands.slice(0, 10),
      totalEleitos: elected.length,
      totalCandidatos: cands.length,
      vv: num(r.value?.v?.vv),
      sectionsPct: num(r.value?.s?.pst)
    }
    all.push(...cands)
  })
  all.sort((a, b) => b.vap - a.vap)
  return {
    vagas: withVagas
      ? Object.values(VAGAS_FEDERAL).reduce((s, v) => s + v, 0)
      : null,
    totalEleitos: [...partySeats.values()].reduce((s, v) => s + v, 0),
    totalCandidatos,
    partidos: [...partySeats.entries()]
      .map(([sg, eleitos]) => ({ sg, eleitos }))
      .sort((a, b) => b.eleitos - a.eleitos),
    ufs,
    ranking: all.slice(0, 50)
  }
}

async function aggregateDeputies() {
  const base = `https://resultados.tse.jus.br/oficial/ele2026/6259`
  const [federal, estadual] = await Promise.all([
    aggregateDeputiesCargo('0006', true),
    aggregateDeputiesCargo('0007', false)
  ])
  return {
    meta: {
      fonte: 'Tribunal Superior Eleitoral — resultados.tse.jus.br',
      eleicao: '6259',
      turno: 1,
      cargo: 'Deputados',
      atualizadoEm: new Date().toISOString(),
      fotos: `${base}/fotos/{uf}/{sqcand}.jpeg`
    },
    federal,
    estadual
  }
}

async function main() {
  const started = Date.now()
  const step = async (label, fn) => {
    try {
      console.log(`[snapshot] ${label}…`)
      await fn()
    } catch (err) {
      // Best-effort por etapa: uma falha (ex.: 2T ainda não publicado)
      // nunca quebra o deploy nem os demais snapshots.
      console.error(`[snapshot] ${label} falhou (segue):`, err?.message ?? err)
    }
  }
  await step('agregando Brasil 1T', async () => {
    const br = await aggregateBrasil()
    await writeEnvelope(OUT_BR, br)
    console.log(
      `[snapshot] Brasil: ${Object.keys(br.cidades).length} cidades, ${br.meta.falhas} falhas`
    )
  })
  await step('agregando Brasil 2T', async () => {
    const br = await aggregateBrasil(ELEICAO_2T, 2)
    await writeEnvelope(OUT_BR_2T, br)
    console.log(
      `[snapshot] Brasil 2T: ${Object.keys(br.cidades).length} cidades, ${br.meta.falhas} falhas`
    )
  })
  await step('agregando exterior 1T', async () => {
    const zz = await aggregateExterior()
    await writeEnvelope(OUT_ZZ, zz)
    console.log(
      `[snapshot] exterior: ${Object.keys(zz.cidades).length} cidades, ${zz.meta.falhas} falhas`
    )
  })
  await step('agregando exterior 2T', async () => {
    const zz = await aggregateExterior(ELEICAO_2T, 2)
    await writeEnvelope(OUT_ZZ_2T, zz)
    console.log(
      `[snapshot] exterior 2T: ${Object.keys(zz.cidades).length} cidades, ${zz.meta.falhas} falhas`
    )
  })
  await step('agregando senadores', async () => {
    const sen = await aggregateSenators()
    await writeEnvelope(OUT_SEN, sen)
    console.log(
      `[snapshot] senadores: ${Object.keys(sen.ufs).length} UFs`
    )
  })
  await step('agregando governadores 1T', async () => {
    const gov = await aggregateGovernors()
    await writeEnvelope(OUT_GOV, gov)
    console.log(
      `[snapshot] governadores: ${Object.keys(gov.ufs).length} UFs`
    )
  })
  await step('agregando governadores 2T', async () => {
    const gov = await aggregateGovernors('6259', 2)
    await writeEnvelope(OUT_GOV_2T, gov)
    console.log(
      `[snapshot] governadores 2T: ${Object.keys(gov.ufs).length} UFs`
    )
  })
  await step('agregando deputados', async () => {
    const dep = await aggregateDeputies()
    await writeEnvelope(OUT_DEP, dep)
    console.log(
      `[snapshot] deputados: ${dep.federal.totalEleitos} federais, ${dep.estadual.totalEleitos} estaduais`
    )
  })
  console.log(`[snapshot] OK em ${Math.round((Date.now() - started) / 1000)}s`)
}

main()

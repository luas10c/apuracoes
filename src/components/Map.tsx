'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { motion } from 'motion/react'
import { cn } from 'tailwind-variants'

import { Popover } from './Popover'
import { PARTIES, partyColor, partyShade, partyVivid, winnerColor, WINNER_COLORS, WINNER_COLORS_LIGHT, tintWithWhite } from '#/data/parties'
import { turnoLabel, type Turno } from '#/data/election'

type LonLat = [number, number]

type GeoGeometry =
  | { type: 'Polygon'; coordinates: LonLat[][] }
  | { type: 'MultiPolygon'; coordinates: LonLat[][][] }

type StateFeature = {
  type: 'Feature'
  properties: { codigo: string; sigla: string; nome: string }
  geometry: GeoGeometry
}

type MunFeature = {
  type: 'Feature'
  properties: { codarea: string }
  geometry: GeoGeometry
}

type WorldFeature = {
  type: 'Feature'
  properties: { name: string }
  geometry: GeoGeometry
}

export type MapMode = 'brasil' | 'exterior'

export type ExteriorCityResult = {
  n: string
  ts: number | null
  st: number | null
  pst: number | null
  vv: number | null
  vb: number | null
  vn: number | null
  te: number | null
  a: number | null
  top: TseCandidate[]
}

export type ExteriorSnapshot = {
  meta: {
    fonte: string
    eleicao: string
    turno: number
    cargo: string
    atualizadoEm: string
    fotos: string
    totalCidades: number
    falhas: number
    hash: string
    cached?: boolean
    revalidating?: boolean
  }
  total: TsePlace
  cidades: Record<string, ExteriorCityResult>
}

export type ExteriorPlace = {
  tse: string
  name: string
  country: string
  lon: number
  lat: number
}

type Winner = 'flavio' | 'lula' | 'outro'

/** Dados municipais de outra apuração (ex.: governador) p/ a camada de municípios. */
export type MunicipalChoropleth = {
  uf: string
  fotos: string
  candidatos: Record<string, { nmu: string; sg: string; n: string }>
  cidades: Record<
    string,
    {
      tse: string
      n: string
      top: { sq: string; vap: number }[]
      vv: number | null
      vb: number | null
      vn: number | null
      te: number | null
      a: number | null
      pst: number | null
      st: number | null
      ts: number | null
    }
  >
}

export type MapProps = {
  selected?: string | null
  onSelect?: (selection: string | null) => void
  /** Fornecido = controlado (compartilha 1 fetch); omitido = busca interna. */
  results?: TseSnapshot | null
  mode?: MapMode
  /** Turno da apuração (1 ou 2). Afeta fetches internos e rótulos. */
  turno?: Turno
  exterior?: ExteriorSnapshot | null
  onModeChange?: (mode: MapMode) => void
  mapView?: MapView
  candidateSq?: string | null
  className?: string
  /** Filtros de view (barra acima do mapa, no lugar das abas Brasil/Exterior). */
  filters?: ReactNode
  /** Pintura por UF p/ outras apurações (ex.: Senado): desliga o popover. */
  choropleth?: {
    fills: Record<string, string>
    soft?: string[]
    split?: Record<string, [string, string]>
    photos?: Record<string, string[]>
    labels?: Record<string, string>
    legend?: ReactNode
  } | null
  suppressPopover?: boolean
  /** Popover custom por UF (ex.: senadores eleitos). Substitui o padrão. */
  statePopover?: ((sigla: string) => ReactNode) | null
  /**
   * Choropleth municipal alternativo (ex.: governador por município).
   * Quando presente, os municípios da UF usam estes dados (cor do partido
   * com variação por margem) em vez do snapshot presidencial.
   */
  municipalChoropleth?: MunicipalChoropleth | null
}

type HoverState = {
  code: string
  uf: string
  x: number
  y: number
}

export type TseCandidate = {
  sq: string
  nmu: string
  sg: string
  n: string
  vap: number
}

export type TseSections = {
  ts: number | null
  st: number | null
  pst: number | null
  vv: number | null
  vb: number | null
  vn: number | null
  tv: number | null
  te: number | null
  a: number | null
}

export type TsePlace = TseSections & {
  top: TseCandidate[]
}

export type TseCity = TsePlace & {
  tse: string
  n: string
  uf: string
    all?: [string, number][]
}

export type TseSnapshot = {
  meta: {
    fonte: string
    eleicao: string
    turno: number
    cargo: string
    atualizadoEm: string
    fotos: string
    totalMunicipios: number
    falhas: number
    hash: string
    cached?: boolean
    revalidating?: boolean
  }
  nacional: TsePlace & { full?: { sq: string; vap: number }[] }
    candidatos?: Record<string, { nmu: string; sg: string; n: string }>
  ufs: Record<string, TsePlace>
  cidades: Record<string, TseCity>
}

export type MapView = 'municipios' | 'estados' | 'vantagem' | 'apurado' | 'candidato'

/** Agregado live servido pela rota /api/elections/municipalities. Sem cache: busca fresco no TSE a cada montagem. */
function loadResults(turno: Turno): Promise<TseSnapshot | null> {
  return fetch(`/api/elections/municipalities?turno=${turno}`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((d) => d as TseSnapshot)
    .catch(() => null)
}

/** Snapshot 2022 (TSE dados abertos, processado 1x): top-2 por localidade. */
export type PastTopCandidate = {
  nmu: string
  sg: string
  n: string
  vap: number
  pct: number
}

export type PastSnapshot = {
  meta: { fonte: string; ano: number; turno: number; cargo: string }
  cidades: Record<string, { top: PastTopCandidate[] }>
  ufs: Record<string, { top: PastTopCandidate[]; vv?: number | null }>
  exterior?: Record<string, { top: PastTopCandidate[]; vv: number }>
}

let pastPromise: Promise<PastSnapshot | null> | null = null

function loadPast(): Promise<PastSnapshot | null> {
  if (!pastPromise) {
    pastPromise = fetch('/maps/ele2022-1t-presidente-top2.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => d as PastSnapshot)
      .catch(() => null)
  }
  return pastPromise
}

function share(vap: number, vv: number | null): number {
  if (!vv || vv <= 0) return 0
  return Math.round((vap / vv) * 1000) / 10
}

function winnerOf(
  sq: string,
  firstSq: string | undefined,
  secondSq: string | undefined
): Winner {
  if (firstSq && sq === firstSq) return 'flavio'
  if (secondSq && sq === secondSq) return 'lula'
  return 'outro'
}

/** Cor ancorada na sigla (fora do Brasil o ranking muda de ordem). */
function winnerByParty(sg: string): Winner {
  if (sg === 'PL') return 'flavio'
  if (sg === 'PT') return 'lula'
  return 'outro'
}

const SIDE_UFS = ['RN', 'PB', 'PE', 'AL', 'SE', 'DF', 'ES', 'RJ'] as const

/** Layout vertical das badges laterais: NE junto, respiro antes do Sudeste. */
const BADGE_NE_TOP = 140
const BADGE_NE_GAP = 40
const BADGE_SE_TOP = 384
const BADGE_SE_GAP = 40
const badgeY = (i: number) =>
  i < 5 ? BADGE_NE_TOP + i * BADGE_NE_GAP : BADGE_SE_TOP + (i - 5) * BADGE_SE_GAP
const GLOBE_Y = BADGE_SE_TOP + (SIDE_UFS.length - 5) * BADGE_SE_GAP + 44

const VIEW_W = 1000
const VIEW_H = 700
const MAP_W = 730
const MAP_H = 660
const MAP_PAD = 12

export type MapViewTransform = {
  scale: number
  tx: number
  ty: number
}

export const IDENTITY_VIEW: MapViewTransform = { scale: 1, tx: 0, ty: 0 }

type ProjectionParams = {
  minLon: number
  minLat: number
  maxLat: number
  k: number
  xOff: number
  yOff: number
  cosLat: number
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Bbox de um path SVG no espaço do viewBox. Usado para detectar
 * municípios pequenos demais para o contorno branco de realce: o traço
 * interno (2–2,4px fixos na tela) cobriria o polígono inteiro e viraria
 * um "ponto branco" em vez de contorno.
 */
function pathBBox(d: string): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} | null {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const re = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  let found = false
  while ((m = re.exec(d)) !== null) {
    const x = Number(m[1])
    const y = Number(m[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    found = true
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!found) return null
  return { minX, maxX, minY, maxY }
}

/** Menor dimensão em tela (px) abaixo da qual o realce vira um ponto. */
const HIGHLIGHT_DOT_PX = 8

function projectLonLat(
  p: ProjectionParams,
  lon: number,
  lat: number,
  view: MapViewTransform = IDENTITY_VIEW
): [number, number] {
  const x = p.xOff + (lon - p.minLon) * p.k
  const y = p.yOff + (p.maxLat - lat) * p.cosLat * p.k
  return [round1(x * view.scale + view.tx), round1(y * view.scale + view.ty)]
}

export function unprojectLonLat(
  p: ProjectionParams,
  x: number,
  y: number,
  view: MapViewTransform = IDENTITY_VIEW
): [number, number] {
  const px = (x - view.tx) / view.scale
  const py = (y - view.ty) / view.scale
  return [
    (px - p.xOff) / p.k + p.minLon,
    p.maxLat - (py - p.yOff) / (p.cosLat * p.k)
  ]
}

export type ViewState = {
  scale: number
  tx: number
  ty: number
}

const IDENTITY_ZOOM: ViewState = { scale: 1, tx: 0, ty: 0 }
const MIN_SCALE = 1
const MAX_SCALE = 8
const MAP_CENTER: [number, number] = [MAP_W / 2, MAP_H / 2]

function clampView(
  v: ViewState,
  box: { x0: number; y0: number; w: number; h: number } = BR_BOX
): ViewState {
  if (v.scale <= MIN_SCALE) return { ...IDENTITY_ZOOM }
  const s = Math.min(Math.max(v.scale, MIN_SCALE), MAX_SCALE)
  const margin = 120
  return {
    scale: s,
    tx: Math.min(
      Math.max(v.tx, VIEW_W - (box.x0 + box.w) * s - margin),
      -box.x0 * s + margin
    ),
    ty: Math.min(
      Math.max(v.ty, VIEW_H - (box.y0 + box.h) * s - margin),
      -box.y0 * s + margin
    )
  }
}

function clientToViewBox(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): [number, number] {
  const s = Math.min(rect.width / VIEW_W, rect.height / VIEW_H)
  const ox = (rect.width - VIEW_W * s) / 2
  const oy = (rect.height - VIEW_H * s) / 2
  return [(clientX - rect.left - ox) / s, (clientY - rect.top - oy) / s]
}

function viewBoxToWrap(
  svgRect: { left: number; top: number; width: number; height: number },
  wrapRect: { left: number; top: number },
  vx: number,
  vy: number
): [number, number] {
  const s = Math.min(svgRect.width / VIEW_W, svgRect.height / VIEW_H)
  const ox = (svgRect.width - VIEW_W * s) / 2
  const oy = (svgRect.height - VIEW_H * s) / 2
  return [
    Math.round((svgRect.left - wrapRect.left + ox + vx * s) * 10) / 10,
    Math.round((svgRect.top - wrapRect.top + oy + vy * s) * 10) / 10
  ]
}

function tweenView(
  from: ViewState,
  to: ViewState,
  duration: number,
  onUpdate: (v: ViewState) => void
): () => void {
  let raf = 0
  const t0 = performance.now()
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / duration)
    const e = 1 - Math.pow(1 - p, 3)
    onUpdate({
      scale: from.scale + (to.scale - from.scale) * e,
      tx: from.tx + (to.tx - from.tx) * e,
      ty: from.ty + (to.ty - from.ty) * e
    })
    if (p < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

function eachRing(geometry: GeoGeometry, fn: (ring: LonLat[]) => void) {
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) fn(ring)
  } else {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) fn(ring)
    }
  }
}

function computeBbox(features: StateFeature[]) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const f of features) {
    eachRing(f.geometry, (ring) => {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    })
  }
  return { minLon, maxLon, minLat, maxLat }
}

const fmtPct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

const fmtInt = (v: number | null) =>
  v == null ? '–' : new Intl.NumberFormat('pt-BR').format(v)

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

/** Cor pela margem 1º−2º (acirrada = escuro, lavada = vivo). */
function fillFor(winner: Winner, margin: number): string {
  if (winner === 'flavio') {
    if (margin > 45) return '#3b82f6'
    if (margin > 25) return '#2563eb'
    if (margin > 10) return '#1e40af'
    return '#1e3a8a'
  }
  if (winner === 'lula') {
    if (margin > 45) return '#ef4444'
    if (margin > 25) return '#dc2626'
    if (margin > 10) return '#991b1b'
    return '#7f1d1d'
  }
  if (margin > 45) return '#71717a'
  if (margin > 25) return '#52525b'
  if (margin > 10) return '#3f3f46'
  return '#27272a'
}

const BLUE_RAMP = ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6'] as const
const RED_RAMP = ['#7f1d1d', '#991b1b', '#dc2626', '#ef4444'] as const
const GRAY_RAMP = ['#27272a', '#3f3f46', '#52525b', '#71717a'] as const

const WINNER_ACCENT: Record<Winner, string> = WINNER_COLORS

const WINNER_SG: Record<Winner, string> = {
  flavio: 'PL',
  lula: 'PT',
  outro: '—'
}

function rampOf(winner: Winner): readonly string[] {
  if (winner === 'flavio') return BLUE_RAMP
  if (winner === 'lula') return RED_RAMP
  return GRAY_RAMP
}

const CAND_BLUE = ['#172554', '#1e3a8a', '#1d4ed8', '#3b82f6'] as const
const CAND_RED = ['#450a0a', '#7f1d1d', '#b91c1c', '#ef4444'] as const
const CAND_GOLD = ['#422006', '#713f12', '#a16207', '#eab308'] as const
const APURADO_RAMP = ['#2a2a2e', '#55555e', '#8a8a95', '#b9b9c2', '#d6d6db'] as const

function candidateRamp(sg: string | undefined): readonly string[] {
  if (sg === 'PT') return CAND_RED
  if (sg !== 'PL') return CAND_GOLD
  return CAND_BLUE
}

function shadeFor(
  ramp: readonly string[],
  pct: number,
  bands: readonly [number, number, number] = [10, 30, 50]
): string {
  if (pct >= bands[2]) return ramp[3]
  if (pct >= bands[1]) return ramp[2]
  if (pct >= bands[0]) return ramp[1]
  return ramp[0]
}

function apuradoFill(pst: number | null): string {
  const p = pst ?? 0
  if (p >= 99.5) return '#d6d6db'
  if (p >= 75) return '#b9b9c2'
  if (p >= 50) return '#8a8a95'
  if (p >= 25) return '#55555e'
  return '#2a2a2e'
}

function formatMi(votes: number): string {
  const mi = votes / 1_000_000
  return `+${mi.toFixed(1).replace('.', ',')} mi`
}

function formatIntBR(v: number): string {
  return v.toLocaleString('pt-BR')
}

function fmtPctShort(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`
}

function minCandShareText(
  snapshot: TseSnapshot | null,
  sq: string | undefined
): string {
  if (!snapshot || !sq) return '–'
  let min = Infinity
  for (const city of Object.values(snapshot.cidades)) {
    const hit = city.all?.find(([s]) => s === sq)
    if (!hit) continue
    const pct = share(hit[1], city.vv)
    if (pct < min) min = pct
  }
  if (!Number.isFinite(min)) return '–'
  return min < 10
    ? min.toFixed(2).replace('.', ',')
    : String(Math.floor(min))
}

function marginOf(
  top: { vap: number }[],
  vv: number | null
): number {
  if (top.length === 0) return 0
  const first = share(top[0].vap, vv)
  const second = top.length > 1 ? share(top[1].vap, vv) : 0
  return Math.round((first - second) * 10) / 10
}

export type CityCandidate = {
  name: string
  party: string
  number: string
  votes: number
  pct: number
  photo: string
  accent: string
  winner: Winner
}

export type CityResult = {
  code: string
  name: string
  uf: string
  sectionsPct: number | null
  sectionsDone: number | null
  sectionsTotal: number | null
  validVotes: number | null
  brancos: number | null
  nulos: number | null
  abstencoes: number | null
  candidates: CityCandidate[]
  past: PastResult | null
}

export type PastCandidate = {
  name: string
  party: string
  pct: number
  accent: string
}

export type PastResult = {
  year: number
  candidates: PastCandidate[]
    variation: { name: string; delta: number }[]
}

function getCityResult(
  snapshot: TseSnapshot,
  past: PastSnapshot | null,
  code: string,
  fallbackName: string,
  fallbackUf: string
): CityResult | null {
  const c = snapshot.cidades[code]
  if (!c || c.top.length === 0) return null
  const firstSq = snapshot.nacional.top[0]?.sq
  const secondSq = snapshot.nacional.top[1]?.sq
  const photo = (sq: string) =>
    snapshot.meta.fotos.replace('{sqcand}', sq)
  const accentOf = (w: Winner) => winnerColor(w)
  const accentOfSg = (sg: string) => partyColor(sg)
  const candidates = c.top.slice(0, 2).map((t) => {
    const winner = winnerOf(t.sq, firstSq, secondSq)
    return {
      name: toTitle(t.nmu),
      party: `${t.sg} ${t.n}`.trim(),
      number: t.n,
      votes: t.vap,
      pct: share(t.vap, c.vv),
      photo: photo(t.sq),
      accent: accentOf(winner),
      winner
    }
  })
  return {
    code,
    name: toTitle(c.n || fallbackName),
    uf: c.uf || fallbackUf,
    sectionsPct: c.pst,
    sectionsDone: c.st,
    sectionsTotal: c.ts,
    validVotes: c.vv,
    brancos: c.vb ?? null,
    nulos: c.vn ?? null,
    abstencoes: c.a ?? null,
    candidates,
    past: buildPast(past?.cidades[code]?.top ?? null, candidates, accentOfSg)
  }
}

function varLabel(party: string): string {
  return party.split(' ')[0] ?? party
}

/** CityResult a partir do choropleth municipal alternativo (ex.: governador). */
function getGovCityResult(
  mc: MunicipalChoropleth,
  code: string,
  fallbackName: string
): CityResult | null {
  const c = mc.cidades[code]
  if (!c || c.top.length === 0) return null
  const photo = (sq: string) =>
    mc.fotos.replace('{uf}', mc.uf.toLowerCase()).replace('{sqcand}', sq)
  const candidates = c.top.slice(0, 2).map((t) => {
    const info = mc.candidatos[t.sq]
    const sg = info?.sg ?? ''
    return {
      name: toTitle(info?.nmu ?? t.sq),
      party: `${sg} ${info?.n ?? ''}`.trim(),
      number: info?.n ?? '',
      votes: t.vap,
      pct: share(t.vap, c.vv),
      photo: photo(t.sq),
      accent: partyVivid(sg),
      winner: 'outro' as Winner
    }
  })
  return {
    code,
    name: toTitle(c.n || fallbackName),
    uf: mc.uf,
    sectionsPct: c.pst,
    sectionsDone: c.st,
    sectionsTotal: c.ts,
    validVotes: c.vv,
    brancos: c.vb ?? null,
    nulos: c.vn ?? null,
    abstencoes: c.a ?? null,
    candidates,
    past: null
  }
}

function buildPast(
  pastTop: PastTopCandidate[] | null,
  candidates: CityCandidate[],
  accentOfSg: (sg: string) => string
): PastResult | null {
  if (!pastTop || pastTop.length === 0) return null
  const byNumber = new globalThis.Map(pastTop.map((p) => [p.n, p]))
  const pastCandidates: PastCandidate[] = pastTop.slice(0, 2).map((p) => ({
    name: toTitle(p.nmu),
    party: `${p.sg} ${p.n}`.trim(),
    pct: p.pct,
    accent: accentOfSg(p.sg)
  }))
  const variation = candidates
    .map((cand) => {
      const old = byNumber.get(cand.number)
      if (!old) return null
      return {
        name: varLabel(cand.party),
        delta: Math.round((cand.pct - old.pct) * 10) / 10
      }
    })
    .filter((v): v is { name: string; delta: number } => v !== null)
  if (pastCandidates.length === 0) return null
  return { year: 2022, candidates: pastCandidates, variation }
}

function getStateResult(
  snapshot: TseSnapshot,
  past: PastSnapshot | null,
  sigla: string,
  stateFeatures: StateFeature[]
): CityResult | null {
  const place = snapshot.ufs[sigla]
  const stateName =
    stateFeatures.find((f) => f.properties.sigla === sigla)?.properties.nome ??
    sigla
  if (!place || place.top.length === 0) return null
  const firstSq = snapshot.nacional.top[0]?.sq
  const secondSq = snapshot.nacional.top[1]?.sq
  const accentOf = (w: Winner) => winnerColor(w)
  const candidates = place.top.slice(0, 2).map((t) => {
    const winner = winnerOf(t.sq, firstSq, secondSq)
    return {
      name: toTitle(t.nmu),
      party: `${t.sg} ${t.n}`.trim(),
      number: t.n,
      votes: t.vap,
      pct: share(t.vap, place.vv),
      photo: snapshot.meta.fotos.replace('{sqcand}', t.sq),
      accent: accentOf(winner),
      winner
    }
  })
  return {
    code: `UF:${sigla}`,
    name: stateName,
    uf: sigla,
    sectionsPct: place.pst,
    sectionsDone: place.st,
    sectionsTotal: place.ts,
    validVotes: place.vv,
    brancos: place.vb ?? null,
    nulos: place.vn ?? null,
    abstencoes: place.a ?? null,
    candidates,
      past: buildPast(past?.ufs[sigla]?.top ?? null, candidates, (sg) =>
      partyColor(sg)
    )
  }
}

function CandidatePhoto({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    return (
      <span
        aria-hidden="true"
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      >
        {initials || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-full bg-woodsmoke-700 object-cover"
    />
  )
}

function CityPopoverCard({ city }: { city: CityResult }) {
  const sectionsLabel =
    city.sectionsPct != null
      ? `${String(city.sectionsPct).replace('.', ',')}% das seções`
      : 'Apuração TSE 2026'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="w-[300px] overflow-hidden"
    >
      <Popover.Header>
        <div className="flex items-baseline gap-2">
          <span className="text-woodsmoke-400 text-xs font-semibold tracking-wide">
            {city.uf}
          </span>
          <Popover.Title className="text-[15px] font-bold text-white">
            {city.name}
          </Popover.Title>
        </div>
        <Popover.Description>{sectionsLabel}</Popover.Description>
      </Popover.Header>

      <Popover.Body className="space-y-2.5 pt-1.5">
        {city.candidates.map((c) => (
          <div key={c.number} className="flex items-center gap-2.5">
            <CandidatePhoto name={c.name} src={c.photo} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold text-white">{c.name}</p>
              <p
                className="text-xs font-semibold"
                style={{ color: c.accent }}
              >
                {c.party}
              </p>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">
              {fmtPct(c.pct)}
            </span>
          </div>
        ))}

        <div className="border-woodsmoke-800 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-[11px] tabular-nums">
          <p className="text-woodsmoke-400">
            Válidos{' '}
            <strong className="text-woodsmoke-200 font-semibold">
              {fmtInt(city.validVotes)}
            </strong>
          </p>
          <p className="text-woodsmoke-400">
            Brancos{' '}
            <strong className="text-woodsmoke-200 font-semibold">
              {fmtInt(city.brancos)}
            </strong>
          </p>
          <p className="text-woodsmoke-400">
            Nulos{' '}
            <strong className="text-woodsmoke-200 font-semibold">
              {fmtInt(city.nulos)}
            </strong>
          </p>
          <p className="text-woodsmoke-400">
            Abstenções{' '}
            <strong className="text-woodsmoke-200 font-semibold">
              {fmtInt(city.abstencoes)}
            </strong>
          </p>
        </div>

        {city.past && city.past.candidates.length > 0 && (
          <div className="border-woodsmoke-800 border-t pt-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="text-woodsmoke-400 font-semibold">
                {city.past.year}
              </span>
              {city.past.candidates.map((p) => (
                <span
                  key={p.party}
                  className="text-woodsmoke-300 inline-flex items-center gap-1 tabular-nums"
                >
                  <i
                    className="inline-block h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: p.accent }}
                  />
                  {p.party.split(' ')[0]} {fmtPct(p.pct)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Popover.Body>

      {city.past && city.past.variation.length > 0 ? (
        <Popover.Footer className="text-[11px] tabular-nums">
          <span className="text-woodsmoke-400 font-semibold">Variação</span>
          {city.past.variation.map((v) => (
            <span key={v.name} className="text-woodsmoke-300 ml-1">
              {v.name} {v.delta > 0 ? '+' : ''}
              {v.delta.toFixed(1).replace('.', ',')}
            </span>
          ))}
          <span className="text-woodsmoke-400">pontos</span>
        </Popover.Footer>
      ) : (
        <Popover.Footer className="text-[11px] tabular-nums">
          <span className="text-woodsmoke-400 font-semibold">
            Votos válidos
          </span>
          <span className="text-woodsmoke-300 ml-1">
            {fmtInt(city.validVotes)}
          </span>
        </Popover.Footer>
      )}
    </motion.div>
  )
}

type MunicipalityPath = {
  code: string
  uf: string
  d: string
  fill: string
}

/** Cursor via CSS; o realce de hover/seleção é clipado p/ dentro (sem vazar). */
const MAP_LAYER_CSS = `.map-city{cursor:pointer}.map-panning,.map-panning *{cursor:grabbing!important}`

const MunicipalitiesLayer = memo(function MunicipalitiesLayer({
  paths,
  selectedCode,
  focusUf,
  scale
}: {
  paths: MunicipalityPath[]
  selectedCode: string | null
  focusUf?: string | null
  scale: number
}) {
  return (
    <g>
      {paths.map((m) => {
        if (focusUf && m.uf !== focusUf) return null
        if (selectedCode === m.code) {
          const box = pathBBox(m.d)
          const tiny =
            box != null &&
            Math.min(box.maxX - box.minX, box.maxY - box.minY) * scale <
              HIGHLIGHT_DOT_PX
          if (tiny && box) {
            return (
              <g key={m.code}>
                <path
                  d={m.d}
                  data-city={m.code}
                  data-uf={m.uf}
                  fill={m.fill}
                  fillOpacity={0.92}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={0.3}
                  strokeLinejoin="round"
                  className="map-city"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{m.code}</title>
                </path>
                <circle
                  cx={(box.minX + box.maxX) / 2}
                  cy={(box.minY + box.maxY) / 2}
                  r={3 / scale}
                  fill="#fff"
                  pointerEvents="none"
                />
              </g>
            )
          }
          return (
            <g key={m.code}>
              <clipPath id={`mclip-${m.code}`}>
                <path d={m.d} />
              </clipPath>
              <path
                d={m.d}
                data-city={m.code}
                data-uf={m.uf}
                fill={m.fill}
                fillOpacity={0.92}
                stroke="none"
                className="map-city"
              />
              <path
                d={m.d}
                fill="none"
                stroke="#fff"
                strokeWidth={2.4}
                strokeLinejoin="round"
                clipPath={`url(#mclip-${m.code})`}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          )
        }
        return (
          <path
            key={m.code}
            d={m.d}
            data-city={m.code}
            data-uf={m.uf}
            fill={m.fill}
            fillOpacity={0.92}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.3}
            strokeLinejoin="round"
            className="map-city"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </g>
  )
})

export type MapSpike = {
  code: string
  x: number
  y: number
  h: number
  fill: string
}

const SpikesLayer = memo(function SpikesLayer({
  spikes,
  selectedCode
}: {
  spikes: MapSpike[]
  selectedCode: string | null
}) {
  return (
    <g>
      {spikes.map((s) => (
        <line
          key={s.code}
          x1={s.x}
          y1={s.y}
          x2={s.x}
          y2={s.y - s.h}
          data-city={s.code}
          stroke={s.fill}
          strokeWidth={1.3}
          strokeLinecap="round"
          pointerEvents="stroke"
          className="map-city"
          vectorEffect="non-scaling-stroke"
          style={
            selectedCode === s.code
              ? { stroke: '#fff', strokeWidth: 2.4 }
              : undefined
          }
        />
      ))}
    </g>
  )
})

const WORLD_W = 1000
const WORLD_H = 500
const WORLD_Y0 = 100

/** Caixa do conteúdo p/ o clamp do pan/zoom (Brasil ou mundo). */
const BR_BOX = { x0: 0, y0: 0, w: MAP_W, h: MAP_H }
const WORLD_BOX = { x0: 0, y0: WORLD_Y0, w: WORLD_W, h: WORLD_H }
const WORLD_CENTER: [number, number] = [WORLD_W / 2, WORLD_Y0 + WORLD_H / 2]

function projectWorld(lon: number, lat: number): [number, number] {
  return [
    round1(((lon + 180) / 360) * WORLD_W),
    round1(WORLD_Y0 + ((90 - lat) / 180) * WORLD_H)
  ]
}

function ringToPathWorld(ring: LonLat[]): string {
  let d = ''
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = projectWorld(ring[i][0], ring[i][1])
    d += `${i === 0 ? 'M' : 'L'}${x},${y}`
  }
  return `${d}Z`
}

function geometryToPathWorld(geometry: GeoGeometry): string {
  const parts: string[] = []
  eachRing(geometry, (ring) => {
    if (ring.length > 0) parts.push(ringToPathWorld(ring))
  })
  return parts.join('')
}

export type ExteriorDot = {
  code: string
  name: string
  country: string
  x: number
  y: number
  r: number
  fill: string
  votes: number
  winner: Winner
  pct: number
}

const ExteriorDotsLayer = memo(function ExteriorDotsLayer({
  dots,
  hoverCode,
  selectedCode
}: {
  dots: ExteriorDot[]
  hoverCode: string | null
  selectedCode: string | null
}) {
  return (
    <g>
      {dots.map((d) => {
        const hot = d.code === hoverCode || d.code === selectedCode
        return (
          <circle
            key={d.code}
            cx={d.x}
            cy={d.y}
            r={d.r}
            data-city={d.code}
            data-uf="ZZ"
            fill={d.fill}
            fillOpacity={hot ? 1 : 0.9}
            stroke={hot ? '#fff' : 'rgba(0,0,0,0.55)'}
            strokeWidth={hot ? 1.6 : 0.8}
            className="map-city"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${d.name} · ${d.country}`}</title>
          </circle>
        )
      })}
    </g>
  )
})

function getExteriorCityResult(
  snapshot: ExteriorSnapshot,
  place: ExteriorPlace,
  past: PastSnapshot | null
): CityResult | null {
  const c = snapshot.cidades[place.tse]
  if (!c || c.top.length === 0) return null
  const accentOf = (w: Winner) => winnerColor(w)
  const candidates = c.top.slice(0, 2).map((t) => {
    const winner = winnerByParty(t.sg)
    return {
      name: toTitle(t.nmu),
      party: `${t.sg} ${t.n}`.trim(),
      number: t.n,
      votes: t.vap,
      pct: share(t.vap, c.vv),
      photo: snapshot.meta.fotos.replace('{sqcand}', t.sq),
      accent: accentOf(winner),
      winner
    }
  })
  const pastCity = past?.exterior?.[place.tse]
  const pastTop: PastTopCandidate[] =
    pastCity?.top
      .filter((p) => p.n === '22' || p.n === '13')
      .map((p) => ({ nmu: p.nmu, sg: p.sg, n: p.n, vap: p.vap, pct: p.pct })) ?? []
  return {
    code: place.tse,
    name: toTitle(place.name),
    uf: place.country,
    sectionsPct: c.pst,
    sectionsDone: c.st,
    sectionsTotal: c.ts,
    validVotes: c.vv,
    brancos: c.vb ?? null,
    nulos: c.vn ?? null,
    abstencoes: c.a ?? null,
    candidates,
    past: buildPast(pastTop, candidates, partyColor)
  }
}

/** Agregado do voto no exterior p/ o popover do globo. */
function getExteriorAggregateResult(
  snapshot: ExteriorSnapshot,
  past: PastSnapshot | null
): CityResult | null {
  const total = snapshot.total
  if (!total || total.top.length === 0) return null
  const accentOf = (w: Winner) => winnerColor(w)
  const candidates = total.top.slice(0, 2).map((t) => {
    const winner = winnerByParty(t.sg)
    return {
      name: toTitle(t.nmu),
      party: `${t.sg} ${t.n}`.trim(),
      number: t.n,
      votes: t.vap,
      pct: share(t.vap, total.vv),
      photo: snapshot.meta.fotos.replace('{sqcand}', t.sq),
      accent: accentOf(winner),
      winner
    }
  })
  // 2022 agregado: soma PL 22 + PT 13 sobre todas as cidades com dado.
  let pastTop: PastTopCandidate[] | null = null
  const ext = past?.exterior
  if (ext) {
    const sums: Record<string, { nmu: string; sg: string; n: string; vap: number }> = {}
    let vv = 0
    for (const entry of Object.values(ext)) {
      vv += entry.vv ?? 0
      for (const p of entry.top) {
        if (p.n !== '22' && p.n !== '13') continue
        const s = sums[p.n] ?? { nmu: p.nmu, sg: p.sg, n: p.n, vap: 0 }
        s.vap += p.vap
        sums[p.n] = s
      }
    }
    if (vv > 0 && Object.keys(sums).length > 0) {
      pastTop = Object.values(sums)
        .sort((a, b) => b.vap - a.vap)
        .map((s) => ({
          ...s,
          pct: Math.round((s.vap / vv) * 1000) / 10
        }))
    }
  }
  return {
    code: 'ZZ',
    name: 'Exterior',
    uf: '🌐',
    sectionsPct: total.pst,
    sectionsDone: total.st,
    sectionsTotal: total.ts,
    validVotes: total.vv,
    brancos: total.vb ?? null,
    nulos: total.vn ?? null,
    abstencoes: total.a ?? null,
    candidates,
    past: buildPast(pastTop, candidates, (sg) => partyColor(sg))
  }
}

type NameIndex = Record<string, { n: string; u: string }>

let municipalitiesPromise: Promise<MunFeature[]> | null = null
let municipalityIndexPromise: Promise<NameIndex> | null = null
let statesPromise: Promise<StateFeature[]> | null = null

function loadMunicipalities(): Promise<MunFeature[]> {
  if (!municipalitiesPromise) {
    municipalitiesPromise = fetch('/maps/brazil-municipalities.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => (d.features ?? []) as MunFeature[])
      .catch(() => [] as MunFeature[])
  }
  return municipalitiesPromise
}

function loadMunicipalityIndex(): Promise<NameIndex> {
  if (!municipalityIndexPromise) {
    municipalityIndexPromise = fetch('/maps/municipalities-index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((list: [number, string, string][]) => {
        const idx: NameIndex = {}
        for (const [code, name, uf] of list) {
          idx[String(code)] = { n: name, u: uf }
        }
        return idx
      })
      .catch(() => ({}) as NameIndex)
  }
  return municipalityIndexPromise
}

function loadStates(): Promise<StateFeature[]> {
  if (!statesPromise) {
    statesPromise = fetch('/maps/brazil-states.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => (d.features ?? []) as StateFeature[])
      .catch(() => [] as StateFeature[])
  }
  return statesPromise
}

let exteriorAggPromises: Partial<Record<Turno, Promise<ExteriorSnapshot | null>>> = {}

function loadExteriorAgg(turno: Turno): Promise<ExteriorSnapshot | null> {
  if (!exteriorAggPromises[turno]) {
    exteriorAggPromises[turno] = fetch(`/api/elections/exterior?turno=${turno}`, {
      cache: 'no-store'
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => d as ExteriorSnapshot)
      .catch(() => null)
  }
  return exteriorAggPromises[turno]!
}

let worldPromise: Promise<WorldFeature[]> | null = null
let exteriorPlacesPromise: Promise<ExteriorPlace[]> | null = null

function loadWorld(): Promise<WorldFeature[]> {
  if (!worldPromise) {
    worldPromise = fetch('/maps/world-countries.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => (d.features ?? []) as WorldFeature[])
      .catch(() => [] as WorldFeature[])
  }
  return worldPromise
}

function loadExteriorPlaces(): Promise<ExteriorPlace[]> {
  if (!exteriorPlacesPromise) {
    exteriorPlacesPromise = fetch('/maps/exterior-cities.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => (Array.isArray(d) ? d : []) as ExteriorPlace[])
      .catch(() => [] as ExteriorPlace[])
  }
  return exteriorPlacesPromise
}

export function Map({ selected, onSelect, results, mode = 'brasil', turno = 1, exterior, onModeChange, mapView = 'municipios', candidateSq = null, className, filters, choropleth = null, suppressPopover = false, statePopover = null, municipalChoropleth = null }: MapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const closeTimer = useRef<number | null>(null)
  const hoverRaf = useRef<number | null>(null)
  const animCancel = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  const dragging = useRef(false)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const pointers = useRef<Record<number, { x: number; y: number }>>({})
  const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(
    null
  )
  const downRect = useRef<DOMRect | null>(null)
  /** Último código que originou zoom (evita re-animar seleção interna). */
  const lastExternalZoom = useRef<string | null>(null)
  /** Seleção que chegou antes das geometrias carregarem. */
  const pendingZoom = useRef<string | null>(null)
  const [municipalities, setMunicipalities] = useState<MunFeature[]>([])
  const [nameIndex, setNameIndex] = useState<NameIndex>({})
  const [stateFeatures, setStateFeatures] = useState<StateFeature[]>([])
  const [worldFeatures, setWorldFeatures] = useState<WorldFeature[]>([])
  const [exteriorPlaces, setExteriorPlaces] = useState<ExteriorPlace[]>([])
  const [past, setPast] = useState<PastSnapshot | null>(null)
  const [loadingMun, setLoadingMun] = useState(true)
  const [internalResults, setInternalResults] = useState<TseSnapshot | null>(
    null
  )
  const [resultsError, setResultsError] = useState(false)
  /** Controlado (via prop) ou interno: 1 única fonte de verdade. */
  const snapshot = results !== undefined ? results : internalResults
  const [hover, setHover] = useState<HoverState | null>(null)
  const [badgeHover, setBadgeHover] = useState<
    | { kind: 'state'; sigla: string; x: number; y: number }
    | { kind: 'globe'; x: number; y: number }
    | null
  >(null)
  /** Agregado do exterior p/ o popover do globo (lazy, 1 fetch). */
  const [globeData, setGlobeData] = useState<ExteriorSnapshot | null>(null)
  const [internalSelected, setInternalSelected] = useState<string | null>(
    selected ?? null
  )
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>({ ...IDENTITY_ZOOM })
  const viewRef = useRef<ViewState>({ ...IDENTITY_ZOOM })

  const applyView = useCallback((v: ViewState) => {
    viewRef.current = v
    setView(v)
  }, [])

  const stopAnim = useCallback(() => {
    if (animCancel.current) {
      animCancel.current()
      animCancel.current = null
    }
  }, [])

  /** Clamp do pan/zoom na caixa do conteúdo do modo atual. */
  const clampMode = useCallback(
    (v: ViewState) => clampView(v, mode === 'exterior' ? WORLD_BOX : BR_BOX),
    [mode]
  )

  const animateViewTo = useCallback(
    (to: ViewState, duration = 450) => {
      stopAnim()
      const from = viewRef.current
      animCancel.current = tweenView(from, clampMode(to), duration, applyView)
    },
    [applyView, stopAnim, clampMode]
  )

  const resolvedSelected = selected ?? internalSelected

  useEffect(() => {
    let alive = true
    // Comparativo 2022 existe só para o 1º turno (fase 2 cobre o 2T).
    const pastTask =
      turno === 1 ? loadPast() : Promise.resolve(null)
    Promise.all([
      loadMunicipalities(),
      loadMunicipalityIndex(),
      loadStates(),
      loadWorld(),
      loadExteriorPlaces(),
      pastTask
    ]).then(([mun, idx, states, world, places, pastSnap]) => {
      if (!alive) return
      setMunicipalities(mun)
      setNameIndex(idx)
      setStateFeatures(states)
      setWorldFeatures(world)
      setExteriorPlaces(places)
      setPast(pastSnap)
      setLoadingMun(false)
    })
    return () => {
      alive = false
    }
  }, [turno])

  useEffect(() => {
    if (mode !== 'brasil' || exterior || globeData) return
    let alive = true
    loadExteriorAgg(turno).then((s) => {
      if (alive && s) setGlobeData(s)
    })
    return () => {
      alive = false
    }
  }, [mode, exterior, globeData, turno])

  // Troca de turno: descarta o agregado interno do turno anterior.
  useEffect(() => {
    setGlobeData(null)
  }, [turno])

  useEffect(() => {
    if (results !== undefined) return
    let alive = true
    loadResults(turno).then((snap) => {
      if (!alive) return
      if (snap) {
        setInternalResults(snap)
      } else {
        setResultsError(true)
        window.setTimeout(() => {
          if (!alive) return
          loadResults(turno).then((retry) => {
            if (!alive || !retry) return
            setInternalResults(retry)
            setResultsError(false)
          })
        }, 15000)
      }
    })
    return () => {
      alive = false
    }
  }, [results, turno])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (selected !== undefined) setInternalSelected(selected)
  }, [selected])

  useEffect(
    () => () => {
      if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (animCancel.current) animCancel.current()
      svgRef.current?.classList.remove('map-panning')
    },
    []
  )

  const projection = useMemo(() => {
    // Bbox aproximado até as UFs carregarem (evita NaN).
    const bbox =
      stateFeatures.length > 0
        ? computeBbox(stateFeatures)
        : { minLon: -74, maxLon: -32, minLat: -34, maxLat: 6 }
    const meanLat = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180)
    const cosLat = Math.cos(meanLat)
    const kx = (MAP_W - MAP_PAD * 2) / (bbox.maxLon - bbox.minLon)
    const ky = (MAP_H - MAP_PAD * 2) / (bbox.maxLat - bbox.minLat)
    const k = Math.min(kx, ky / cosLat)
    const params: ProjectionParams = {
      minLon: bbox.minLon,
      minLat: bbox.minLat,
      maxLat: bbox.maxLat,
      k,
      xOff: (MAP_W - (bbox.maxLon - bbox.minLon) * k) / 2,
      yOff: (MAP_H - (bbox.maxLat - bbox.minLat) * cosLat * k) / 2,
      cosLat
    }
    const project = (
      lon: number,
      lat: number,
      view: MapViewTransform = IDENTITY_VIEW
    ): [number, number] => projectLonLat(params, lon, lat, view)
    return { project, params, bbox }
  }, [stateFeatures])

  const ringToPath = (ring: LonLat[]) => {
    const { project } = projection
    let d = ''
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1])
      d += `${i === 0 ? 'M' : 'L'}${x},${y}`
    }
    return `${d}Z`
  }

  const geometryToPath = (geometry: GeoGeometry) => {
    const parts: string[] = []
    eachRing(geometry, (ring) => {
      if (ring.length > 0) parts.push(ringToPath(ring))
    })
    return parts.join('')
  }

  const stateAnchors = useMemo(() => {
    const { project } = projection
    const anchors: Record<string, { x: number; y: number }> = {}
    const polysOf = (g: GeoGeometry): LonLat[][][] => {
      if (g.type === 'Polygon') return [g.coordinates]
      return g.coordinates
    }
    const shoelace = (ring: [number, number][]) => {
      let a = 0
      let cx = 0
      let cy = 0
      for (let i = 0; i < ring.length; i++) {
        const [x0, y0] = ring[i]
        const [x1, y1] = ring[(i + 1) % ring.length]
        const cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
      }
      return { area: a / 2, cx: cx / (6 * (a || 1)), cy: cy / (6 * (a || 1)) }
    }
    const inside = (x: number, y: number, ring: [number, number][]) => {
      let c = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          c = !c
        }
      }
      return c
    }
    for (const f of stateFeatures) {
      let best: { ring: [number, number][]; area: number } | null = null
      for (const poly of polysOf(f.geometry)) {
        if (poly.length === 0) continue
        const ring = poly[0].map(
          ([lon, lat]) => project(lon, lat) as [number, number]
        )
        if (ring.length < 3) continue
        const { area } = shoelace(ring)
        if (!best || Math.abs(area) > Math.abs(best.area)) {
          best = { ring, area }
        }
      }
      if (!best) continue
      const { cx, cy } = shoelace(best.ring)
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const [x, y] of best.ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      const bx = (minX + maxX) / 2
      const by = (minY + maxY) / 2
      let anchor: [number, number] | null = null
      if (inside(cx, cy, best.ring)) {
        anchor = [cx, cy]
      } else if (inside(bx, by, best.ring)) {
        anchor = [bx, by]
      } else {
        // Grade grosseira: ponto interno mais próximo do centro do bbox.
        let bestD = Infinity
        const N = 24
        for (let gi = 0; gi <= N; gi++) {
          for (let gj = 0; gj <= N; gj++) {
            const gx = minX + ((maxX - minX) * gi) / N
            const gy = minY + ((maxY - minY) * gj) / N
            if (!inside(gx, gy, best.ring)) continue
            const d = (gx - bx) * (gx - bx) + (gy - by) * (gy - by)
            if (d < bestD) {
              bestD = d
              anchor = [gx, gy]
            }
          }
        }
        anchor ??= [bx, by]
      }
      anchors[f.properties.sigla] = { x: anchor[0], y: anchor[1] }
    }
    return anchors
  }, [projection])

  const ufLive = useMemo(() => {
    if (!snapshot) return null
    const firstSq = snapshot.nacional.top[0]?.sq
    const secondSq = snapshot.nacional.top[1]?.sq
    const out: Record<string, { winner: Winner; pct: number; margin: number }> = {}
    for (const [uf, place] of Object.entries(snapshot.ufs)) {
      const top1 = place.top[0]
      if (!top1) continue
      out[uf] = {
        winner: winnerOf(top1.sq, firstSq, secondSq),
        pct: share(top1.vap, place.vv),
        margin: marginOf(place.top, place.vv)
      }
    }
    return {
      firstSq,
      secondSq,
      ufs: out,
      fotos: snapshot.meta.fotos,
      nacionalPct:
        snapshot.nacional.top.length > 0
          ? share(snapshot.nacional.top[0].vap, snapshot.nacional.vv)
          : null
    }
  }, [snapshot])

  const focusCand = useMemo(() => {
    if (!snapshot) return null
    const sq = candidateSq ?? snapshot.nacional.top[0]?.sq
    if (!sq) return null
    const info = snapshot.candidatos?.[sq]
    const nat = snapshot.nacional.full?.find((c) => c.sq === sq)
    const sg = info?.sg ?? ''
    return {
      sq,
      nmu: info?.nmu ?? '',
      sg,
      n: info?.n ?? '',
      pctNat: nat ? share(nat.vap, snapshot.nacional.vv) : 0,
      ramp: candidateRamp(sg)
    }
  }, [snapshot, candidateSq])

  const ufCandShare = useMemo<Record<string, { vap: number; pct: number }>>(() => {
    if (!snapshot || !focusCand) return {}
    const vapByUf: Record<string, number> = {}
    const vvByUf: Record<string, number> = {}
    for (const city of Object.values(snapshot.cidades)) {
      const vv = city.vv ?? 0
      vvByUf[city.uf] = (vvByUf[city.uf] ?? 0) + vv
      const hit = city.all?.find(([s]) => s === focusCand.sq)
      if (hit) vapByUf[city.uf] = (vapByUf[city.uf] ?? 0) + hit[1]
    }
    const out: Record<string, { vap: number; pct: number }> = {}
    for (const uf of Object.keys(vvByUf)) {
      out[uf] = {
        vap: vapByUf[uf] ?? 0,
        pct: share(vapByUf[uf] ?? 0, vvByUf[uf])
      }
    }
    return out
  }, [snapshot, focusCand])

  const cityWins = useMemo(() => {
    const wins: Record<Winner, number> = { flavio: 0, lula: 0, outro: 0 }
    if (!snapshot || !ufLive) return wins
    for (const city of Object.values(snapshot.cidades)) {
      const top1 = city.top[0]
      if (!top1) continue
      wins[winnerOf(top1.sq, ufLive.firstSq, ufLive.secondSq)]++
    }
    return wins
  }, [snapshot, ufLive])

  const cityCenters = useMemo<Record<string, { x: number; y: number }>>(() => {
    if (municipalities.length === 0) return {}
    const { project } = projection
    const out: Record<string, { x: number; y: number }> = {}
    for (const f of municipalities) {
      const boxes: { area: number; cx: number; cy: number }[] = []
      eachRing(f.geometry, (ring) => {
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        const area = (maxX - minX) * (maxY - minY)
        if (Number.isFinite(area)) {
          boxes.push({ area, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 })
        }
      })
      boxes.sort((a, b) => b.area - a.area)
      if (boxes[0]) {
        out[f.properties.codarea] = { x: boxes[0].cx, y: boxes[0].cy }
      }
    }
    return out
  }, [municipalities, projection])

  const spikeData = useMemo(() => {
    if (!snapshot || !ufLive) {
      return { spikes: [], maxMargin: 1, flavioVotes: 0, lulaVotes: 0 }
    }
    let maxMargin = 1
    let flavioVotes = 0
    let lulaVotes = 0
    const rows: { code: string; margin: number; winner: Winner }[] = []
    for (const [code, city] of Object.entries(snapshot.cidades)) {
      const top = city.top
      if (top.length === 0) continue
      const margin = top[0].vap - (top[1]?.vap ?? 0)
      if (margin < 0) continue
      const winner = winnerOf(top[0].sq, ufLive.firstSq, ufLive.secondSq)
      if (winner === 'flavio') flavioVotes += margin
      else if (winner === 'lula') lulaVotes += margin
      if (margin > maxMargin) maxMargin = margin
      rows.push({ code, margin, winner })
    }
    const spikes = rows
      .map((r) => {
        const c = cityCenters[r.code]
        if (!c) return null
        const h = 3 + 130 * Math.sqrt(r.margin / maxMargin)
        return {
          code: r.code,
          x: Math.round(c.x * 10) / 10,
          y: Math.round(c.y * 10) / 10,
          h: Math.round(h * 10) / 10,
          fill:
            r.winner === 'flavio'
              ? '#2563eb'
              : r.winner === 'lula'
                ? '#dc2626'
                : '#52525b',
          winner: r.winner
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
    return { spikes, maxMargin, flavioVotes, lulaVotes }
  }, [snapshot, ufLive, cityCenters])

  const apuradoStats = useMemo(() => {
    if (!snapshot) return { done: 0, total: municipalities.length }
    let done = 0
    for (const city of Object.values(snapshot.cidades)) {
      if ((city.pst ?? 0) >= 99.5) done++
    }
    return { done, total: municipalities.length }
  }, [snapshot, municipalities.length])

  const municipalityPaths = useMemo(() => {
    if (municipalities.length === 0) return []
    if (municipalChoropleth) {
      return municipalities
        .filter(
          (f) =>
            (nameIndex[f.properties.codarea]?.u ?? '') ===
            municipalChoropleth.uf
        )
        .map((f) => {
          const code = f.properties.codarea
          const city = municipalChoropleth.cidades[code]
          const d = geometryToPath(f.geometry)
          const top = city?.top ?? []
          if (top.length === 0 || !city) {
            return { code, uf: municipalChoropleth.uf, d, fill: '#27272a' }
          }
          const sg =
            municipalChoropleth.candidatos[top[0].sq]?.sg ?? ''
          const margin = marginOf(top, city.vv)
          return {
            code,
            uf: municipalChoropleth.uf,
            d,
            fill: partyShade(sg, margin)
          }
        })
    }
    if (!snapshot || !ufLive) return []
    return municipalities.map((f) => {
      const code = f.properties.codarea
      const city = snapshot.cidades[code]
      const uf = city?.uf ?? nameIndex[code]?.u ?? ''
      const d = geometryToPath(f.geometry)
      if (mapView === 'apurado') {
        return { code, uf, d, fill: apuradoFill(city?.pst ?? null) }
      }
      if (mapView === 'candidato' && focusCand) {
        const hit = city?.all?.find(([s]) => s === focusCand.sq)
        const pct = hit ? share(hit[1], city?.vv ?? null) : 0
        return { code, uf, d, fill: shadeFor(focusCand.ramp, pct) }
      }
      const top1 = city?.top[0]
      let winner: Winner
      let margin: number
      if (top1 && city) {
        winner = winnerOf(top1.sq, ufLive.firstSq, ufLive.secondSq)
        margin = marginOf(city.top, city.vv)
      } else {
        const base = ufLive.ufs[uf] ?? { winner: 'outro' as Winner, margin: 0 }
        winner = base.winner
        margin = base.margin
      }
      return {
        code,
        uf,
        d,
        fill: fillFor(winner, margin)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalities, nameIndex, projection, snapshot, ufLive, view, focusCand, municipalChoropleth])

  /** Overlay sem varrer 5,7k paths a cada hover. */
  const pathByCode = useMemo(() => {
    const idx: Record<string, MunicipalityPath> = {}
    for (const m of municipalityPaths) idx[m.code] = m
    return idx
  }, [municipalityPaths])

  const munByCode = useMemo(() => {
    const idx: Record<string, MunFeature> = {}
    for (const f of municipalities) idx[f.properties.codarea] = f
    return idx
  }, [municipalities])

  const bboxOfCode = useCallback(
    (code: string) => {
      const f = munByCode[code]
      if (!f) return null
      const { project } = projection
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      eachRing(f.geometry, (ring) => {
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      })
      if (!Number.isFinite(minX)) return null
      return { minX, maxX, minY, maxY }
    },
    [munByCode, projection]
  )

  const zoomAt = useCallback(
    (point: [number, number], factor: number) => {
      stopAnim()
      const v = viewRef.current
      const scale = v.scale * factor
      if (scale <= MIN_SCALE && v.scale <= MIN_SCALE) {
        applyView({ ...IDENTITY_ZOOM })
        return
      }
      const k = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE) / v.scale
      applyView(
        clampMode({
          scale: Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE),
          tx: point[0] - (point[0] - v.tx) * k,
          ty: point[1] - (point[1] - v.ty) * k
        })
      )
    },
    [applyView, stopAnim, clampMode]
  )

  const fitView = useCallback(
    (bbox: { minX: number; maxX: number; minY: number; maxY: number }) => {
      const pad = 60
      const bw = Math.max(bbox.maxX - bbox.minX, 1)
      const bh = Math.max(bbox.maxY - bbox.minY, 1)
      const scale = Math.min(
        (MAP_W - pad * 2) / bw,
        (MAP_H - pad * 2) / bh,
        MAX_SCALE
      )
      const cx = (bbox.minX + bbox.maxX) / 2
      const cy = (bbox.minY + bbox.maxY) / 2
      animateViewTo({
        scale: Math.max(scale, MIN_SCALE + 0.01),
        tx: MAP_CENTER[0] - cx * Math.max(scale, MIN_SCALE + 0.01),
        ty: MAP_CENTER[1] - cy * Math.max(scale, MIN_SCALE + 0.01)
      })
    },
    [animateViewTo]
  )

  const zoomToCode = useCallback(
    (code: string) => {
      const bbox = bboxOfCode(code)
      if (!bbox) return
      fitView(bbox)
    },
    [fitView, bboxOfCode]
  )

  const zoomToState = useCallback(
    (sigla: string) => {
      const f = stateFeatures.find(
        (s) => s.properties.sigla === sigla
      )
      if (!f) return
      const { project } = projection
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      eachRing(f.geometry, (ring) => {
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      })
      if (!Number.isFinite(minX)) return
      fitView({ minX, maxX, minY, maxY })
    },
    [fitView, projection, stateFeatures]
  )

  const resetView = useCallback(
    (duration = 450) => {
      animateViewTo({ ...IDENTITY_ZOOM }, duration)
    },
    [animateViewTo]
  )

  const zoomStep = useCallback(
    (factor: number) => {
      stopAnim()
      zoomAt(mode === 'exterior' ? WORLD_CENTER : MAP_CENTER, factor)
    },
    [stopAnim, zoomAt, mode]
  )

  const worldPaths = useMemo(
    () =>
      worldFeatures.map((f, i) => ({
        key: `w${i}`,
        d: geometryToPathWorld(f.geometry)
      })),
    [worldFeatures]
  )

  const placeByTse = useMemo(() => {
    const idx: Record<string, ExteriorPlace> = {}
    for (const p of exteriorPlaces) idx[p.tse] = p
    return idx
  }, [exteriorPlaces])

  const exteriorDots = useMemo<ExteriorDot[]>(() => {
    if (!exterior || exteriorPlaces.length === 0) return []
    const withVotes = exteriorPlaces
      .map((p) => ({ p, c: exterior.cidades[p.tse] }))
      .filter(
        (e): e is { p: ExteriorPlace; c: (typeof exterior.cidades)[string] } =>
          !!e.c && e.c.top.length > 0
      )
    const maxVotes = withVotes.reduce(
      (m, e) => Math.max(m, e.c.top[0]?.vap ?? 0),
      1
    )
    return withVotes.map(({ p, c }) => {
      const top1 = c.top[0]
      const winner = winnerByParty(top1.sg)
      const pct = share(top1.vap, c.vv)
      const margin = marginOf(c.top, c.vv)
      const [x, y] = projectWorld(p.lon, p.lat)
      return {
        code: p.tse,
        name: toTitle(p.name),
        country: p.country,
        x,
        y,
        r: Math.round((2.5 + 9 * Math.sqrt(top1.vap / maxVotes)) * 10) / 10,
        fill: fillFor(winner, margin),
        votes: top1.vap,
        winner,
        pct
      }
    })
  }, [exterior, exteriorPlaces])

  const exteriorLabels = useMemo(
    () =>
      [...exteriorDots].sort((a, b) => b.votes - a.votes).slice(0, 6),
    [exteriorDots]
  )

  const zoomToExteriorPoint = useCallback(
    (code: string) => {
      const p = placeByTse[code]
      if (!p) return
      const [x, y] = projectWorld(p.lon, p.lat)
      const scale = 4.5
      animateViewTo({
        scale,
        tx: WORLD_CENTER[0] - x * scale,
        ty: WORLD_CENTER[1] - y * scale
      })
    },
    [animateViewTo, placeByTse]
  )

  const isUfCode = useCallback(
    (code: string) =>
      stateFeatures.some((f) => f.properties.sigla === code),
    [stateFeatures]
  )

  const zoomToSelectedCode = useCallback(
    (code: string) => {
      if (mode === 'exterior') zoomToExteriorPoint(code)
      else if (isUfCode(code)) zoomToState(code)
      else zoomToCode(code)
    },
    [mode, zoomToCode, zoomToExteriorPoint, zoomToState, isUfCode]
  )

  useEffect(() => {
    if (selected === undefined || !selected) {
      if (selected === null) lastExternalZoom.current = null
      return
    }
    if (selected === lastExternalZoom.current) return
    lastExternalZoom.current = selected
    if (mode === 'exterior' ? exteriorPlaces.length === 0 : municipalities.length === 0) {
      pendingZoom.current = selected
      return
    }
    zoomToSelectedCode(selected)
  }, [selected, municipalities.length, exteriorPlaces.length, mode, zoomToSelectedCode])

  useEffect(() => {
    const ready =
      mode === 'exterior'
        ? exteriorPlaces.length > 0
        : municipalities.length > 0
    if (!ready || !pendingZoom.current) return
    const code = pendingZoom.current
    pendingZoom.current = null
    zoomToSelectedCode(code)
  }, [municipalities.length, exteriorPlaces.length, mode, zoomToSelectedCode])

  const hadSelection = useRef(false)
  useEffect(() => {
    if (selected) {
      hadSelection.current = true
      return
    }
    if (selected === null && hadSelection.current) {
      hadSelection.current = false
      resetView()
    }
  }, [selected, resetView])

  // ESC com estado/município selecionado: desseleciona (vale p/ todas as abas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      const t = e.target as Element | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT')
      ) {
        return
      }
      if (!resolvedSelected) return
      setHover(null)
      setInternalSelected(null)
      onSelect?.(null)
      lastExternalZoom.current = null
      resetView()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSelect, resetView, resolvedSelected])

  const statePaths = useMemo(
    () =>
      stateFeatures.map((f) => ({
        sigla: f.properties.sigla,
        nome: f.properties.nome,
        d: geometryToPath(f.geometry)
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection]
  )

  /** Bbox de cada UF em coords do viewBox (base do split diagonal). */
  const stateBoxes = useMemo(() => {
    const { project } = projection
    const boxes: Record<
      string,
      { minX: number; maxX: number; minY: number; maxY: number }
    > = {}
    for (const f of stateFeatures) {
      const sigla = f.properties.sigla
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      eachRing(f.geometry, (ring) => {
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      })
      if (Number.isFinite(minX)) boxes[sigla] = { minX, maxX, minY, maxY }
    }
    return boxes
  }, [stateFeatures, projection])

  const hoverCity: CityResult | null = useMemo(() => {
    if (!hover) return null
    const govCovered =
      !!municipalChoropleth?.cidades[hover.code]
    if (suppressPopover && !govCovered) return null
    if (mode === 'exterior') {
      if (!exterior) return null
      const place = placeByTse[hover.code]
      if (!place) return null
      return getExteriorCityResult(exterior, place, past)
    }
    if (municipalChoropleth && municipalChoropleth.cidades[hover.code]) {
      return getGovCityResult(
        municipalChoropleth,
        hover.code,
        nameIndex[hover.code]?.n ?? `Município ${hover.code}`
      )
    }
    if (!snapshot) return null
    if (hover.code.startsWith('UF:')) {
      return getStateResult(
        snapshot,
        past,
        hover.code.slice(3),
        stateFeatures
      )
    }
    const info = nameIndex[hover.code]
    return getCityResult(
      snapshot,
      past,
      hover.code,
      info?.n ?? `Município ${hover.code}`,
      info?.u ?? hover.uf
    )
  }, [hover, mode, exterior, placeByTse, nameIndex, snapshot, past, suppressPopover, municipalChoropleth])

  const badgeCity: CityResult | null = useMemo(() => {
    if (suppressPopover) return null
    if (!badgeHover) return null
    if (badgeHover.kind === 'state') {
      if (!snapshot) return null
      return getStateResult(
        snapshot,
        past,
        badgeHover.sigla,
        stateFeatures
      )
    }
    const snap = exterior ?? globeData
    if (!snap) return null
    return getExteriorAggregateResult(snap, past)
  }, [badgeHover, snapshot, past, stateFeatures, exterior, globeData, suppressPopover])

  const anchorBadgeAt = useCallback((vx: number, vy: number) => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return null
    const [x, y] = viewBoxToWrap(
      svg.getBoundingClientRect(),
      wrap.getBoundingClientRect(),
      vx,
      vy
    )
    return { x, y }
  }, [])

  const handleBadgeEnter = useCallback(
    (sigla: string, vy: number) => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      setHover(null)
      const pos = anchorBadgeAt(796, vy)
      if (!pos) return
      setBadgeHover({ kind: 'state', sigla, x: pos.x, y: pos.y })
    },
    [anchorBadgeAt]
  )

  const handleGlobeEnter = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setHover(null)
    const show = (snap: ExteriorSnapshot | null) => {
      if (!snap) return
      const pos = anchorBadgeAt(796, GLOBE_Y + 13)
      if (!pos) return
      setBadgeHover({ kind: 'globe', x: pos.x, y: pos.y })
    }
    const snap = exterior ?? globeData
    if (snap) {
      show(snap)
      return
    }
    void loadExteriorAgg(turno).then((s) => {
      if (s) {
        setGlobeData(s)
        show(s)
      }
    })
  }, [anchorBadgeAt, exterior, globeData, turno])

  const clearBadgeHover = useCallback(() => {
    setBadgeHover(null)
  }, [])

  const handleBadgeActivate = useCallback(
    (sigla: string) => {
      setHover(null)
      setBadgeHover(null)
      setInternalSelected(sigla)
      onSelect?.(sigla)
      lastExternalZoom.current = sigla
      zoomToState(sigla)
    },
    [onSelect, zoomToState]
  )

  /** Um overlay só (5,7k `<title>` travariam o hover). */
  const hoveredPath =
    mode === 'brasil' && hover ? pathByCode[hover.code] : undefined
  const hoveredName =
    mode === 'brasil' && hover
      ? (nameIndex[hover.code]?.n ?? `Município ${hover.code}`)
      : null

  const selectedCityName = useMemo(() => {
    if (!resolvedSelected) return null
    if (mode === 'exterior') {
      const place = placeByTse[resolvedSelected]
      if (place) return `${toTitle(place.name)} · ${place.country}`
      return resolvedSelected
    }
    const info = nameIndex[resolvedSelected]
    if (info) return `${info.n}/${info.u}`
    if (stateFeatures.some((f) => f.properties.sigla === resolvedSelected)) {
      return resolvedSelected
    }
    return resolvedSelected
  }, [resolvedSelected, nameIndex, mode, placeByTse, stateFeatures])

  const focusedUf = useMemo(() => {
    if (mode !== 'brasil' || !resolvedSelected) return null
    if (stateFeatures.some((f) => f.properties.sigla === resolvedSelected)) {
      return resolvedSelected
    }
    const city = snapshot?.cidades[resolvedSelected]
    if (city?.uf) return city.uf
    return nameIndex[resolvedSelected]?.u ?? null
  }, [mode, resolvedSelected, snapshot, nameIndex, stateFeatures])

  /** UF sob hover (mapa ou badge lateral) — borda branca só aqui. */
  const hoveredUf = useMemo(() => {
    if (badgeHover?.kind === 'state') return badgeHover.sigla
    if (hover?.code.startsWith('UF:')) return hover.code.slice(3)
    return hover?.uf ?? null
  }, [badgeHover, hover])

  /** Conteúdo do popover custom por UF (quando fornecido). */
  const statePopoverNode =
    statePopover && hoveredUf ? statePopover(hoveredUf) : null

  /** UF com destaque de borda (selecionada/foco = forte, só hover = médio). */
  const highlightUf = useMemo(() => {    if (mode !== 'brasil') return null
    if (
      resolvedSelected &&
      stateFeatures.some((f) => f.properties.sigla === resolvedSelected)
    ) {
      return { sigla: resolvedSelected, strong: true }
    }
    if (focusedUf) return { sigla: focusedUf, strong: true }
    if (hoveredUf) return { sigla: hoveredUf, strong: false }
    return null
  }, [mode, resolvedSelected, stateFeatures, focusedUf, hoveredUf])

    const focusCityLabels = useMemo(() => {
    if (mode !== 'brasil' || !focusedUf || !snapshot) return []
    return Object.entries(snapshot.cidades)
      .filter(([, c]) => c.uf === focusedUf)
      .map(([code, c]) => ({
        code,
        name: toTitle(c.n || code),
        votes: c.vv ?? c.top[0]?.vap ?? 0,
        pos: cityCenters[code]
      }))
      .filter((c) => c.pos && c.votes > 0)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 6)
  }, [mode, focusedUf, snapshot, cityCenters])

  const scheduleClose = useCallback(() => {
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHover(null), 120)
  }, [])

  /** Hover via rAF com bail-out (sem mudança = sem render). */
  const queueHover = useCallback(
    (
      wrap: HTMLDivElement,
      e: React.MouseEvent<SVGSVGElement>,
      code: string,
      uf: string
    ) => {
      const rect = wrap.getBoundingClientRect()
      const next: HoverState = {
        code,
        uf,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
      if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current)
      hoverRaf.current = requestAnimationFrame(() => {
        hoverRaf.current = null
        setHover((prev) =>
          prev &&
          prev.code === next.code &&
          Math.abs(prev.x - next.x) < 2 &&
          Math.abs(prev.y - next.y) < 2
            ? prev
            : next
        )
      })
    },
    []
  )

  const handleSvgMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (dragging.current) return
      const el = e.target as Element | null
      const target = el?.closest?.('[data-city]') as Element | null
      const wrap = wrapRef.current
      if (!wrap) {
        scheduleClose()
        return
      }
      if (target) {
        if (closeTimer.current) window.clearTimeout(closeTimer.current)
        const code = target.getAttribute('data-city') ?? ''
        const uf = target.getAttribute('data-uf') ?? ''
        if (!code) return
        queueHover(wrap, e, code, uf)
        return
      }
      const stateEl = el?.closest?.('[data-state]') as Element | null
      if (stateEl && mode === 'brasil') {
        if (closeTimer.current) window.clearTimeout(closeTimer.current)
        const sigla = stateEl.getAttribute('data-state') ?? ''
        if (!sigla) {
          scheduleClose()
          return
        }
        queueHover(wrap, e, `UF:${sigla}`, sigla)
        return
      }
      scheduleClose()
    },
    [scheduleClose, mode, queueHover]
  )

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Após arrasto = pan.
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      const el = e.target as Element | null
      const target = el?.closest?.('[data-city]') as Element | null
      const stateEl =
        !target && mode === 'brasil'
          ? (el?.closest?.('[data-state]') as Element | null)
          : null
      const code = target
        ? (target.getAttribute('data-city') ?? '')
        : (stateEl?.getAttribute('data-state') ?? '')
      if (!target && !stateEl) {
        // Fundo vazio não mexe no zoom.
        setHover(null)
        setInternalSelected(null)
        onSelect?.(null)
        lastExternalZoom.current = null
        return
      }
      if (!code) return
      if (resolvedSelected === code) {
        setInternalSelected(null)
        onSelect?.(null)
        lastExternalZoom.current = null
        resetView()
        return
      }
      setHover(null)
      setInternalSelected(code)
      onSelect?.(code)
      lastExternalZoom.current = code
      if (stateEl) zoomToState(code)
      else zoomToCode(code)
    },
    [
      onSelect,
      resetView,
      resolvedSelected,
      zoomToCode,
      zoomToState,
      mode
    ]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      stopAnim()
      const svg = svgRef.current
      downRect.current = svg ? svg.getBoundingClientRect() : null
      svg?.classList.add('map-panning')
      pointers.current[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pointers.current)
      if (ids.length === 2) {
        const a = pointers.current[Number(ids[0])]
        const b = pointers.current[Number(ids[1])]
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2
        }
        dragging.current = true
        suppressClick.current = true
        setHover(null)
      } else if (ids.length === 1) {
        downPos.current = { x: e.clientX, y: e.clientY }
        dragging.current = false
      }
    },
    [stopAnim]
  )

  const handleWindowMove = useCallback(
    (e: PointerEvent) => {
      const pts = pointers.current
      if (!(e.pointerId in pts)) return
      const prev = pts[e.pointerId]
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }
      const rect = downRect.current
      if (!rect) return
      const ids = Object.keys(pts)
      const meet = Math.min(rect.width / VIEW_W, rect.height / VIEW_H)

      if (ids.length === 2 && pinch.current) {
        const a = pts[Number(ids[0])]
        const b = pts[Number(ids[1])]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const last = pinch.current
        if (last.dist > 0 && dist > 0) {
          const v = viewRef.current
          applyView(
            clampMode({
              scale: v.scale,
              tx: v.tx + (midX - last.midX) / meet,
              ty: v.ty + (midY - last.midY) / meet
            })
          )
          zoomAt(clientToViewBox(rect, midX, midY), dist / last.dist)
        }
        pinch.current = { dist, midX, midY }
        return
      }

      if (ids.length === 1 && downPos.current) {
        const moved = Math.hypot(
          e.clientX - downPos.current.x,
          e.clientY - downPos.current.y
        )
        if (!dragging.current && moved < 6) return
        if (!dragging.current) {
          dragging.current = true
          suppressClick.current = true
          setHover(null)
        }
        const v = viewRef.current
        applyView(
          clampMode({
            scale: v.scale,
            tx: v.tx + (e.clientX - prev.x) / meet,
            ty: v.ty + (e.clientY - prev.y) / meet
          })
        )
      }
    },
    [applyView, zoomAt]
  )

  const endPointer = useCallback((e: PointerEvent) => {
    delete pointers.current[e.pointerId]
    if (Object.keys(pointers.current).length < 2) pinch.current = null
    if (Object.keys(pointers.current).length === 0) {
      dragging.current = false
      downPos.current = null
      svgRef.current?.classList.remove('map-panning')
    }
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handleWindowMove)
    window.addEventListener('pointerup', endPointer)
    window.addEventListener('pointercancel', endPointer)
    return () => {
      window.removeEventListener('pointermove', handleWindowMove)
      window.removeEventListener('pointerup', endPointer)
      window.removeEventListener('pointercancel', endPointer)
    }
  }, [endPointer, handleWindowMove])

  // Nativo não-passivo p/ preventDefault (zoom sem rolar a página).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopAnim()
      zoomAt(
        clientToViewBox(svg.getBoundingClientRect(), e.clientX, e.clientY),
        Math.exp(-e.deltaY * 0.0016)
      )
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [stopAnim, zoomAt])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return
      // Nunca no fundo vazio.
      const el = e.target as Element | null
      const hit =
        el?.closest?.('[data-city]') ??
        (mode === 'brasil' ? el?.closest?.('[data-state]') : null)
      if (!hit) return
      stopAnim()
      zoomAt(
        clientToViewBox(svg.getBoundingClientRect(), e.clientX, e.clientY),
        1.8
      )
    },
    [stopAnim, zoomAt, mode]
  )

  const inlineUfs = stateFeatures
    .map((f) => f.properties.sigla)
    .filter((s) => !(SIDE_UFS as readonly string[]).includes(s))

  type SideBadge = {
    sigla: string
    text: string
    fill: string
    textFill: string
    y: number
  }

  const badges = useMemo<SideBadge[]>(() => {
    if (choropleth) return []
    if (mode !== 'brasil' || mapView === 'vantagem') return []
    return (SIDE_UFS as readonly string[]).flatMap((sigla, i) => {
      const y = badgeY(i)
      if (mapView === 'apurado') {
        const pst = snapshot?.ufs[sigla]?.pst
        if (pst == null) return []
        return [{
          sigla,
          text: `${Math.round(pst)}%`,
          fill: '#d6d6db',
          textFill: '#1a1a1a',
          y
        }]
      }
      if (mapView === 'candidato' && focusCand) {
        const s = ufCandShare[sigla]
        if (!s) return []
        return [{
          sigla,
          text: `${Math.round(s.pct)}%`,
          fill: shadeFor(focusCand.ramp, s.pct),
          textFill: '#fff',
          y
        }]
      }
      const r = ufLive?.ufs[sigla]
      if (!r) return []
      return [{
        sigla,
        text: `${Math.round(r.pct)}%`,
        fill: fillFor(r.winner, r.margin),
        textFill: '#fff',
        y
      }]
    })
  }, [mode, mapView, snapshot, focusCand, ufCandShare, ufLive, choropleth])

  /** UFs pequenas com foto de eleito: foto vai p/ badge lateral. */
  const photoBadgeSiglas = useMemo(
    () =>
      (SIDE_UFS as readonly string[]).filter(
        (s) => (choropleth?.photos?.[s]?.length ?? 0) > 0
      ),
    [choropleth]
  )

  const globeBadge = useMemo(() => {
    if (choropleth) return null
    if (mode !== 'brasil' || mapView === 'vantagem') return null
    if (mapView === 'apurado') {
      const pst = snapshot?.nacional.pst
      if (pst == null) return null
      return { text: `${Math.round(pst)}%`, fill: '#d6d6db', textFill: '#1a1a1a' }
    }
    if (mapView === 'candidato' && focusCand) {
      const nat = snapshot?.nacional.full?.find((c) => c.sq === focusCand.sq)
      const pct = nat ? share(nat.vap, snapshot?.nacional.vv ?? null) : 0
      return {
        text: `${Math.round(pct)}%`,
        fill: shadeFor(focusCand.ramp, pct),
        textFill: '#fff'
      }
    }
    if (ufLive?.nacionalPct == null) return null
    const extTotal = (exterior ?? globeData)?.total
    const extTop = extTotal?.top ?? []
    const extWinner =
      extTop.length > 0 ? winnerByParty(extTop[0].sg) : null
    const extFill =
      extWinner && extWinner !== 'outro'
        ? fillFor(extWinner, marginOf(extTop, extTotal?.vv ?? null))
        : '#713f12'
    return {
      text: `${Math.round(ufLive.nacionalPct)}%`,
      fill: extFill,
      textFill: '#fff'
    }
  }, [mode, mapView, snapshot, focusCand, ufLive, exterior, globeData, choropleth])

  /** Label do topo direito varia por modo/view (ver referências). */
  const topLabel = useMemo(() => {
    if (mode === 'exterior') {
      if (exteriorDots.length === 0) return null
      const tally: Record<Winner, number> = { flavio: 0, lula: 0, outro: 0 }
      for (const d of exteriorDots) tally[d.winner]++
      const ranked = (Object.entries(tally) as [Winner, number][])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
      if (ranked.length === 0) return null
      return {
        entries: ranked.map(([winner, count]) => ({
          sg: WINNER_SG[winner],
          count: formatIntBR(count),
          accent: WINNER_ACCENT[winner]
        })),
        unit: 'cidades',
        ramp: rampOf(ranked[0][0]),
        scaleText: 'até 10 · 25 · 45 · mais pontos' as string | null,
        spikes: false
      }
    }
    if (!ufLive || !snapshot) return null
    if (mapView === 'estados') {
      const tally: Record<Winner, number> = { flavio: 0, lula: 0, outro: 0 }
      for (const u of Object.values(ufLive.ufs)) tally[u.winner]++
      const ranked = (Object.entries(tally) as [Winner, number][])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
      if (ranked.length === 0) return null
      return {
        entries: ranked.map(([winner, count]) => ({
          sg: WINNER_SG[winner],
          count: formatIntBR(count),
          accent: WINNER_ACCENT[winner]
        })),
        unit: 'estados',
        ramp: rampOf(ranked[0][0]),
        scaleText: 'até 10 · 25 · 45 · mais pontos',
        spikes: false
      }
    }
    if (mapView === 'vantagem') {
      return {
        entries: [
          { sg: 'PL', count: formatMi(spikeData.flavioVotes), accent: PARTIES.PL.cor },
          { sg: 'PT', count: formatMi(spikeData.lulaVotes), accent: PARTIES.PT.cor }
        ],
        unit: '',
        ramp: BLUE_RAMP,
        scaleText: null,
        spikes: true
      }
    }
    if (mapView === 'apurado') {
      return {
        entries: [],
        unit: `${formatIntBR(apuradoStats.done)} de ${formatIntBR(apuradoStats.total)} municípios apurados`,
        ramp: APURADO_RAMP,
        scaleText: 'menos de 25%',
        spikes: false
      }
    }
    if (mapView === 'candidato' && focusCand) {
      const leaderSq = snapshot.nacional.top[0]?.sq
      if (focusCand.sq === leaderSq) {
        let n = 0
        for (const city of Object.values(snapshot.cidades)) {
          if (city.top[0]?.sq === focusCand.sq) n++
        }
        return {
          entries: [],
          unit: `À frente em ${formatIntBR(n)} municípios`,
          ramp: focusCand.ramp,
          scaleText: `menos de ${minCandShareText(snapshot, focusCand.sq)}%`,
          spikes: false
        }
      }
      let bestUf = ''
      let bestPct = -1
      for (const [uf, s] of Object.entries(ufCandShare)) {
        if (s.pct > bestPct) {
          bestPct = s.pct
          bestUf = uf
        }
      }
      const ufName =
        stateFeatures.find((f) => f.properties.sigla === bestUf)?.properties
          .nome ?? bestUf
      return {
        entries: [],
          unit: `Mais forte em ${ufName} · ${fmtPctShort(bestPct)}`,
          ramp: focusCand.ramp,
          scaleText: `menos de ${minCandShareText(snapshot, focusCand.sq)}%`,
        spikes: false
      }
    }
    const ranked = (Object.entries(cityWins) as [Winner, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
    if (ranked.length === 0) return null
    return {
      entries: ranked.map(([winner, count]) => ({
        sg: WINNER_SG[winner],
        count: formatIntBR(count),
        accent: WINNER_ACCENT[winner]
      })),
      unit: 'municípios',
      ramp: rampOf(ranked[0][0]),
      scaleText: 'até 10 · 25 · 45 · mais pontos',
      spikes: false
    }
  }, [mode, ufLive, exteriorDots, snapshot, view, focusCand, ufCandShare, cityWins, spikeData, apuradoStats, stateFeatures])

  return (
    <>
    {(filters || choropleth?.legend || topLabel) && (
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {filters}
        {choropleth?.legend ?? (topLabel && (
          <div className="border-woodsmoke-700 bg-woodsmoke-900/90 rounded-lg border px-2.5 py-1.5 shadow-xl backdrop-blur">
            <p className="flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap text-white tabular-nums">
              {topLabel.entries.map((e) => (
                <span key={e.sg} className="inline-flex items-center gap-1">
                  <i
                    className="inline-block h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: e.accent }}
                  />
                  {e.sg} {e.count}
                </span>
              ))}
              <span className="text-woodsmoke-400 font-semibold">
                {topLabel.unit}
              </span>
              {topLabel.spikes ? (
                <span
                  className="text-woodsmoke-500 inline-flex items-end gap-1 font-semibold"
                  aria-hidden="true"
                >
                  <i
                    className="inline-block h-1.5 w-1.5 bg-woodsmoke-500"
                    style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                  />
                  <span>10 mil</span>
                  <i
                    className="inline-block h-2.5 w-2.5 bg-woodsmoke-500"
                    style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                  />
                  <span>100 mil</span>
                  <i
                    className="inline-block h-4 w-4 bg-woodsmoke-500"
                    style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                  />
                  <span>500 mil</span>
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    {topLabel.ramp.map((color) => (
                      <i
                        key={color}
                        className="inline-block h-2 w-4 rounded-[2px]"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  {topLabel.scaleText && (
                    <span className="text-woodsmoke-500 font-semibold">
                      {topLabel.scaleText}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    )}
    <div
      ref={wrapRef}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl',
        className
      )}
    >
      <style>{MAP_LAYER_CSS}</style>

      <Popover.Root
        open={
          statePopover
            ? statePopoverNode !== null
            : (hover !== null || badgeHover !== null) && !suppressPopover
        }
        onOpenChange={(open) => {
          if (!open) {
            setHover(null)
            setBadgeHover(null)
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={
            mode === 'exterior'
              ? 'Mapa do mundo com o voto brasileiro no exterior. Arraste para navegar, use a roda para zoom, clique numa cidade para aproximar.'
              : 'Mapa do Brasil por município. Arraste para navegar, use a roda para zoom, clique num município para aproximar.'
          }
          className="block h-[clamp(400px,60vh,680px)] w-full touch-none cursor-default select-none active:cursor-grabbing xl:h-full"
          onMouseMove={handleSvgMove}
          onMouseLeave={scheduleClose}
          onClick={handleSvgClick}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setHover(null)
              if (viewRef.current.scale > 1) resetView()
            }
          }}
        >
          <g
            transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
          >
          {mode === 'exterior' && (
            <>
              {worldPaths.map((w) => (
                <path
                  key={w.key}
                  d={w.d}
                  fill="#17171a"
                  stroke="rgba(255,255,255,0.09)"
                  strokeWidth={0.6}
                  strokeLinejoin="round"
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <ExteriorDotsLayer
                dots={exteriorDots}
                hoverCode={hover?.code ?? null}
                selectedCode={resolvedSelected}
              />
              {exteriorLabels.map((d) => {
                const fs = 1 / view.scale
                return (
                  <text
                    key={`xlab-${d.code}`}
                    x={d.x + (d.r + 5) * fs}
                    y={d.y + 4 * fs}
                    fill="#e4e4e7"
                    fontSize={12 * fs}
                    fontWeight={600}
                    pointerEvents="none"
                    style={{
                      paintOrder: 'stroke',
                      stroke: '#0b0b0c',
                      strokeWidth: 3 * fs
                    }}
                  >
                    {d.name.charAt(0) + d.name.slice(1).toLowerCase()}
                  </text>
                )
              })}
            </>
          )}
          {mode === 'brasil' && (
            <>
          {statePaths.map((s) => {
            const r = ufLive?.ufs[s.sigla]
            const dimmed = focusedUf && s.sigla !== focusedUf
            const softState = !!choropleth?.soft?.includes(s.sigla)
            const baseFill = choropleth
              ? (choropleth.fills[s.sigla] ?? '#27272a')
              : '#27272a'
            return (
              <path
                key={`base-${s.sigla}`}
                d={s.d}
                data-uf={s.sigla}
                data-state={s.sigla}
                fill={
                  choropleth
                    ? softState
                      ? tintWithWhite(baseFill, 0.45)
                      : baseFill
                    : mapView === 'vantagem'
                      ? '#141416'
                      : r
                        ? fillFor(r.winner, r.margin)
                        : '#27272a'
                }
                fillOpacity={dimmed ? 0.25 : 1}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={0.9}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="map-city"
              />
            )
          })}

          {choropleth?.split &&
            Object.entries(choropleth.split).map(([sigla, pair]) => {
              const s = statePaths.find((x) => x.sigla === sigla)
              const box = stateBoxes[sigla]
              if (!s || !box) return null
              return (
                <g key={`split-${sigla}`} pointerEvents="none">
                  <clipPath id={`splitclip-${sigla}`}>
                    <polygon
                      points={`${box.minX},${box.maxY} ${box.maxX},${box.maxY} ${box.maxX},${box.minY}`}
                    />
                  </clipPath>
                  <path
                    d={s.d}
                    fill={pair[1]}
                    clipPath={`url(#splitclip-${sigla})`}
                  />
                </g>
              )
            })}

          {choropleth?.photos &&
            Object.entries(choropleth.photos).map(([sigla, urls]) => {
              const a = stateAnchors[sigla]
              if (!a || urls.length === 0) return null
              if (photoBadgeSiglas.includes(sigla)) return null
              const shown = urls.slice(0, 2)
              return (
                <g key={`senph-${sigla}`} pointerEvents="none">
                  {shown.map((url, i) => {
                    const cx =
                      shown.length === 1 ? a.x : a.x + (i === 0 ? -13 : 13)
                    const cy = a.y - 10
                    return (
                      <g key={i}>
                        <clipPath id={`senclip-${sigla}-${i}`}>
                          <circle cx={cx} cy={cy} r={18} />
                        </clipPath>
                        <image
                          href={url}
                          x={cx - 18}
                          y={cy - 18}
                          width={36}
                          height={36}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#senclip-${sigla}-${i})`}
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={18}
                          fill="none"
                          stroke="#fff"
                          strokeWidth={3}
                        />
                      </g>
                    )
                  })}
                </g>
              )
            })}

          {(mapView === 'municipios' ||
            mapView === 'apurado' ||
            mapView === 'candidato' ||
            focusedUf) && (
            <MunicipalitiesLayer
              paths={municipalityPaths}
              selectedCode={resolvedSelected}
              focusUf={focusedUf}
              scale={view.scale}
            />
          )}

          {focusedUf &&
            focusCityLabels.map((c) => {
              const fs = 1 / view.scale
              return (
                <g key={`fcity-${c.code}`} pointerEvents="none">
                  <circle
                    cx={c.pos.x}
                    cy={c.pos.y}
                    r={2.2 * fs}
                    fill="#fff"
                  />
                  <text
                    x={c.pos.x + 6 * fs}
                    y={c.pos.y + 4 * fs}
                    fill="#e4e4e7"
                    fontSize={12 * fs}
                    fontWeight={600}
                    style={{
                      paintOrder: 'stroke',
                      stroke: '#0b0b0c',
                      strokeWidth: 3 * fs
                    }}
                  >
                    {c.name}
                  </text>
                </g>
              )
            })}

          {mapView === 'vantagem' && (
            <SpikesLayer
              spikes={spikeData.spikes}
              selectedCode={resolvedSelected}
            />
          )}

          {statePaths.map((s) => (
            <path
              key={`border-${s.sigla}`}
              d={s.d}
              fill="none"
              stroke={
                mapView === 'vantagem'
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(0,0,0,0.6)'
              }
              strokeWidth={0.9}
              strokeLinejoin="round"
              pointerEvents="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {(() => {
            const s =
              highlightUf &&
              statePaths.find((x) => x.sigla === highlightUf.sigla)
            if (!s || !highlightUf) return null
            return (
              <g key={`hl-${s.sigla}`} pointerEvents="none">
                <clipPath id={`hlclip-${s.sigla}`}>
                  <path d={s.d} />
                </clipPath>
                <path
                  d={s.d}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={highlightUf.strong ? 4 : 3}
                  strokeLinejoin="round"
                  clipPath={`url(#hlclip-${s.sigla})`}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })()}
          </>)}

          {(() => {
            if (!hoveredPath) return null
            const box = pathBBox(hoveredPath.d)
            const tiny =
              box != null &&
              Math.min(box.maxX - box.minX, box.maxY - box.minY) *
                view.scale <
                HIGHLIGHT_DOT_PX
            if (tiny && box) {
              return (
                <g key={`hldot-${hoveredPath.code}`} pointerEvents="none">
                  <path
                    d={hoveredPath.d}
                    fill={hoveredPath.fill}
                    fillOpacity={0.92}
                  >
                    <title>{hoveredName}</title>
                  </path>
                  <circle
                    cx={(box.minX + box.maxX) / 2}
                    cy={(box.minY + box.maxY) / 2}
                    r={3 / view.scale}
                    fill="#fff"
                  />
                </g>
              )
            }
            return (
              <g key={`hl-${hoveredPath.code}`} pointerEvents="none">
                <clipPath id={`hlclip-city-${hoveredPath.code}`}>
                  <path d={hoveredPath.d} />
                </clipPath>
                <path
                  d={hoveredPath.d}
                  fill={hoveredPath.fill}
                  fillOpacity={0.92}
                />
                <path
                  d={hoveredPath.d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  clipPath={`url(#hlclip-city-${hoveredPath.code})`}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{hoveredName}</title>
                </path>
              </g>
            )
          })()}

          {mode === 'brasil' && mapView !== 'vantagem' && (
          <g
            style={{
              opacity: view.scale < 1.3 ? 1 : 0,
              transition: 'opacity .3s'
            }}
          >
          {(SIDE_UFS as readonly string[]).map((sigla, i) => {
            const anchor = stateAnchors[sigla]
            if (!anchor) return null
            if (choropleth && !photoBadgeSiglas.includes(sigla)) return null
            const y = badgeY(i)
            const activeUf =
              badgeHover?.kind === 'state'
                ? badgeHover.sigla
                : hover?.code.startsWith('UF:')
                  ? hover.code.slice(3)
                  : hover?.uf || null
            const hot = activeUf === sigla
            return (
              <g key={`line-${sigla}`} pointerEvents="none">
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={796}
                  y2={y + 13}
                  stroke={hot ? '#fff' : '#52525b'}
                  strokeWidth={hot ? 1.6 : 1}
                  strokeOpacity={hot ? 1 : 0.8}
                />
                <circle
                  cx={anchor.x}
                  cy={anchor.y}
                  r={2.4}
                  fill="none"
                  stroke={hot ? '#fff' : '#a1a1aa'}
                  strokeWidth={hot ? 1.6 : 1}
                />
              </g>
            )
          })}

          {view.scale <= 2.2 &&
            inlineUfs.map((sigla) => {
              const anchor = stateAnchors[sigla]
              if (!anchor) return null
              const fs = 1 / view.scale
              if (mapView === 'apurado') {
                const pst = snapshot?.ufs[sigla]?.pst
                if (pst == null) return null
                return (
                  <g
                    key={`label-${sigla}`}
                    pointerEvents="none"
                    style={{
                      paintOrder: 'stroke',
                      stroke: '#e4e4e7',
                      strokeWidth: 3 * fs
                    }}
                  >
                    <text
                      x={anchor.x}
                      y={anchor.y - 4 * fs}
                      textAnchor="middle"
                      fill="#18181b"
                      fontSize={13 * fs}
                      fontWeight={800}
                      style={{ stroke: 'none' }}
                    >
                      {sigla}
                    </text>
                    <text
                      x={anchor.x}
                      y={anchor.y + 11 * fs}
                      textAnchor="middle"
                      fill="#3f3f46"
                      fontSize={11 * fs}
                      fontWeight={600}
                      style={{ stroke: 'none' }}
                    >
                      {Math.round(pst)}%
                    </text>
                  </g>
                )
              }
              if (mapView === 'candidato' && focusCand) {
                const s = ufCandShare[sigla]
                if (!s) return null
                const dot =
                  focusCand.sg === 'PL'
                    ? PARTIES.PL.cor
                    : focusCand.sg === 'PT'
                      ? PARTIES.PT.cor
                      : '#eab308'
                return (
                  <g
                    key={`label-${sigla}`}
                    pointerEvents="none"
                    style={{
                      paintOrder: 'stroke',
                      stroke: '#0b0b0c',
                      strokeWidth: 3 * fs
                    }}
                  >
                    <text
                      x={anchor.x}
                      y={anchor.y - 4 * fs}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize={13 * fs}
                      fontWeight={800}
                      style={{ stroke: 'none' }}
                    >
                      {sigla}
                    </text>
                    <text
                      x={anchor.x}
                      y={anchor.y + 11 * fs}
                      textAnchor="middle"
                      fill="#e4e4e7"
                      fontSize={11 * fs}
                      fontWeight={600}
                      style={{ stroke: 'none' }}
                    >
                      <tspan fill={dot}>▪ </tspan>
                      {Math.round(s.pct)}%
                    </text>
                  </g>
                )
              }
              const r = ufLive?.ufs[sigla]
              if (choropleth && !r) {
                const sub = choropleth.labels?.[sigla]
                const hasPhotos =
                  (choropleth.photos?.[sigla]?.length ?? 0) > 0
                return (
                  <g key={`label-${sigla}`} pointerEvents="none">
                    <text
                      x={anchor.x}
                      y={hasPhotos ? anchor.y + 26 * fs : anchor.y - 4 * fs}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize={13 * fs}
                      fontWeight={800}
                    >
                      {sigla}
                    </text>
                    {sub && (
                      <text
                        x={anchor.x}
                        y={hasPhotos ? anchor.y + 41 * fs : anchor.y + 11 * fs}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={11 * fs}
                        fontWeight={700}
                      >
                        {sub}
                      </text>
                    )}
                  </g>
                )
              }
              if (!r) return null
              const dot =
                r.winner === 'flavio'
                  ? WINNER_COLORS_LIGHT.flavio
                  : r.winner === 'lula'
                    ? WINNER_COLORS_LIGHT.lula
                    : WINNER_COLORS_LIGHT.outro
              return (
                <g
                  key={`label-${sigla}`}
                  pointerEvents="none"
                  style={{
                    paintOrder: 'stroke',
                    stroke: '#0b0b0c',
                    strokeWidth: 3 * fs
                  }}
                >
                  <text
                    x={anchor.x}
                    y={anchor.y - 4 * fs}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={13 * fs}
                    fontWeight={800}
                    style={{ stroke: 'none' }}
                  >
                    {sigla}
                  </text>
                  <text
                    x={anchor.x}
                    y={anchor.y + 11 * fs}
                    textAnchor="middle"
                    fill="#e4e4e7"
                    fontSize={11 * fs}
                    fontWeight={600}
                    style={{ stroke: 'none' }}
                  >
                    <tspan fill={dot}>▪ </tspan>
                    {Math.round(r.pct)}%
                  </text>
                </g>
              )
            })}
          </g>
          )}

          {mode === 'brasil' &&
          badges.map((b) => {
            const hot =
              badgeHover?.kind === 'state' && badgeHover.sigla === b.sigla
            return (
            <g
              key={`badge-${b.sigla}`}
              role="button"
              tabIndex={0}
              aria-label={`Ver ${b.sigla}`}
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => handleBadgeEnter(b.sigla, b.y + 13)}
              onMouseLeave={clearBadgeHover}
              onFocus={() => handleBadgeEnter(b.sigla, b.y + 13)}
              onBlur={clearBadgeHover}
              onClick={() => handleBadgeActivate(b.sigla)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleBadgeActivate(b.sigla)
                }
              }}
            >
              <rect
                x={800}
                y={b.y}
                width={92}
                height={26}
                rx={4}
                fill={b.fill}
                stroke={hot ? '#fff' : b.fill}
                strokeOpacity={hot ? 1 : 0.45}
                strokeWidth={hot ? 1.6 : 1}
              />
              <text
                x={812}
                y={b.y + 17}
                fill={b.textFill}
                fontSize={12}
                fontWeight={800}
              >
                {b.sigla}
              </text>
              <text
                x={880}
                y={b.y + 17}
                fill={b.textFill}
                fontSize={12}
                fontWeight={700}
                textAnchor="end"
              >
                {b.text}
              </text>
            </g>
            )
          })}

          {choropleth &&
          photoBadgeSiglas.map((sigla) => {
            const idx = (SIDE_UFS as readonly string[]).indexOf(sigla)
            const y = badgeY(idx)
            const urls = (choropleth.photos?.[sigla] ?? []).slice(0, 2)
            const hot =
              badgeHover?.kind === 'state' && badgeHover.sigla === sigla
            return (
            <g
              key={`senbadge-${sigla}`}
              role="button"
              tabIndex={0}
              aria-label={`Ver ${sigla}`}
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => handleBadgeEnter(sigla, y + 13)}
              onMouseLeave={clearBadgeHover}
              onFocus={() => handleBadgeEnter(sigla, y + 13)}
              onBlur={clearBadgeHover}
              onClick={() => handleBadgeActivate(sigla)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleBadgeActivate(sigla)
                }
              }}
            >
              <rect
                x={800}
                y={y}
                width={92}
                height={26}
                rx={4}
                fill={choropleth.fills[sigla] ?? '#27272a'}
                stroke={hot ? '#fff' : '#00000073'}
                strokeWidth={hot ? 1.6 : 1}
              />
              {urls.map((url, i) => {
                const cx = urls.length === 1 ? 822 : 813 + i * 16
                return (
                  <g key={i}>
                    <clipPath id={`senbclip-${sigla}-${i}`}>
                      <circle cx={cx} cy={y + 13} r={8.5} />
                    </clipPath>
                    <image
                      href={url}
                      x={cx - 8.5}
                      y={y + 4.5}
                      width={17}
                      height={17}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#senbclip-${sigla}-${i})`}
                    />
                    <circle
                      cx={cx}
                      cy={y + 13}
                      r={8.5}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  </g>
                )
              })}
              <text
                x={884}
                y={y + 17}
                fill="#fff"
                fontSize={12}
                fontWeight={800}
                textAnchor="end"
              >
                {sigla}
              </text>
            </g>
            )
          })}

          {mode === 'brasil' && globeBadge && (
          <g
            role="button"
            tabIndex={0}
            aria-label="Ver voto no exterior"
            style={{ cursor: 'pointer', outline: 'none' }}
            onMouseEnter={handleGlobeEnter}
            onMouseLeave={clearBadgeHover}
            onFocus={handleGlobeEnter}
            onBlur={clearBadgeHover}
          >
            <rect
              x={800}
              y={GLOBE_Y}
              width={92}
              height={26}
              rx={4}
              fill={mapView === 'apurado' ? '#d6d6db' : (globeBadge?.fill ?? '#713f12')}
              stroke={
                badgeHover?.kind === 'globe'
                  ? '#fff'
                  : mapView === 'apurado'
                    ? '#d6d6db'
                    : (globeBadge?.fill ?? '#a16207')
              }
              strokeOpacity={badgeHover?.kind === 'globe' ? 1 : 0.5}
              strokeWidth={badgeHover?.kind === 'globe' ? 1.6 : 1}
            />
            <text x={812} y={GLOBE_Y + 17} fontSize={12}>
              🌐
            </text>
            <text
              x={880}
              y={GLOBE_Y + 17}
              fill={mapView === 'apurado' ? '#1a1a1a' : '#fff'}
              fontSize={12}
              fontWeight={700}
              textAnchor="end"
            >
              {globeBadge.text}
            </text>
          </g>
          )}
          </g>
        </svg>

        <Popover.Content
          x={hover?.x ?? badgeHover?.x}
          y={hover?.y ?? badgeHover?.y}
          side={!hover && badgeHover ? 'left' : undefined}
          sideOffset={12}
          clampWidth={size.w || undefined}
          clampHeight={size.h || undefined}
          className="pointer-events-none"
        >
          {statePopover ? (
            hover && !hover.code.startsWith('UF:') && hoverCity ? (
              <CityPopoverCard city={hoverCity} />
            ) : (
              statePopoverNode
            )
          ) : (
            (hoverCity ?? badgeCity) && (
              <CityPopoverCard city={(hoverCity ?? badgeCity)!} />
            )
          )}
        </Popover.Content>
      </Popover.Root>

      {loadingMun && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          Carregando mapa (IBGE)…
        </p>
      )}
      {!loadingMun && mode === 'brasil' && !snapshot && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          {resultsError
            ? 'TSE indisponível no momento — tentando de novo…'
            : `Carregando resultados TSE 2026 · ${turnoLabel(turno)}…`}
        </p>
      )}
      {!loadingMun && mode === 'exterior' && !exterior && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          Carregando voto no exterior (TSE 2026 · {turnoLabel(turno)})…
        </p>
      )}
      {!loadingMun && selectedCityName && (
        <p className="text-woodsmoke-300 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-xs">
          Selecionado: <strong className="text-white">{selectedCityName}</strong>
        </p>
      )}

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Aproximar"
          onClick={() => zoomStep(1.6)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-lg leading-none font-bold text-white backdrop-blur transition hover:bg-black/80"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Afastar"
          onClick={() => zoomStep(1 / 1.6)}
          disabled={view.scale <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-lg leading-none font-bold text-white backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/60"
        >
          −
        </button>
        <button
          type="button"
          aria-label={mode === 'exterior' ? 'Ver o mundo inteiro' : 'Ver o Brasil inteiro'}
          title={mode === 'exterior' ? 'Ver o mundo inteiro' : 'Ver o Brasil inteiro'}
          onClick={() => resetView()}
          disabled={view.scale <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-base leading-none text-white backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/60"
        >
          ↺
        </button>
      </div>
    </div>
    </>
  )
}

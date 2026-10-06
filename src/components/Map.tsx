'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { motion } from 'motion/react'
import { cn } from 'tailwind-variants'

import { Popover } from './Popover'

/* -------------------------------------------------------------------------- */
/*                                    Tipos                                   */
/* -------------------------------------------------------------------------- */

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

/** Cidade do exterior com coordenadas (public/maps/exterior-cities.json). */
export type ExteriorPlace = {
  tse: string
  name: string
  country: string
  lon: number
  lat: number
}

type Winner = 'flavio' | 'lula' | 'outro'

export type MapProps = {
  /** Código IBGE do município selecionado (ou sigla da UF — compatível). */
  selected?: string | null
  onSelect?: (selection: string | null) => void
  /**
   * Agregado live do TSE. Quando fornecido, o Map não busca sozinho
   * (permite compartilhar 1 único fetch com outros componentes, ex.:
   * CommandPalette). Quando omitido, o Map busca internamente.
   */
  results?: TseSnapshot | null
  /** 'brasil' = municípios; 'exterior' = voto no exterior (bolhas). */
  mode?: MapMode
  /**
   * Agregado live do exterior (rota /api/elections/exterior).
   * Usado quando `mode === 'exterior'`.
   */
  exterior?: ExteriorSnapshot | null
  /** Troca de abrangência (toggle Brasil/Exterior). */
  onModeChange?: (mode: MapMode) => void
  className?: string
}

type HoverState = {
  code: string
  uf: string
  x: number
  y: number
}

/* -------------------------------------------------------------------------- */
/*              Resultados AO VIVO — TSE 2026, 1º turno, Presidente           */
/* -------------------------------------------------------------------------- */

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
}

export type TsePlace = TseSections & {
  top: TseCandidate[]
}

export type TseCity = TsePlace & {
  tse: string
  n: string
  uf: string
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
  nacional: TsePlace
  ufs: Record<string, TsePlace>
  cidades: Record<string, TseCity>
}

/** Agregado live servido pela rota /api/elections/municipalities. Sem cache: busca fresco no TSE a cada montagem. */
function loadResults(): Promise<TseSnapshot | null> {
  return fetch('/api/elections/municipalities', { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((d) => d as TseSnapshot)
    .catch(() => null)
}

/** % de votos a partir de votos/válidos (mesma conta do TSE). */
function share(vap: number, vv: number | null): number {
  if (!vv || vv <= 0) return 0
  return Math.round((vap / vv) * 1000) / 10
}

/** Vencedor por identidade: os 2 primeiros no país definem azul/vermelho. */
function winnerOf(
  sq: string,
  firstSq: string | undefined,
  secondSq: string | undefined
): Winner {
  if (firstSq && sq === firstSq) return 'flavio'
  if (secondSq && sq === secondSq) return 'lula'
  return 'outro'
}

/**
 * Identidade fixa por partido (uso no exterior): o ranking nacional muda
 * fora do Brasil (Lula lidera), então a cor é ancorada na sigla —
 * PL (Flávio) = azul, PT (Lula) = vermelho — e não na posição.
 */
function winnerByParty(sg: string): Winner {
  if (sg === 'PL') return 'flavio'
  if (sg === 'PT') return 'lula'
  return 'outro'
}

// (mock anterior removido: os dados agora vêm ao vivo do TSE)

/** UFs com chamada lateral (como na imagem) em vez de rótulo interno. */
const SIDE_UFS = ['RN', 'PB', 'PE', 'AL', 'SE', 'ES', 'RJ'] as const

/* -------------------------------------------------------------------------- */
/*                                 Geo helpers                                */
/* -------------------------------------------------------------------------- */

const VIEW_W = 1000
const VIEW_H = 700
const MAP_W = 730
const MAP_H = 660
const MAP_PAD = 12

/**
 * Transform de viewport (zoom/pan futuro). Hoje sempre identidade: o zoom
 * será aplicado como `transform` CSS no `<g>` das camadas (compositado na
 * GPU, sem re-render) e o picking usará `unprojectLonLat` abaixo.
 */
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

/** Inverso da projeção: ponto da tela -> lon/lat (picking futuro do zoom/pan). */
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

/* -------------------------------------------------------------------------- */
/*                          View (zoom/pan) — helpers                          */
/* -------------------------------------------------------------------------- */

export type ViewState = {
  scale: number
  tx: number
  ty: number
}

const IDENTITY_ZOOM: ViewState = { scale: 1, tx: 0, ty: 0 }
const MIN_SCALE = 1
const MAX_SCALE = 8
/** Centro da área do mapa (região 0..MAP_W) em coords do viewBox. */
const MAP_CENTER: [number, number] = [MAP_W / 2, MAP_H / 2]

/** Limita pan para o mapa não fugir da viewport. */
function clampView(v: ViewState): ViewState {
  if (v.scale <= MIN_SCALE) return { ...IDENTITY_ZOOM }
  const s = Math.min(Math.max(v.scale, MIN_SCALE), MAX_SCALE)
  const margin = 120
  return {
    scale: s,
    tx: Math.min(Math.max(v.tx, VIEW_W - MAP_W * s - margin), margin),
    ty: Math.min(Math.max(v.ty, VIEW_H - MAP_H * s - margin), margin)
  }
}

/** Ponto do cursor (client) -> coords do viewBox, respeitando o `meet`. */
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

/** Tween com easeOutCubic; retorna função de cancelamento. */
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

/** "FLAVIO BOLSONARO" -> "Flavio Bolsonaro" (nomes do TSE vêm em maiúsculas). */
function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fillFor(winner: Winner, pct: number): string {
  if (winner === 'flavio') {
    if (pct >= 60) return '#2563eb'
    if (pct >= 55) return '#2f4fd0'
    if (pct >= 52) return '#2c3fa0'
    return '#26346f'
  }
  if (winner === 'lula') {
    if (pct >= 60) return '#dc2626'
    if (pct >= 55) return '#b91c1c'
    if (pct >= 52) return '#8f2b2b'
    return '#6b2b2b'
  }
  if (pct >= 60) return '#4b5563'
  if (pct >= 55) return '#3f4753'
  if (pct >= 52) return '#353c47'
  return '#2b313b'
}

/* -------------------------------------------------------------------------- */
/*                           Resultado por município                          */
/* -------------------------------------------------------------------------- */

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
  candidates: CityCandidate[]
}

/** Monta o resultado da cidade a partir do snapshot live do TSE. */
function getCityResult(
  snapshot: TseSnapshot,
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
  const accentOf = (w: Winner) =>
    w === 'flavio' ? '#5b8def' : w === 'lula' ? '#f87171' : '#9ca3af'
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
    candidates
  }
}

/* -------------------------------------------------------------------------- */
/*                        Card do popover (fiel à imagem)                     */
/* -------------------------------------------------------------------------- */

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
      : 'Apuração TSE 2026 · 1º turno'

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
      </Popover.Body>

      <Popover.Footer className="text-[11px]">
        <span className="text-woodsmoke-400 font-semibold">
          Votos válidos
        </span>
        <span className="text-woodsmoke-300 ml-1 tabular-nums">
          {fmtInt(city.validVotes)}
        </span>
      </Popover.Footer>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*              Camada de municípios isolada (não re-renderiza no hover)      */
/* -------------------------------------------------------------------------- */

type MunicipalityPath = {
  code: string
  uf: string
  d: string
  fill: string
}

/** CSS estático fora do render: highlight de hover 100% via CSS, sem React. */
const MAP_LAYER_CSS = `.map-city{cursor:pointer}.map-city:hover{stroke:#fff!important;stroke-width:1.4!important}`

/**
 * Os 5,7k paths vivem aqui. Como as props são estáveis (array memoizado +
 * apenas `selectedCode`, que só muda no clique), o hover do mouse — que
 * atualiza estado no componente pai — nunca reconcilia essa subárvore.
 */
const MunicipalitiesLayer = memo(function MunicipalitiesLayer({
  paths,
  selectedCode
}: {
  paths: MunicipalityPath[]
  selectedCode: string | null
}) {
  return (
    <g>
      {paths.map((m) => (
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
          style={
            selectedCode === m.code
              ? { stroke: '#fff', strokeWidth: 1.6 }
              : undefined
          }
        />
      ))}
    </g>
  )
})

/* -------------------------------------------------------------------------- */
/*                    Modo exterior: projeção + bolhas                         */
/* -------------------------------------------------------------------------- */

/** Equiretangular 2:1 centralizado no viewBox 1000x700. */
const WORLD_W = 1000
const WORLD_H = 500
const WORLD_Y0 = 100

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

/** CityResult de uma cidade do exterior (mesmo card do popover). */
function getExteriorCityResult(
  snapshot: ExteriorSnapshot,
  place: ExteriorPlace
): CityResult | null {
  const c = snapshot.cidades[place.tse]
  if (!c || c.top.length === 0) return null
  const accentOf = (w: Winner) =>
    w === 'flavio' ? '#5b8def' : w === 'lula' ? '#f87171' : '#9ca3af'
  return {
    code: place.tse,
    name: toTitle(place.name),
    uf: place.country,
    sectionsPct: c.pst,
    sectionsDone: c.st,
    sectionsTotal: c.ts,
    validVotes: c.vv,
    candidates: c.top.slice(0, 2).map((t) => {
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
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Map                                     */
/* -------------------------------------------------------------------------- */

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

export function Map({ selected, onSelect, results, mode = 'brasil', exterior, onModeChange, className }: MapProps) {
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
  const [loadingMun, setLoadingMun] = useState(true)
  const [internalResults, setInternalResults] = useState<TseSnapshot | null>(
    null
  )
  const [resultsError, setResultsError] = useState(false)
  /** Controlado (via prop) ou interno: 1 única fonte de verdade. */
  const snapshot = results !== undefined ? results : internalResults
  const [hover, setHover] = useState<HoverState | null>(null)
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

  const animateViewTo = useCallback(
    (to: ViewState, duration = 450) => {
      stopAnim()
      const from = viewRef.current
      animCancel.current = tweenView(from, clampView(to), duration, applyView)
    },
    [applyView, stopAnim]
  )

  const resolvedSelected = selected ?? internalSelected

  useEffect(() => {
    let alive = true
    Promise.all([
      loadMunicipalities(),
      loadMunicipalityIndex(),
      loadStates(),
      loadWorld(),
      loadExteriorPlaces()
    ]).then(([mun, idx, states, world, places]) => {
      if (!alive) return
      setMunicipalities(mun)
      setNameIndex(idx)
      setStateFeatures(states)
      setWorldFeatures(world)
      setExteriorPlaces(places)
      setLoadingMun(false)
    })
    return () => {
      alive = false
    }
  }, [])

  // Busca interna do agregado live — só no modo não-controlado.
  useEffect(() => {
    if (results !== undefined) return
    let alive = true
    loadResults().then((snap) => {
      if (!alive) return
      if (snap) {
        setInternalResults(snap)
      } else {
        setResultsError(true)
        // Uma nova tentativa silenciosa (TSE pode oscilar no pico).
        window.setTimeout(() => {
          if (!alive) return
          loadResults().then((retry) => {
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
  }, [results])

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

  // Cancela hover/animação pendentes ao desmontar.
  useEffect(
    () => () => {
      if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (animCancel.current) animCancel.current()
    },
    []
  )

  /* Projeção lon/lat -> coordenadas do viewBox (área do mapa). */
  const projection = useMemo(() => {
    // Antes das UFs carregarem (/maps/brazil-states.json), usa o bbox
    // aproximado do Brasil para não gerar NaN nos paths.
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

  /* Centroide (bbox do maior polígono) de cada UF — âncora de rótulos/linhas. */
  const stateAnchors = useMemo(() => {
    const { project } = projection
    const anchors: Record<string, { x: number; y: number }> = {}
    for (const f of stateFeatures) {
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
        boxes.push({
          area: (maxX - minX) * (maxY - minY),
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2
        })
      })
      boxes.sort((a, b) => b.area - a.area)
      if (boxes[0]) {
        anchors[f.properties.sigla] = { x: boxes[0].cx, y: boxes[0].cy }
      }
    }
    return anchors
  }, [projection])

  /* Vencedor por UF a partir do agregado live (top-1 de cada UF). */
  const ufLive = useMemo(() => {
    if (!snapshot) return null
    const firstSq = snapshot.nacional.top[0]?.sq
    const secondSq = snapshot.nacional.top[1]?.sq
    const out: Record<string, { winner: Winner; pct: number }> = {}
    for (const [uf, place] of Object.entries(snapshot.ufs)) {
      const top1 = place.top[0]
      if (!top1) continue
      out[uf] = {
        winner: winnerOf(top1.sq, firstSq, secondSq),
        pct: share(top1.vap, place.vv)
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

  /* Paths dos municípios: cor pelo vencedor real (top-1 de cada cidade). */
  const municipalityPaths = useMemo(() => {
    if (municipalities.length === 0 || !snapshot || !ufLive) return []
    return municipalities.map((f) => {
      const code = f.properties.codarea
      const city = snapshot.cidades[code]
      const uf = city?.uf ?? nameIndex[code]?.u ?? ''
      const top1 = city?.top[0]
      let winner: Winner
      let pct: number
      if (top1) {
        winner = winnerOf(top1.sq, ufLive.firstSq, ufLive.secondSq)
        pct = share(top1.vap, city.vv)
      } else {
        // Cidade sem dado municipal: herda a cor da UF.
        const base = ufLive.ufs[uf] ?? { winner: 'outro' as Winner, pct: 50 }
        winner = base.winner
        pct = base.pct
      }
      return {
        code,
        uf,
        d: geometryToPath(f.geometry),
        fill: fillFor(winner, pct)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalities, nameIndex, projection, snapshot, ufLive])

  /** Lookup O(1) para o overlay da cidade em hover (sem varrer 5,7k paths). */
  const pathByCode = useMemo(() => {
    const idx: Record<string, MunicipalityPath> = {}
    for (const m of municipalityPaths) idx[m.code] = m
    return idx
  }, [municipalityPaths])

  /** Feature por código (zoom ao clicar). Só referencia o array existente. */
  const munByCode = useMemo(() => {
    const idx: Record<string, MunFeature> = {}
    for (const f of municipalities) idx[f.properties.codarea] = f
    return idx
  }, [municipalities])

  /** Bbox do município em coords do viewBox (base, sem transform). */
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

  /** Zoom animado para um ponto (coords viewBox) por um fator. */
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
        clampView({
          scale: Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE),
          tx: point[0] - (point[0] - v.tx) * k,
          ty: point[1] - (point[1] - v.ty) * k
        })
      )
    },
    [applyView, stopAnim]
  )

  /** Enquadra o município: centro em MAP_CENTER com margem. */
  const zoomToCode = useCallback(
    (code: string) => {
      const bbox = bboxOfCode(code)
      if (!bbox) return
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
    [animateViewTo, bboxOfCode]
  )

  const resetView = useCallback(
    (duration = 450) => {
      animateViewTo({ ...IDENTITY_ZOOM }, duration)
    },
    [animateViewTo]
  )

  /** Passo de zoom pelos botões, centrado na área do mapa. */
  const zoomStep = useCallback(
    (factor: number) => {
      stopAnim()
      zoomAt(MAP_CENTER, factor)
    },
    [stopAnim, zoomAt]
  )

  /* ------------------------- Modo exterior ------------------------- */

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

  /** Bolhas das cidades do exterior: posição + raio por votos + cor por vencedor. */
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
      const [x, y] = projectWorld(p.lon, p.lat)
      return {
        code: p.tse,
        name: toTitle(p.name),
        country: p.country,
        x,
        y,
        r: Math.round((2.5 + 9 * Math.sqrt(top1.vap / maxVotes)) * 10) / 10,
        fill: fillFor(winner, pct),
        votes: top1.vap,
        winner,
        pct
      }
    })
  }, [exterior, exteriorPlaces])

  /** Rótulos das maiores cidades (como na imagem: Lisboa, Londres…). */
  const exteriorLabels = useMemo(
    () =>
      [...exteriorDots].sort((a, b) => b.votes - a.votes).slice(0, 6),
    [exteriorDots]
  )

  /** Aproxima de uma cidade do exterior (ponto fixo, sem bbox). */
  const zoomToExteriorPoint = useCallback(
    (code: string) => {
      const p = placeByTse[code]
      if (!p) return
      const [x, y] = projectWorld(p.lon, p.lat)
      const scale = 4.5
      animateViewTo({
        scale,
        tx: MAP_CENTER[0] - x * scale,
        ty: MAP_CENTER[1] - y * scale
      })
    },
    [animateViewTo, placeByTse]
  )

  const zoomToSelectedCode = useCallback(
    (code: string) => {
      if (mode === 'exterior') zoomToExteriorPoint(code)
      else zoomToCode(code)
    },
    [mode, zoomToCode, zoomToExteriorPoint]
  )

  // Seleção externa (ex.: CommandPalette): aproxima do município/cidade.
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

  // Seleção que chegou antes das geometrias: aplica ao carregar.
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

  // Seleção removida (ex.: ESC global): volta o zoom ao Brasil/mundo inteiro.
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

  const hoverCity: CityResult | null = useMemo(() => {
    if (!hover) return null
    if (mode === 'exterior') {
      if (!exterior) return null
      const place = placeByTse[hover.code]
      if (!place) return null
      return getExteriorCityResult(exterior, place)
    }
    if (!snapshot) return null
    const info = nameIndex[hover.code]
    return getCityResult(
      snapshot,
      hover.code,
      info?.n ?? `Município ${hover.code}`,
      info?.u ?? hover.uf
    )
  }, [hover, mode, exterior, placeByTse, nameIndex, snapshot])

  /** Overlay único da cidade em hover (substitui os 5,7k `<title>`). */
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

  const scheduleClose = useCallback(() => {
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHover(null), 120)
  }, [])

  /**
   * Hover com throttle via rAF: no máximo 1 setState por frame, e com
   * bail-out (retorna `prev`) quando nem a cidade nem a posição mudaram de
   * forma relevante — nesse caso o React nem re-renderiza.
   */
  const handleSvgMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Durante arrasto/pinch o hover é suprimido (sem popover arrastando).
      if (dragging.current) return
      const target = (e.target as Element | null)?.closest?.(
        '[data-city]'
      ) as Element | null
      const wrap = wrapRef.current
      if (!target || !wrap) {
        scheduleClose()
        return
      }
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      const code = target.getAttribute('data-city') ?? ''
      const uf = target.getAttribute('data-uf') ?? ''
      if (!code) return
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
    [scheduleClose]
  )

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Clique após arrasto = pan, não seleção.
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      const target = (e.target as Element | null)?.closest?.(
        '[data-city]'
      ) as Element | null
      if (!target) {
        setHover(null)
        setInternalSelected(null)
        onSelect?.(null)
        lastExternalZoom.current = null
        resetView()
        return
      }
      const code = target.getAttribute('data-city') ?? ''
      if (!code) return
      if (resolvedSelected === code) {
        // Toggle: segundo clique volta ao Brasil inteiro.
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
      zoomToCode(code)
    },
    [onSelect, resetView, resolvedSelected, zoomToCode]
  )

  /* ---------------- Gestos: pan (arrasto), pinch e wheel ---------------- */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      stopAnim()
      const svg = svgRef.current
      downRect.current = svg ? svg.getBoundingClientRect() : null
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

      // Pinch: zoom no ponto médio + pan pelo deslocamento do meio.
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
            clampView({
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

      // Arrasto com 1 ponteiro: pan após limiar de 6px.
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
          clampView({
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

  // Wheel nativo não-passivo: zoom centrado no cursor sem rolar a página.
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
      stopAnim()
      zoomAt(
        clientToViewBox(svg.getBoundingClientRect(), e.clientX, e.clientY),
        1.8
      )
    },
    [stopAnim, zoomAt]
  )

  const inlineUfs = stateFeatures
    .map((f) => f.properties.sigla)
    .filter((s) => !(SIDE_UFS as readonly string[]).includes(s))

  const badgeRows: { sigla: string; pct: number; winner: Winner; y: number }[] =
    !ufLive
      ? []
      : (SIDE_UFS as readonly string[]).flatMap((sigla, i) => {
          const r = ufLive.ufs[sigla]
          if (!r) return []
          return [{ sigla, pct: r.pct, winner: r.winner, y: 150 + i * 40 }]
        })

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl',
        className
      )}
    >
      <style>{MAP_LAYER_CSS}</style>

      {/* Toggle de abrangência (fiel à imagem: Brasil › Exterior). */}
      {onModeChange && (
        <div
          role="tablist"
          aria-label="Abrangência da apuração"
          className="border-woodsmoke-700 bg-woodsmoke-900/90 absolute top-3 left-3 z-20 flex items-center gap-1 rounded-full border px-1 py-1 shadow-xl backdrop-blur"
        >
          {(
            [
              { value: 'brasil', label: 'Brasil' },
              { value: 'exterior', label: 'Exterior' }
            ] as const
          ).map((t, i) => (
            <span key={t.value} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="text-woodsmoke-500 text-xs">›</span>}
              <button
                type="button"
                role="tab"
                aria-selected={mode === t.value}
                onClick={() => onModeChange(t.value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  mode === t.value
                    ? 'text-woodsmoke-50'
                    : 'text-woodsmoke-400 hover:text-woodsmoke-200'
                )}
              >
                {t.label}
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover.Root
        open={hover !== null}
        onOpenChange={(open) => {
          if (!open) setHover(null)
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
          className="block h-[clamp(430px,66vh,720px)] w-full touch-none cursor-grab select-none active:cursor-grabbing"
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
          {/* Camadas do mapa: transform único na GPU (sem re-render pesado). */}
          <g
            transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
          >
          {mode === 'exterior' && (
            <>
              {/* Fundo do mundo (países em cinza escuro, como na referência). */}
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
              {/* Bolhas das cidades: raio por votos, cor por vencedor/margem. */}
              <ExteriorDotsLayer
                dots={exteriorDots}
                hoverCode={hover?.code ?? null}
                selectedCode={resolvedSelected}
              />
              {/* Rótulos das maiores cidades (Lisboa, Londres…). */}
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
          {/* Base dos estados (fallback enquanto municípios carregam). */}
          {statePaths.map((s) => {
            const r = ufLive?.ufs[s.sigla]
            return (
              <path
                key={`base-${s.sigla}`}
                d={s.d}
                fill={r ? fillFor(r.winner, r.pct) : '#27272a'}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={0.9}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {/* Malha municipal real (IBGE) — camada memoizada, imune ao hover. */}
          <MunicipalitiesLayer
            paths={municipalityPaths}
            selectedCode={resolvedSelected}
          />

          {/* Contorno das UFs sobre os municípios. */}
          {statePaths.map((s) => (
            <path
              key={`border-${s.sigla}`}
              d={s.d}
              fill="none"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={0.9}
              strokeLinejoin="round"
              pointerEvents="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          </>)}

          {/* Overlay único da cidade em hover: destaque + tooltip acessível.
              `pointerEvents="none"` mantém o hit-test no path original. */}
          {hoveredPath && (
            <path
              d={hoveredPath.d}
              fill={hoveredPath.fill}
              fillOpacity={0.92}
              stroke="#fff"
              strokeWidth={1.4}
              strokeLinejoin="round"
              pointerEvents="none"
              vectorEffect="non-scaling-stroke"
            >
              <title>{hoveredName}</title>
            </path>
          )}

          {/* Chamadas laterais: fixas na tela; somem com zoom (visão geral). */}
          {mode === 'brasil' && (
          <g
            style={{
              opacity: view.scale < 1.3 ? 1 : 0,
              transition: 'opacity .3s'
            }}
          >
          {/* Linhas de chamada para as badges laterais. */}
          {badgeRows.map((b) => {
            const anchor = stateAnchors[b.sigla]
            if (!anchor) return null
            return (
              <g key={`line-${b.sigla}`} pointerEvents="none">
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={796}
                  y2={b.y + 13}
                  stroke="#52525b"
                  strokeWidth={1}
                  strokeOpacity={0.8}
                />
                <circle
                  cx={anchor.x}
                  cy={anchor.y}
                  r={2.4}
                  fill="none"
                  stroke="#a1a1aa"
                  strokeWidth={1}
                />
              </g>
            )
          })}

          {/* Rótulos internos das UFs: tamanho constante na tela (÷scale),
              ocultos no zoom profundo (contexto de estado perde o sentido). */}
          {view.scale <= 2.2 &&
            inlineUfs.map((sigla) => {
              const anchor = stateAnchors[sigla]
              const r = ufLive?.ufs[sigla]
              if (!anchor || !r) return null
              const dot =
                r.winner === 'flavio'
                  ? '#93c5fd'
                  : r.winner === 'lula'
                    ? '#fca5a5'
                    : '#9ca3af'
              const fs = 1 / view.scale
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

          {/* Badges laterais (fiel à imagem). */}
          {mode === 'brasil' &&
          badgeRows.map((b) => (
            <g key={`badge-${b.sigla}`} pointerEvents="none">
              <rect
                x={800}
                y={b.y}
                width={92}
                height={26}
                rx={4}
                fill={b.winner === 'flavio' ? '#1e3a8a' : b.winner === 'lula' ? '#7f1d1d' : '#374151'}
                stroke={b.winner === 'flavio' ? '#3b82f6' : b.winner === 'lula' ? '#ef4444' : '#6b7280'}
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              <text
                x={812}
                y={b.y + 17}
                fill="#fff"
                fontSize={12}
                fontWeight={800}
              >
                {b.sigla}
              </text>
              <text
                x={880}
                y={b.y + 17}
                fill="#fff"
                fontSize={12}
                fontWeight={700}
                textAnchor="end"
              >
                {Math.round(b.pct)}%
              </text>
            </g>
          ))}

          {/* Badge Brasil: % nacional do 1º colocado (TSE ao vivo). */}
          {mode === 'brasil' && ufLive?.nacionalPct != null && (
          <g pointerEvents="none">
            <rect
              x={800}
              y={150 + SIDE_UFS.length * 40 + 6}
              width={92}
              height={26}
              rx={4}
              fill="#713f12"
              stroke="#a16207"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <text x={812} y={150 + SIDE_UFS.length * 40 + 23} fontSize={12}>
              🌐
            </text>
            <text
              x={880}
              y={150 + SIDE_UFS.length * 40 + 23}
              fill="#fff"
              fontSize={12}
              fontWeight={700}
              textAnchor="end"
            >
              {Math.round(ufLive?.nacionalPct ?? 0)}%
            </text>
          </g>
          )}
          </g>
        </svg>

        {/* Popover de cidade no hover — composition reutilizável. */}
        <Popover.Content
          x={hover?.x}
          y={hover?.y}
          clampWidth={size.w || undefined}
          clampHeight={size.h || undefined}
          className="pointer-events-none"
        >
          {hoverCity && <CityPopoverCard city={hoverCity} />}
        </Popover.Content>
      </Popover.Root>

      {/* Estado de carregamento / seleção. */}
      {loadingMun && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          Carregando mapa (IBGE)…
        </p>
      )}
      {!loadingMun && mode === 'brasil' && !snapshot && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          {resultsError
            ? 'TSE indisponível no momento — tentando de novo…'
            : 'Carregando resultados TSE 2026 · 1º turno…'}
        </p>
      )}
      {!loadingMun && mode === 'exterior' && !exterior && (
        <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs">
          Carregando voto no exterior (TSE 2026 · 1º turno)…
        </p>
      )}
      {!loadingMun && selectedCityName && (
        <p className="text-woodsmoke-300 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-xs">
          Selecionado: <strong className="text-white">{selectedCityName}</strong>
        </p>
      )}

      {/* Controles de zoom (descoberta + touch). */}
      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
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
          aria-label="Ver o Brasil inteiro"
          title="Ver o Brasil inteiro"
          onClick={() => resetView()}
          disabled={view.scale <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-base leading-none text-white backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/60"
        >
          ↺
        </button>
      </div>
    </div>
  )
}

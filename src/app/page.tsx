'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'

import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs'

import {
  Map,
  type ExteriorPlace,
  type ExteriorSnapshot,
  type MapMode,
  type MapView,
  type TseSnapshot
} from '#/components/Map'
import type { CommandPaletteItemData } from '#/components/CommandPalette'
import { MapFilters, type FilterCandidate } from '#/components/MapFilters'
import { partyColor, WINNER_COLORS } from '#/data/parties'

import { Header } from '#/components/Header'
import { AdSlot } from '#/components/AdSlot'
import { Scrollable } from '#/components/Scrollable'
import { SenateScreen } from '#/components/SenateScreen'
import { ElectionTotals } from '#/components/ElectionTotals'
import {
  GovernorsScreen,
  type GovernorsSnapshot
} from '#/components/GovernorsScreen'
import {
  DeputiesScreen,
  type DeputiesSnapshot
} from '#/components/DeputiesScreen'
import { ExteriorSummaryCard } from '#/components/ExteriorSummaryCard'
import { CountriesCard } from '#/components/CountriesCard'
import { RegionCard } from '#/components/RegionCard'
import { LatestUpdates, type SenatorsSnapshot } from '#/components/LatestUpdates'
import { RaceCard } from '#/components/RaceCard'
import { TrendChart, type TrendPoint } from '#/components/TrendChart'
import type { PastSnapshot } from '#/components/Map'
import {
  pleitoPresidente,
  turnoSuffix,
  type Turno
} from '#/data/election'

type MunIndexEntry = [number, string, string]

function share(vap: number, vv: number | null): number {
  if (!vv || vv <= 0) return 0
  return Math.round((vap / vv) * 1000) / 10
}

function fmtPctShort(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`
}

function toTitle(name: string): string {
  return name.toLowerCase().replace(/(?:^|\s|-')/g, (m) => m.toUpperCase())
}

/**
 * Intervalo do polling ao vivo. 10s é inviável: cada revalidação no
 * servidor agrega ~5,6k arquivos do TSE (~30-60s) e o TSE limita
 * requisições em excesso (429). 60s mantém o mapa fresco sem bloqueios.
 */
const POLL_MS = 60_000

export default function Home() {
  return (
    <Suspense fallback={<p className="text-woodsmoke-400 px-4 py-8 text-sm">Carregando apuração…</p>}>
      <HomeContent />
    </Suspense>
  )
}

// useQueryState (nuqs) exige Suspense no prerender estático.
function HomeContent() {
  // Filtros espelhados na URL (deep-link + voltar do navegador).
  const [selected, setSelected] = useQueryState(
    'sel',
    parseAsString.withOptions({ history: 'replace', scroll: false })
  )
  const [mode, setMode] = useQueryState(
    'mode',
    parseAsStringLiteral(['brasil', 'exterior'] as const)
      .withDefault('brasil')
      .withOptions({ history: 'replace', scroll: false })
  )
  const [results, setResults] = useState<TseSnapshot | null>(null)
  const [index, setIndex] = useState<MunIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exterior, setExterior] = useState<ExteriorSnapshot | null>(null)
  const [places, setPlaces] = useState<ExteriorPlace[]>([])
  const [loadingExterior, setLoadingExterior] = useState(false)
  const [exteriorLoaded, setExteriorLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mapView, setMapView] = useQueryState(
    'view',
    parseAsStringLiteral(
      ['municipios', 'estados', 'vantagem', 'apurado', 'candidato'] as const
    )
      .withDefault('municipios')
      .withOptions({ history: 'replace', scroll: false })
  )
  const [candidateSq, setCandidateSq] = useQueryState(
    'cand',
    parseAsString.withOptions({ history: 'replace', scroll: false })
  )
  const [cargo, setCargo] = useQueryState(
    'cargo',
    parseAsStringLiteral(
      ['presidente', 'governadores', 'senado', 'deputados'] as const
    )
      .withDefault('presidente')
      .withOptions({ history: 'replace', scroll: false })
  )
  const [turnoParam, setTurnoParam] = useQueryState(
    'turno',
    parseAsStringLiteral(['1', '2'] as const)
      .withDefault('1')
      .withOptions({ history: 'replace', scroll: false })
  )
  const turno: Turno = turnoParam === '2' ? 2 : 1
  const pleito = pleitoPresidente(turno)
  const seriesKey = `tse-series-${pleito}-${turnoSuffix(turno)}`
  const [past, setPast] = useState<PastSnapshot | null>(null)
  const [senators, setSenators] = useState<SenatorsSnapshot | null>(null)
  const [governors, setGovernors] = useState<GovernorsSnapshot | null>(null)
  const [loadingGovernors, setLoadingGovernors] = useState(false)
  const [deputies, setDeputies] = useState<DeputiesSnapshot | null>(null)
  const [loadingDeputies, setLoadingDeputies] = useState(false)
  const [series, setSeries] = useState<TrendPoint[]>([])
  // Série persistida só após o mount (evita mismatch de hidratação).
  // Junta a série do servidor (curva completa) com a local (este navegador).
  // Chave e endpoint separados por turno para nunca misturar os turnos.
  useEffect(() => {
    let alive = true
    let stored: TrendPoint[] = []
    try {
      const raw = window.localStorage.getItem(seriesKey)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        stored = parsed.filter(
          (p): p is TrendPoint =>
            typeof p === 'object' &&
            p !== null &&
            Number.isFinite((p as TrendPoint).t) &&
            Number.isFinite((p as TrendPoint).a) &&
            Number.isFinite((p as TrendPoint).b)
        )
      }
    } catch {}
    const merge = (server: TrendPoint[]) => {
      const byTime: Record<number, TrendPoint> = {}
      for (const p of [...server, ...stored]) byTime[p.t] = p
      return Object.values(byTime)
        .sort((x, y) => x.t - y.t)
        .slice(-500)
    }
    fetch(`/api/elections/series?turno=${turno}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (!alive) return
        const server =
          typeof d === 'object' && d !== null && Array.isArray((d as { points?: unknown }).points)
            ? ((d as { points: TrendPoint[] }).points.filter((p) =>
                Number.isFinite(p?.t)
              ))
            : []
        const merged = merge(server)
        if (merged.length > 0) setSeries(merged)
        else if (stored.length > 0) setSeries(stored.slice(-500))
      })
      .catch(() => {
        if (alive && stored.length > 0) setSeries(stored.slice(-500))
      })
    return () => {
      alive = false
    }
  }, [turno, seriesKey])

  // Série "ao longo da apuração": novo snapshot registra % seções + top-2 e persiste.
  const resultsHash = results?.meta.hash
  useEffect(() => {
    if (!results) return
    const [a, b] = results.nacional.top
    if (!a || !b || !results.nacional.vv) return
    const point: TrendPoint = {
      t: Date.now(),
      pst: results.nacional.pst,
      a: Math.round((a.vap / results.nacional.vv) * 1000) / 10,
      b: Math.round((b.vap / results.nacional.vv) * 1000) / 10
    }
    setSeries((prev) => {
      const next = [...prev.slice(-499), point]
      try {
        window.localStorage.setItem(seriesKey, JSON.stringify(next))
      } catch {}
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsHash])

  // 1 único fetch live do agregado TSE, compartilhado entre mapa e busca.
  // Reexecuta ao trocar de turno (com reset do estado anterior).
  useEffect(() => {
    let alive = true
    setLoading(true)
    setResults(null)
    setSeries([])
    Promise.all([
      fetch('/maps/municipalities-index.json').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }) as Promise<MunIndexEntry[]>,
      fetch(`/api/elections/municipalities?turno=${turno}`, { cache: 'no-store' }).then(
        (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        }
      ) as Promise<TseSnapshot>
    ])
      .then(([idx, snap]) => {
        if (!alive) return
        setIndex(idx)
        setResults(snap)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [turno])

  // Polling ao vivo: busca de novo a cada POLL_MS, mas só atualiza o
  // estado (e re-renderiza o mapa) se o hash do conteúdo mudou.
  useEffect(() => {
    if (loading) return
    const tick = (url: string, apply: (snap: never) => void) => {
      fetch(url, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(apply)
        .catch(() => {})
    }
    const id = window.setInterval(() => {
      tick(`/api/elections/municipalities?turno=${turno}`, (snap: TseSnapshot) => {
        setResults((prev) =>
          prev && prev.meta.hash === snap.meta.hash ? prev : snap
        )
      })
      if (exteriorLoaded) {
        tick(`/api/elections/exterior?turno=${turno}`, (snap: ExteriorSnapshot) => {
          setExterior((prev) =>
            prev && prev.meta.hash === snap.meta.hash ? prev : snap
          )
        })
      }
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loading, exteriorLoaded, turno])

  // 2022 estático + senadores ao vivo (cards laterais).
  useEffect(() => {
    let alive = true
    fetch('/maps/ele2022-1t-presidente-top2.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((snap: PastSnapshot) => {
        if (alive) setPast(snap)
      })
      .catch(() => {})
    fetch('/api/elections/senators', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((snap: SenatorsSnapshot) => {
        if (alive) setSenators(snap)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  // Governadores sob demanda (só quando a aba é aberta; por turno).
  useEffect(() => {
    if (cargo !== 'governadores' || governors) return
    let alive = true
    setLoadingGovernors(true)
    fetch(`/api/elections/governors?turno=${turno}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((snap: GovernorsSnapshot) => {
        if (alive) {
          setGovernors(snap)
          setLoadingGovernors(false)
        }
      })
      .catch(() => {
        if (alive) setLoadingGovernors(false)
      })
    return () => {
      alive = false
    }
  }, [cargo, governors, turno])
  // Deputados sob demanda (só quando a aba é aberta).
  useEffect(() => {
    if (cargo !== 'deputados' || deputies) return
    let alive = true
    setLoadingDeputies(true)
    fetch('/api/elections/deputies', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((snap: DeputiesSnapshot) => {
        if (alive) {
          setDeputies(snap)
          setLoadingDeputies(false)
        }
      })
      .catch(() => {
        if (alive) setLoadingDeputies(false)
      })
    return () => {
      alive = false
    }
  }, [cargo, deputies])
  useEffect(() => {
    if (mode !== 'exterior' || exteriorLoaded) return
    let alive = true
    setLoadingExterior(true)
    setExterior(null)
    Promise.all([
      fetch(`/api/elections/exterior?turno=${turno}`, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }) as Promise<ExteriorSnapshot>,
      fetch('/maps/exterior-cities.json').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }) as Promise<ExteriorPlace[]>
    ])
      .then(([snap, coords]) => {
        if (!alive) return
        setExterior(snap)
        setPlaces(coords)
        setExteriorLoaded(true)
        setLoadingExterior(false)
      })
      .catch(() => {
        if (!alive) return
        setLoadingExterior(false)
      })
    return () => {
      alive = false
    }
  }, [mode, exteriorLoaded, turno])

  const handleMode = (next: MapMode) => {
    setMode(next)
    setSelected(null)
    setSearchQuery('')
    setSearchOpen(false)
  }

  // Troca de turno: reseta todos os dados dependentes do turno anterior.
  const handleTurno = (next: '1' | '2') => {
    if (next === turnoParam) return
    setTurnoParam(next)
    setSelected(null)
    setCandidateSq(null)
    setSearchQuery('')
    setSearchOpen(false)
    setResults(null)
    setExterior(null)
    setExteriorLoaded(false)
    setGovernors(null)
    setSeries([])
    setLoading(true)
  }

  // ESC global: reseta a busca, remove a seleção e volta o zoom do mapa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSearchQuery('')
      setSearchOpen(false)
      setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo<CommandPaletteItemData[]>(() => {
    if (mode === 'exterior') {
      const countryOf: Record<string, string> = Object.fromEntries(
        places.map((p) => [p.tse, p.country] as const)
      )
      return Object.entries(exterior?.cidades ?? {}).map(([tse, city]) => {
        const top1 = city.top[0]
        const pct = top1 ? share(top1.vap, city.vv) : null
        const accent =
          !top1
            ? undefined
            : partyColor(top1.sg)
        return {
          value: tse,
          label: toTitle(city.n || tse),
          meta: countryOf[tse],
          hint:
            top1 && pct != null ? `${top1.sg} ${fmtPctShort(pct)}` : undefined,
          accent,
          keywords: top1
            ? `${tse} ${top1.nmu} ${top1.sg} ${top1.n} ${countryOf[tse] ?? ''}`
            : `${tse}`
        }
      })
    }
    const firstSq = results?.nacional.top[0]?.sq
    const secondSq = results?.nacional.top[1]?.sq
    return index.map(([code, name, uf]) => {
      const city = results?.cidades[String(code)]
      const top1 = city?.top[0]
      const pct = top1 ? share(top1.vap, city?.vv ?? null) : null
      const accent =
        !top1 || !firstSq
          ? undefined
          : top1.sq === firstSq
            ? WINNER_COLORS.flavio
            : top1.sq === secondSq
              ? WINNER_COLORS.lula
              : WINNER_COLORS.outro
      return {
        value: String(code),
        label: name,
        meta: uf,
        hint:
          top1 && pct != null ? `${top1.sg} ${fmtPctShort(pct)}` : undefined,
        accent,
        keywords: top1
          ? `${code} ${top1.nmu} ${top1.sg} ${top1.n}`
          : `${code}`
      }
    })
  }, [index, results, mode, exterior, places])

  const trendNames = useMemo(() => {
    const [a, b] = results?.nacional.top ?? []
    const nameOf = (sq?: string) => {
      const nmu = (sq && results?.candidatos?.[sq]?.nmu) || ''
      return toTitle(String(nmu))
    }
    return { a: nameOf(a?.sq) || '1º', b: nameOf(b?.sq) || '2º' }
  }, [results])
  const candidates = useMemo<FilterCandidate[]>(() => {
    if (!results) return []
    const full = results.nacional.full ?? results.nacional.top.map((c) => ({ sq: c.sq, vap: 0 }))
    const vv = results.nacional.vv
    return full.map((c) => {
      const info = results.candidatos?.[c.sq]
      return {
        sq: c.sq,
        nmu: info?.nmu ?? '',
        sg: info?.sg ?? '',
        n: info?.n ?? '',
        pct: share(c.vap, vv),
        photo: results.meta.fotos.replace('{sqcand}', c.sq)
      }
    })
  }, [results])

  return (
    <section className="flex w-full flex-col gap-3 px-4 xl:h-screen xl:overflow-hidden xl:px-6">
      <AdSlot slot="topo" className="h-[72px] w-full shrink-0" />
      <Header
        items={items}
        results={results}
        exterior={exterior}
        loading={loading || (mode === 'exterior' && loadingExterior)}
        handleSelected={(value) => setSelected(value)}
        mode={mode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        onModeChange={handleMode}
        cargo={cargo}
        onCargoChange={setCargo}
        showSearch={cargo === 'presidente'}
        turno={turno}
        onTurnoChange={handleTurno}
      />
      {cargo === 'presidente' ? (
      <div className="grid flex-1 items-start gap-3 xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-stretch">
        <aside className="order-2 xl:order-1 xl:min-h-0 xl:overflow-hidden">
          <Scrollable aria-label="Disputa nacional" className="xl:h-full">
            <div className="space-y-3">
              <RaceCard results={results} turno={turno} />
              <ElectionTotals results={results} />
              <TrendChart
                points={series}
                nameA={trendNames.a}
                nameB={trendNames.b}
              />
            </div>
          </Scrollable>
        </aside>
        <div className="order-1 xl:order-2 xl:min-h-0">
          <Map
            key={`${mode}-${turno}`}
            mode={mode}
            turno={turno}
            exterior={exterior}
            onModeChange={handleMode}
            selected={selected}
            onSelect={setSelected}
            results={results}
            mapView={mode === 'brasil' ? mapView : 'municipios'}
            candidateSq={candidateSq}
            className="xl:h-full"
            filters={
              mode === 'brasil' ? (
                <MapFilters
                  view={mapView}
                  onViewChange={(v) => {
                    setMapView(v)
                    if (v !== 'candidato') setCandidateSq(null)
                  }}
                  candidates={candidates}
                  candidateSq={candidateSq}
                  onCandidateChange={(sq) => {
                    setCandidateSq(sq)
                    setMapView('candidato')
                  }}
                />
              ) : undefined
            }
          />
        </div>
        <aside className="order-3 xl:min-h-0 xl:overflow-hidden">
          {mode === 'exterior' ? (
            <div className="space-y-3 xl:flex xl:h-full xl:flex-col xl:space-y-3">
              <ExteriorSummaryCard
                exterior={exterior}
                turno={turno}
                onClose={() => setSelected(null)}
              />
              <CountriesCard exterior={exterior} places={places} />
            </div>
          ) : (
          <div className="space-y-3 xl:flex xl:h-full xl:flex-col xl:space-y-3">
            <RegionCard results={results} past={turno === 2 ? null : past} exterior={exterior} />
            <LatestUpdates senators={senators} />
          </div>
          )}
        </aside>
      </div>
      ) : cargo === 'senado' ? (
        <SenateScreen
          senators={senators}
          right={<LatestUpdates senators={senators} />}
        />
      ) : cargo === 'governadores' ? (
        <GovernorsScreen
          data={governors}
          loading={loadingGovernors}
          turno={turno}
          right={<LatestUpdates senators={senators} />}
        />
      ) : cargo === 'deputados' ? (
        <DeputiesScreen
          data={deputies}
          loading={loadingDeputies}
          senators={<LatestUpdates senators={senators} />}
        />
      ) : (
        <section
          aria-label="Deputados"
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-6 text-center"
        >
          <h2 className="text-woodsmoke-50 text-sm font-bold">
            Deputados federais e estaduais
          </h2>
          <p className="text-woodsmoke-400 mx-auto mt-1 max-w-md text-xs">
            A apuração proporcional (quociente eleitoral e sobras) ainda está
            sendo integrada — esta tela entra no ar em breve.
          </p>
        </section>
      )}
    </section>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'

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

import { Header } from '#/components/Header'
import { NationalStats, type NationalStatsData } from '#/components/NationalStats'
import { RegionCard } from '#/components/RegionCard'
import { LatestUpdates, type SenatorsSnapshot } from '#/components/LatestUpdates'
import { RaceCard } from '#/components/RaceCard'
import { TrendChart, type TrendPoint } from '#/components/TrendChart'
import type { PastSnapshot } from '#/components/Map'

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
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<MapMode>('brasil')
  const [results, setResults] = useState<TseSnapshot | null>(null)
  const [index, setIndex] = useState<MunIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exterior, setExterior] = useState<ExteriorSnapshot | null>(null)
  const [places, setPlaces] = useState<ExteriorPlace[]>([])
  const [loadingExterior, setLoadingExterior] = useState(false)
  const [exteriorLoaded, setExteriorLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mapView, setMapView] = useState<MapView>('municipios')
  const [candidateSq, setCandidateSq] = useState<string | null>(null)
  const [past, setPast] = useState<PastSnapshot | null>(null)
  const [senators, setSenators] = useState<SenatorsSnapshot | null>(null)
  const [series, setSeries] = useState<TrendPoint[]>(() => {
    try {
      if (typeof window === 'undefined') return []
      const raw = window.localStorage.getItem('tse-series-6257')
      const parsed: TrendPoint[] = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.slice(-500) : []
    } catch {
      return []
    }
  })

  // Série "ao longo da apuração": a cada snapshot novo (hash mudou),
  // registra % seções + % dos 2 primeiros e persiste no navegador.
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
        window.localStorage.setItem('tse-series-6257', JSON.stringify(next))
      } catch {}
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsHash])

  // 1 único fetch live do agregado TSE, compartilhado entre mapa e busca.
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/maps/municipalities-index.json').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }) as Promise<MunIndexEntry[]>,
      fetch('/api/elections/municipalities', { cache: 'no-store' }).then(
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
  }, [])

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
      tick('/api/elections/municipalities', (snap: TseSnapshot) => {
        setResults((prev) =>
          prev && prev.meta.hash === snap.meta.hash ? prev : snap
        )
      })
      if (exteriorLoaded) {
        tick('/api/elections/exterior', (snap: ExteriorSnapshot) => {
          setExterior((prev) =>
            prev && prev.meta.hash === snap.meta.hash ? prev : snap
          )
        })
      }
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loading, exteriorLoaded])

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
  useEffect(() => {
    if (mode !== 'exterior' || exteriorLoaded) return
    let alive = true
    setLoadingExterior(true)
    Promise.all([
      fetch('/api/elections/exterior', { cache: 'no-store' }).then((r) => {
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
  }, [mode, exteriorLoaded])

  const handleMode = (next: MapMode) => {
    setMode(next)
    setSelected(null)
    setSearchQuery('')
    setSearchOpen(false)
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
            : top1.sg === 'PL'
              ? '#5b8def'
              : top1.sg === 'PT'
                ? '#f87171'
                : '#9ca3af'
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
            ? '#5b8def'
            : top1.sq === secondSq
              ? '#f87171'
              : '#9ca3af'
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

    const nationalTotals = useMemo<NationalStatsData | null>(() => {
    const src = mode === 'exterior' ? exterior?.total : results?.nacional
    if (!src) return null
    return {
      validos: src.vv,
      brancos: src.vb,
      nulos: src.vn,
      abstencoes: src.a,
      eleitores: src.te
    }
  }, [mode, exterior, results])

  const trendNames = useMemo(() => {
    const [a, b] = results?.nacional.top ?? []
    const nameOf = (sq?: string) => {
      const nmu = (sq && results?.candidatos?.[sq]?.nmu) || ''
      return toTitle(nmu.split(' ')[0] || '')
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
    <section className="w-full space-y-4 px-4 xl:px-6">
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
      />
      {mode === 'brasil' && (
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
      )}
      {!loading && <NationalStats data={nationalTotals} />}
      <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="order-2 space-y-4 xl:order-1">
          <RaceCard results={results} />
          <TrendChart
            points={series}
            nameA={trendNames.a}
            nameB={trendNames.b}
          />
        </aside>
        <div className="order-1 xl:order-2">
          <Map
            key={mode}
            mode={mode}
            exterior={exterior}
            onModeChange={handleMode}
            selected={selected}
            onSelect={setSelected}
            results={results}
            mapView={mode === 'brasil' ? mapView : 'municipios'}
            candidateSq={candidateSq}
          />
        </div>
        <aside className="order-3 space-y-4">
          <RegionCard results={results} past={past} exterior={exterior} />
          <LatestUpdates senators={senators} />
        </aside>
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'

import { Map } from '#/components/Map'
import { ElectionResults } from '#/components/ElectionResults'
import { SectionsSummary } from '#/components/SectionsSummary'
import { GeneralStats } from '#/components/GeneralStats'
import { TotalizationProgress } from '#/components/TotalizationProgress'

export default function Home() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-4">
      <div className="border-royal-purple-500/40 flex items-center justify-between border-b p-4">
        <span className="text-royal-purple-500 text-sm font-semibold tracking-widest uppercase">
          Apuração ao vivo
        </span>
        <span className="text-woodsmoke-400 text-xs">
          TSE · 4 de outubro de 2026
        </span>
      </div>
      <header className="border-royal-purple-500/40 bg-royal-purple-800/10 border-b">
        <div className="px-4 py-5">
          <TotalizationProgress />
        </div>
      </header>
      <div className="border-royal-purple-500/40 border-b p-4">
        <Map selected={selected} onSelect={setSelected} />
      </div>
      <ElectionResults selected={selected} />
      {!selected && <GeneralStats />}

      <div className="space-y-4 py-4">
        <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
          Sobre a Apuração
        </h2>
        <div className="bg-woodsmoke-800 text-woodsmoke-400 space-y-2 rounded p-4 text-sm">
          <p>
            A apuração do primeiro turno das eleições presidenciais de 2026 foi
            realizada pelo Tribunal Superior Eleitoral (TSE). O candidato é
            declarado eleito quando obtém a maioria absoluta dos votos válidos
            (mais de 50%) e não há possibilidade matemática de reversão com as
            seções restantes.
          </p>
          <SectionsSummary />
        </div>
      </div>

      <footer className="border-woodsmoke-800 border-t-2 py-4">
        <p className="text-woodsmoke-400 text-xs">
          Dados: Tribunal Superior Eleitoral · 4 de outubro de 2026
        </p>
      </footer>
    </section>
  )
}

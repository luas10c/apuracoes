import Image from 'next/image'

export default function Home() {
  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-4">
      <div className="border-royal-purple-500/40 flex items-center justify-between border-b p-4">
        <span className="text-royal-purple-500 text-sm font-semibold tracking-widest uppercase">
          Apuração ao vivo
        </span>
        <span className="text-woodsmoke-400 text-xs">
          TSE · 30 de outubro de 2022
        </span>
      </div>
      <header className="border-royal-purple-500/40 bg-royal-purple-800/10 border-b">
        <div className="px-4 py-5">
          <p className="text-muted-foreground text-muted-ftext-[11px] tracippepcasp">
            Eleições Presidenciais · 2º turno · Brasil
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-primary text-2xl font-bold tabular-nums md:text-3xl">
                99,04%
              </p>
              <p className="text-muted-foreground text-xs">
                das seções totalizadas
              </p>
            </div>
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              467.543 de 472.075 seções
            </p>
          </div>
          <div className="bg-woodsmoke-800 mt-2 h-1 w-full">
            <div className="bg-royal-purple-500 h-full w-[90%]"></div>
          </div>
        </div>
      </header>
      <div className="bg-woodsmoke-800/60 border-royal-purple-500 border-l-3 p-4">
        <p className="text-royal-purple-500 text-sm font-bold">
          Eleito presidente
        </p>
        <p className="text-foreground mt-0.5 text-sm">
          Luiz Inácio Lula da Silva (PT) vence com 50,90% dos votos válidos.
        </p>
        <p className="text-woodsmoke-400 mt-1 text-xs">
          Diferença de 2.139.645 votos · 1,80% dos válidos · Sem possibilidade
          matemática de virada
        </p>
      </div>

      <div className="space-y-4 py-4">
        <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
          Candidatos
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex gap-4">
              <div className="relative size-16 overflow-hidden rounded-full">
                <Image
                  src="/lula.jpg"
                  className="object-cover object-top"
                  fill
                  alt="#"
                />
              </div>
              <div className="flex flex-1 justify-between gap-4">
                <div className="text-woodsmoke-400">
                  <div className="flex items-center gap-2">
                    <span className="text-woodsmoke-100 text-base font-bold md:text-lg">
                      Lula
                    </span>
                    <span className="text-woodsmoke-100 inline-flex h-5 items-center rounded bg-red-500 px-1.5 text-[11px] font-bold">
                      13
                    </span>
                    <span className="bg-royal-purple-500 text-woodsmoke-100 inline-flex h-5 items-center rounded px-2 text-[10px] font-bold uppercase">
                      Eleito
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Luiz Inácio Lula da Silva
                  </p>
                  <p className="eed-f-0.5 mt-0.5 text-[11px]">
                    PT - Brasil da Esperança
                  </p>
                  <p className="eed-f-0.5 mt-0.5 text-[11px]">
                    Vice: Geraldo Alckmin (PSB)
                  </p>
                </div>
                <div>
                  <span className="text-foreground text-2xl font-bold tabular-nums md:text-3xl">
                    50,90
                    <span className="text-muted-foreground text-base font-normal">
                      %
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 py-4">
              <div className="bg-woodsmoke-800 relative h-2 w-full overflow-hidden rounded">
                <div className="absolute h-2 w-[80%] rounded bg-red-500"></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-woodsmoke-400 text-xs">
                  60.345.999 votos
                </span>
                <span className="text-woodsmoke-400 text-xs">maioria</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex gap-4">
              <div className="relative size-16 overflow-hidden rounded-full">
                <Image
                  src="/bolsonaro.jpg"
                  className="object-cover object-top"
                  fill
                  alt="#"
                />
              </div>
              <div className="flex flex-1 justify-between gap-4">
                <div className="text-woodsmoke-400">
                  <div className="flex items-center gap-2">
                    <span className="text-woodsmoke-100 text-base font-bold md:text-lg">
                      Bolsonaro
                    </span>
                    <span className="text-woodsmoke-100 inline-flex h-5 items-center rounded bg-blue-500 px-1.5 text-[11px] font-bold">
                      22
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Jair Messias Bolsonaro
                  </p>
                  <p className="eed-f-0.5 mt-0.5 text-[11px]">
                    PL · Pelo Bem do Brasil
                  </p>
                  <p className="eed-f-0.5 mt-0.5 text-[11px]">
                    Vice: Walter Braga Netto (PL)
                  </p>
                </div>
                <div>
                  <span className="text-foreground text-2xl font-bold tabular-nums md:text-3xl">
                    49,10
                    <span className="text-muted-foreground text-base font-normal">
                      %
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 py-4">
              <div className="bg-woodsmoke-800 relative h-2 w-full overflow-hidden rounded">
                <div className="absolute h-2 w-[80%] rounded bg-blue-500"></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-woodsmoke-400 text-xs">
                  58.206.354 votos
                </span>
                <span className="text-woodsmoke-400 text-xs">faltam 0,91%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4 py-4">
        <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
          Dados gerais
        </h2>
        <div className="bg-woodsmoke-700 grid grid-cols-2 gap-0.5 md:grid-cols-3">
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Eleitores aptos
            </p>
            <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
              156.454.011
            </p>
          </div>
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Comparecimento
            </p>
            <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
              124.172.164
            </p>
            <p className="text-muted-foreground text-muted-foreground te">
              79,37% do eleitorado
            </p>
          </div>
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Votos válidos
            </p>
            <p className="text-primary mt-0.5 text-sm font-semibold tabular-nums">
              118.552.353
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              95,47% do comparecimento
            </p>
          </div>
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Brancos
            </p>
            <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
              1.727.220
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              1,39%
            </p>
          </div>
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Nulos
            </p>
            <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
              3.478.093
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              2,80%
            </p>
          </div>
          <div className="bg-woodsmoke-800 p-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Abstenções
            </p>
            <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
              32.281.847
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              20,63% do eleitorado
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 py-4">
        <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
          Sobre a Apuração
        </h2>
        <div className="bg-woodsmoke-800 text-woodsmoke-400 space-y-2 rounded p-4 text-sm">
          <p>
            A apuração do segundo turno das eleições presidenciais de 2022 foi
            realizada pelo Tribunal Superior Eleitoral (TSE). O candidato é
            declarado eleito quando obtém a maioria absoluta dos votos válidos
            (mais de 50%) e não há possibilidade matemática de reversão com as
            seções restantes.
          </p>
          <p>Total de seções: 472.075 · Apuradas: 467.543 · Restantes: 4.532</p>
        </div>
      </div>

      <footer className="border-woodsmoke-800 border-t-2 py-4">
        <p className="text-woodsmoke-400 text-xs">
          Dados: Tribunal Superior Eleitoral · 30 de outubro de 2022
        </p>
      </footer>
    </section>
  )
}

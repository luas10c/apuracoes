/**
 * Proxy ao vivo do TSE — Eleições 2026, 1º turno, Presidente (pleito 6257).
 *
 * GET /api/elections/municipality?ibge=1500602
 * Retorna o agregado municipal no mesmo formato compacto do snapshot
 * `public/maps/tse-2026-1t-presidente.json` (gerado por `npm run fetch:tse-2026`).
 */
export const dynamic = 'force-dynamic'

const ELEICAO = '6257'
const CARGO = '0001'
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}`

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Índice refeito a cada chamada: 100% ao vivo, sem cache. */
async function loadMunIndex(): Promise<
  Record<string, { tse: string; uf: string; nome: string }>
> {
  const r = await fetch(`${BASE}/config/mun-e00${ELEICAO}-cm.json`, {
    cache: 'no-store'
  })
  if (!r.ok) throw new Error(`TSE respondeu ${r.status}`)
  const cm = await r.json()
  const idx: Record<string, { tse: string; uf: string; nome: string }> = {}
  for (const abr of cm?.abr ?? []) {
    const uf = String(abr.cd ?? '').toUpperCase()
    for (const mu of abr?.mu ?? []) {
      idx[String(mu.cdi)] = {
        tse: String(mu.cd).padStart(5, '0'),
        uf,
        nome: mu.nm ?? ''
      }
    }
  }
  return idx
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ibge = (searchParams.get('ibge') ?? '').replace(/\D/g, '')

  if (!/^\d{7}$/.test(ibge)) {
    return Response.json({ error: 'Parâmetro ibge inválido' }, { status: 400 })
  }

  try {
    const idx = await loadMunIndex()
    const ref = idx[ibge]
    if (!ref) {
      return Response.json(
        { error: 'Município não encontrado' },
        { status: 404 }
      )
    }

    const uf = ref.uf.toLowerCase()
    const response = await fetch(
      `${BASE}/dados/${uf}/${uf}${ref.tse}-c${CARGO}-e00${ELEICAO}-u.json`,
      { cache: 'no-store' }
    )
    if (!response.ok) {
      return Response.json(
        { error: `TSE respondeu ${response.status}` },
        { status: 502 }
      )
    }
    const data = await response.json()

    const top: unknown[] = []
    for (const agr of data?.carg?.[0]?.agr ?? []) {
      for (const par of agr?.par ?? []) {
        for (const c of par?.cand ?? []) {
          top.push({
            sq: String(c.sqcand),
            nmu: c.nmu ?? c.nm ?? '',
            sg: par?.sg ?? '',
            n: String(par?.n ?? ''),
            vap: num(c.vap) ?? 0,
            pvap: c.pvap ?? '0',
            st: c.st ?? '',
            foto: `${BASE}/fotos/br/${c.sqcand}.jpeg`
          })
        }
      }
    }
    top.sort(
      (a, b) => (b as { vap: number }).vap - (a as { vap: number }).vap
    )

    return Response.json({
      ibge,
      tse: ref.tse,
      uf: ref.uf,
      nome: ref.nome,
      turno: Number(data?.t ?? 1),
      sections: {
        total: num(data?.s?.ts),
        done: num(data?.s?.st),
        pct: num(data?.s?.pst),
        validos: num(data?.v?.vv),
        brancos: num(data?.v?.vb),
        nulos: num(data?.v?.vn),
        eleitores: num(data?.e?.te),
        abstencoes: num(data?.e?.a)
      },
      top: (top as unknown[]).slice(0, 2)
    })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

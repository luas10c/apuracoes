export async function GET() {
  try {
    const response = await fetch(
      'https://resultados.tse.jus.br/oficial/ele2026/6257/dados-simplificados/br/br-c0001-e006257-r.json',
      { cache: 'no-store' }
    )
    if (!response.ok) {
      return Response.json(
        { error: `TSE respondeu ${response.status}` },
        { status: 502 }
      )
    }
    const data = await response.json()

    const num = (v: unknown) => {
      if (v == null || v === '') return null
      const n = Number(String(v).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    const total = num(data['ts'] ?? data['tsa'])
    const done = num(data['st'] ?? data['sa'] ?? data['s'])
    const pct = num(data['pst']) ?? (total && done ? (done / total) * 100 : null)

    const abr = Array.isArray(data.abr) ? data.abr[0] : undefined
    const eleitores = num(abr?.e)
    const comparecimento = num(abr?.c)
    const abstencoes = num(abr?.a)
    const brancos = num(data.vb)
    const nulos = num(data.tvn)
    const validos = Array.isArray(data.cand)
      ? data.cand.reduce((s: number, c: { vap?: string }) => s + (num(c.vap) ?? 0), 0)
      : null

    return Response.json({
      ...data,
      sections: { total, done, pct },
      general: { eleitores, comparecimento, abstencoes, brancos, nulos, validos },
      cand: data.cand.map((item) => {
        return {
          id: Number(item.sqcand),
          coalition: item.cc,
          party_number: item.n,
          name: item.nm,
          name_vice: item.nv,
          position: Number(item.seq),
          image_url: Number(item.n) === 22 ? '/bolsonaro.jpg' : '/lula.jpg',
          pvap: item.pvap,
          status: item.st || 'Eleito',
          votes: item.vap
        }
      })
    })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

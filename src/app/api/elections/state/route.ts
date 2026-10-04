const CARGOS: Record<string, string> = {
  presidente: '0001',
  governador: '0003',
  senador: '0005',
  federal: '0006',
  estadual: '0007'
}

const num = (v: unknown) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const uf = (searchParams.get('uf') ?? '').toLowerCase()
  const cargo = searchParams.get('cargo') ?? ''

  if (!uf || !CARGOS[cargo]) {
    return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const cd = cargo === 'estadual' && uf === 'df' ? '0008' : CARGOS[cargo]
  const id = cargo === 'presidente' ? 6257 : 6259
  const ids = cargo === 'presidente' ? [6257] : [6259, 6257]

  for (const electionId of ids) {
    try {
      const response = await fetch(
        `https://resultados.tse.jus.br/oficial/ele2026/${electionId}/dados-simplificados/${uf}/${uf}-c${cd}-e${String(electionId).padStart(6, '0')}-r.json`,
        { cache: 'no-store' }
      )
      if (response.status === 404 || response.status === 403) continue
      if (!response.ok) {
        return Response.json(
          { error: `TSE respondeu ${response.status}` },
          { status: 502 }
        )
      }
      const data = await response.json()
      return Response.json({
        cand: (data.cand ?? []).map((item: Record<string, string>) => ({
          id: Number(item.sqcand),
          coalition: item.cc,
          party_number: item.n,
          name: item.nm,
          name_vice: item.nv,
          position: Number(item.seq),
          image_url: Number(item.n) === 22 ? '/bolsonaro.jpg' : '/lula.jpg',
          pvap: item.pvap,
          status: item.st || '',
          votes: item.vap
        })),
        sections: {
          total: num(data.ts ?? data.tsa),
          done: num(data.st ?? data.sa ?? data.s),
          pct: num(data.pst)
        }
      })
    } catch {
      continue
    }
  }

  return Response.json({ error: 'Sem dados do TSE' }, { status: 502 })
}

import {
  pleitoGovernador,
  pleitoPresidente,
  type Turno
} from '#/data/election'

function cargosFor(turno: Turno): Record<string, { cd: string; eleicao: string }> {
  return {
    presidente: { cd: '0001', eleicao: pleitoPresidente(turno) },
    governador: { cd: '0003', eleicao: pleitoGovernador(turno) },
    senador: { cd: '0005', eleicao: '6259' },
    federal: { cd: '0006', eleicao: '6259' },
    estadual: { cd: '0007', eleicao: '6259' }
  }
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
  const turno: Turno = searchParams.get('turno') === '2' ? 2 : 1

  const cfg = cargosFor(turno)[cargo]
  if (!uf || !cfg) {
    return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const cd = cargo === 'estadual' && uf === 'df' ? '0008' : cfg.cd

  try {
    const response = await fetch(
      `https://resultados.tse.jus.br/oficial/ele2026/${cfg.eleicao}/dados/${uf}/${uf}-c${cd}-e${cfg.eleicao.padStart(6, '0')}-u.json`,
      { cache: 'no-store' }
    )
    if (!response.ok) {
      return Response.json(
        { error: `TSE respondeu ${response.status}` },
        { status: 502 }
      )
    }
    const data = await response.json()

    const cand: any[] = []
    for (const agr of data?.carg?.[0]?.agr ?? []) {
      for (const par of agr?.par ?? []) {
        for (const c of par?.cand ?? []) {
          const vice = (c.vs ?? []).find((v: any) => v.tp === 'v')
          cand.push({
            id: Number(c.sqcand),
            coalition: agr?.nm ?? par?.nm ?? '',
            party_number: par?.n ?? '',
            sg: par?.sg ?? '',
            name: c.nmu ?? c.nm ?? '',
            name_vice: vice?.nmu ?? '',
            position: Number(c.seq),
            image_url: `https://resultados.tse.jus.br/oficial/ele2026/${cfg.eleicao}/fotos/${cargo === 'presidente' ? 'br' : uf}/${c.sqcand}.jpeg`,
            pvap: c.pvap,
            status: c.st || '',
            elected: /^\s*eleit/i.test(c.st ?? ''),
            votes: c.vap
          })
        }
      }
    }

    cand.sort((a, b) => (num(b.votes) ?? 0) - (num(a.votes) ?? 0))

    return Response.json({
      sections: {
        total: num(data?.s?.ts),
        done: num(data?.s?.st),
        pct: num(data?.s?.pst)
      },
      general: {
        eleitores: num(data?.e?.te),
        comparecimento: num(data?.v?.tv),
        abstencoes: num(data?.e?.a),
        brancos: num(data?.v?.vb),
        nulos: num(data?.v?.vn),
        validos: num(data?.v?.vv)
      },
      cand
    })
  } catch {
    return Response.json({ error: 'Falha ao buscar TSE' }, { status: 502 })
  }
}

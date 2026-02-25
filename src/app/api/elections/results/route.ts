export async function GET() {
  const response = await fetch(
    'https://resultados.tse.jus.br/oficial/ele2022/545/dados-simplificados/br/br-c0001-e000545-r.json'
  )
  const data = await response.json()

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  return new Response(
    JSON.stringify({
      ...data,
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
    }),
    { headers }
  )
}

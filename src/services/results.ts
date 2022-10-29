import { toast } from 'react-hot-toast'

const sleep = (timeout: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, timeout)
  })
}

export const fetchResults = async () => {
  try {
    await sleep(1000)
    const response = await fetch(
      'https://cors-anywhere.herokuapp.com/https://resultados.tse.jus.br/oficial/ele2022/545/dados-simplificados/br/br-c0001-e000545-r.json'
    )
    const data = await response.json()
    return data.cand.map((item) => {
      return {
        id: Number(item.sqcand),
        coalition: item.cc,
        party_number: item.n,
        name: item.nm,
        name_vice: item.nv,
        position: Number(item.seq),
        image_url: Number(item.n) === 22 ? '/bolsonaro.jpg' : '/lula.jpg',
        pvap: item.pvap,
        text: item.st,
        votes: item.vap
      }
    })
  } catch (error) {
    toast.error(error.message)
    return []
  }
}

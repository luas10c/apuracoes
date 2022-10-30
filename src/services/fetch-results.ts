import { toast } from 'react-hot-toast'

import { api } from '#/lib/api'

export const fetchResults = async () => {
  const { data } = await api.get('/apuracoes')
  const result = {
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
        status: item.st,
        votes: item.vap
      }
    })
  }

  return result
}

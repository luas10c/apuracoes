import axios from 'axios'
import type { GetServerSideProps } from 'next'
import { useEffect } from 'react'

import { Candidates } from '../components/candidates'

interface Props {
  candidates: any[]
}

const Home = (props: Props) => {
  const { candidates } = props

  useEffect(() => {
    const interval = setInterval(() => {
      location.reload()
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return <Candidates data={candidates} />
}

export const getServerSideProps: GetServerSideProps = async () => {
  const { data } = await axios.get(
    'https://resultados.tse.jus.br/oficial/ele2022/545/dados-simplificados/br/br-c0001-e000545-r.json'
  )
  const candidates = data.cand.map((item) => {
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

  return {
    props: {
      candidates
    }
  }
}

export default Home

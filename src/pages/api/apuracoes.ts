import axios from 'axios'
import type { NextApiHandler } from 'next'

const url =
  'https://resultados.tse.jus.br/oficial/ele2022/545/dados-simplificados/br/br-c0001-e000545-r.json'

const handler: NextApiHandler = async (request, response) => {
  try {
    const { data } = await axios.get(url)
    return response.status(200).json(data)
  } catch (error) {
    return response.status(500).json(error)
  }
}

export default handler

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

import { Candidates } from '../components/candidates'

import { fetchResults } from '../services/results'

const Home = () => {
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState([])

  useEffect(() => {
    const toaster = toast.loading('Carregando candidatos...')
    fetchResults()
      .then((data) => {
        setCandidates(data)
      })
      .finally(() => {
        setLoading(false)
        toast.dismiss(toaster)
      })
  }, [])

  if (loading) {
    return null
  }

  return <Candidates data={candidates} />
}

export default Home

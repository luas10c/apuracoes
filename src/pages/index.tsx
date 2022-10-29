import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'

import { fetchResults } from '#/services/fetch-results'

import { Candidates } from '../components/candidates'

const Home = () => {
  const [candidates, setCandidates] = useState([])

  useEffect(() => {
    const toaster = toast.loading('Buscando candidatos...')
    fetchResults()
      .then((data) => {
        setCandidates(data)
      })
      .catch((error) => {
        toast.error(error.message)
      })
      .finally(() => {
        toast.dismiss(toaster)
      })
  }, [])

  useEffect(() => {
    if (!candidates) {
      return
    }

    const interval = setInterval(() => {
      fetchResults().then((data) => {
        setCandidates(data)
      })
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [candidates])

  return <Candidates data={candidates} />
}

export default Home

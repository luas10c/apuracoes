import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'

import { fetchResults } from '#/services/fetch-results'

import { Information } from '#/components/information'
import { Candidates } from '../components/candidates'

import styles from '../styles/home.module.scss'

interface Results {
  cand: []
  dg: string
  hg: string
  vvc: number
  vn: number
  vb: number
  van: number
}

const Home = () => {
  const [results, setResults] = useState<Results>(null)

  useEffect(() => {
    const toaster = toast.loading('Buscando candidatos...')
    fetchResults()
      .then((data) => {
        setResults(data)
      })
      .catch((error) => {
        toast.error(error.message)
      })
      .finally(() => {
        toast.dismiss(toaster)
      })
  }, [])

  useEffect(() => {
    if (!results) {
      return
    }

    const interval = setInterval(() => {
      fetchResults().then((data) => {
        setResults(data)
      })
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [results])

  if (!results) {
    return null
  }

  return (
    <div className={styles.container}>
      <Information
        white_votes={results.vb}
        null_votes={results.vn}
        annulled_votes={results.van}
        valid_votes={results.vvc}
      />
      <Candidates data={results.cand} />
      <footer className={styles.footer}>
        <div>
          <span>
            Última atualização: {results.dg} {results.hg}
          </span>
        </div>
      </footer>
    </div>
  )
}

export default Home

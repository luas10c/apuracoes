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
  psi: number
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
      <div className={styles.wrapper}>
        <div className={styles.information}>
          <Information
            white_votes={results.vb}
            null_votes={results.vn}
            annulled_votes={results.van}
            valid_votes={results.vvc}
            psi={results.psi}
          />
        </div>
        <div className={styles.results}>
          <Candidates data={results.cand} />
        </div>
      </div>
      <footer className={styles.footer}>
        Última atualização: {results.dg} {results.hg}
      </footer>
    </div>
  )
}

export default Home

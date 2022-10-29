import { Toaster } from 'react-hot-toast'
import Head from 'next/head'
import type { AppProps } from 'next/app'

import '../styles/globals.scss'

const App = (props: AppProps) => {
  const { Component, pageProps } = props

  return (
    <>
      <Head>
        <title>Apurações Eleições 2022</title>
      </Head>
      <Toaster />
      <Component {...pageProps} />
    </>
  )
}

export default App

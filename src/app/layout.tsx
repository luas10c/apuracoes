import './globals.css'

import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import type { Metadata } from 'next/types'

export const metadata: Metadata = {
  title: 'Apurações',
  description:
    'Esta página foi desenvolvida com finalidade educacional e demonstrativa, visando apresentar resultados eleitorais a partir de dados oficiais públicos. O objetivo é promover aprendizado, transparência e compreensão sobre o processo eleitoral, sem qualquer vínculo com órgãos oficiais ou caráter de divulgação institucional. As informações exibidas são baseadas em fontes confiáveis, porém podem estar sujeitas a atualizações ou ajustes conforme a disponibilização dos dados oficiais.',
  keywords: ['eleições', 'apuracoes', 'resultados', 'eleitos']
}

const inter = Inter({
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap'
})

export default function AppLayout({ children }: React.PropsWithChildren) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast:
                '!bg-woodsmoke-800 !border-woodsmoke-700 !text-woodsmoke-100',
              title: '!font-semibold !text-woodsmoke-100',
              description: '!text-woodsmoke-400'
            }
          }}
        />
      </body>
    </html>
  )
}

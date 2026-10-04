/** @type{import('next').NextConfig} */
export default {
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    qualities: [75, 80],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'resultados.tse.jus.br',
        pathname: '/oficial/ele2026/**/fotos/**',
      },
    ],
  }
}

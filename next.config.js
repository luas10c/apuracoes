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
    qualities: [75, 80]
  }
}

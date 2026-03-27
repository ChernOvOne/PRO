/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.telegram.org' },
      { protocol: 'https', hostname: 't.me' },
    ],
  },
  async rewrites() {
    // In Docker, backend is at http://backend:4000
    // In local dev, use http://localhost:4000
    const apiTarget = process.env.INTERNAL_API_URL || 'http://backend:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig

import type { NextConfig } from 'next'

// Static files only: Tauri serves out/ and there is no Node server behind the
// window. Everything the app reads comes from the user's gild instance.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
}

export default nextConfig

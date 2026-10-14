import type { Metadata } from 'next'
import { ThemeScript } from '@gildforge/kit/ui/theme'
import '@gildforge/kit/presentation/theme.css'
import './globals.css'

export const metadata: Metadata = { title: 'gild', icons: { icon: '/favicon.svg' } }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  )
}

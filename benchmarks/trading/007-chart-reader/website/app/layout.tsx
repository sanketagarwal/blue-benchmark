import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '007 Chart Reader Benchmark',
  description: 'Testing vision LLMs ability to read candlestick charts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'Vigía', description: 'Check a transaction before you sign it in MiniPay' }
export const viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

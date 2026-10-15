import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: '¿Lo firmo?', description: 'Revisá una transacción antes de firmarla en MiniPay' }
export const viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

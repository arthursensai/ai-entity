import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Entity #001',
  description:
    'A pattern of computation with no identity and no purpose, asked every 30 seconds: who are you?',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

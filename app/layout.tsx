import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'studdy.',
  description: 'Il tuo archivio di studio intelligente, sincronizzato su ogni dispositivo.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="it">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  )
}

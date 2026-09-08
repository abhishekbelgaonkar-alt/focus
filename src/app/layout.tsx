import type { Metadata } from 'next'
import { Outfit, Quicksand } from 'next/font/google'
import { AuthProvider } from '@/components/AuthProvider'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-outfit',
  display: 'swap',
})

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-quicksand',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Focus',
  description: 'Track your focus sessions',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${quicksand.variable}`}>
      <body className="font-sans bg-cream text-text-primary min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}

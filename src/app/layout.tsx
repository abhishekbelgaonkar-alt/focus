import type { Metadata } from 'next'
import { Outfit, Quicksand } from 'next/font/google'
import { AuthProvider } from '@/components/AuthProvider'
import { CyclingPlaceholderProvider } from '@/components/CyclingPlaceholder'
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

// Runs synchronously in <head> BEFORE React hydrates so the correct theme
// attribute is on <html> for the very first paint. Prevents a cream flash
// on dark/cherry mode. We write a data-theme attribute (not a class) so
// React's className reconciliation can't strip it during hydration.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='cherry')document.documentElement.setAttribute('data-theme',t);}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${quicksand.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans min-h-screen">
        <AuthProvider>
          <CyclingPlaceholderProvider>
            {children}
          </CyclingPlaceholderProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

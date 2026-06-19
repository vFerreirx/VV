import type { Metadata, Viewport } from 'next'
import { Geist_Mono } from 'next/font/google'

import { PWARegister } from '@/components/pwa-register'
import { SafeAreaSync } from '@/components/layout/safe-area-sync'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// A fonte sans do sistema vem do stack em globals.css (--font-sans).
// Mantemos só o mono (Geist Mono) pra números/códigos.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Vanvest — Sistema de gestão',
  description: 'Vanvest Home Decor — gestão de produção e estoque',
  applicationName: 'Vanvest',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Vanvest',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#1f2329',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors closeButton position="top-right" />
          <SafeAreaSync />
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  )
}

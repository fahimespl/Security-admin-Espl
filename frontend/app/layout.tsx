import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { StoreProvider } from '@/components/store-provider'
import { ToastProvider } from '@/components/toast'
import { DashboardShell } from '@/components/dashboard-shell'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'Esamyak — Jewelry Store Security',
  description:
    'Admin panel for a jewelry store face-recognition security system. Manage staff, store hours, alert rules, and review security logs.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0f16',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans antialiased">
        <ToastProvider>
          <StoreProvider>
            <DashboardShell>{children}</DashboardShell>
          </StoreProvider>
        </ToastProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

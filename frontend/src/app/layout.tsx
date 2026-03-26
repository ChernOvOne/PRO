import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { TMAProvider } from '@/providers/TMAProvider'
import Script from 'next/script'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: {
    default:  'HIDEYOU VPN',
    template: '%s — HIDEYOU VPN',
  },
  description:  'Быстрый и надёжный VPN. Подключайтесь с любого устройства.',
  icons:        { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  manifest:     '/manifest.json',
  openGraph: {
    title:       'HIDEYOU VPN',
    description: 'Быстрый и надёжный VPN с оплатой из России',
    type:        'website',
    siteName:    'HIDEYOU',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor:    '#0f172a',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Telegram Mini App SDK */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.className} bg-gray-950 text-white antialiased`}>
        <TMAProvider>
          {children}
        </TMAProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1e293b',
              color:      '#f1f5f9',
              border:     '1px solid #334155',
              borderRadius: '12px',
              fontSize:   '14px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}

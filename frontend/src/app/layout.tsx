import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { TMAProvider } from '@/providers/TMAProvider'
import Script from 'next/script'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] })

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
  themeColor:    '#0a0a12',
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
      <body className={`${outfit.className} antialiased`} style={{ background: '#0a0a12', color: '#f0f0f5' }}>
        <TMAProvider>
          {children}
        </TMAProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: 'rgba(26, 26, 46, 0.9)',
              backdropFilter: 'blur(20px)',
              color:      '#f0f0f5',
              border:     '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              fontSize:   '14px',
              fontFamily: 'Outfit, system-ui, sans-serif',
            },
            success: { iconTheme: { primary: '#34d399', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#f87171', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}

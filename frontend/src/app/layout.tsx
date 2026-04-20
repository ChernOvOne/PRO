import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { TMAProvider } from '@/providers/TMAProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { BrandTheme } from '@/components/BrandTheme'
import { MaintenanceBanner } from '@/components/MaintenanceBanner'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['300', '400', '500', '600', '700', '800'] })

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
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('hideyou-theme');
          if(t==='light')document.documentElement.classList.add('light');
          else if(t==='system'||!t){if(window.matchMedia('(prefers-color-scheme:light)').matches)document.documentElement.classList.add('light')}
          }catch(e){}})();
          (function(){try{var u=new URLSearchParams(location.search);var utm=u.get('utm')||u.get('utm_source');if(utm)sessionStorage.setItem('utm_source',utm)}catch(e){}})()
        `}} />
        {/* Preload Telegram Web App SDK if loaded inside Telegram (desktop, mobile, web) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var isTg = location.hash.indexOf('tgWebAppData') !== -1 ||
                         location.search.indexOf('tgWebAppData') !== -1 ||
                         navigator.userAgent.indexOf('Telegram') !== -1;
              if (isTg) {
                var s = document.createElement('script');
                s.src = 'https://telegram.org/js/telegram-web-app.js';
                s.async = false;
                document.head.appendChild(s);
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className={`${inter.className} antialiased`}
            style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
        <ThemeProvider>
          <BrandTheme />
          <MaintenanceBanner />
          <TMAProvider>
            {children}
          </TMAProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: 'var(--surface-2)',
                backdropFilter: 'blur(20px)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
                borderRadius: '14px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#34d399', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#f87171', secondary: '#fff' } },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}

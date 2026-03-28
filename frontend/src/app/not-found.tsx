import Link from 'next/link'
import { Shield } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center
                    justify-center px-6 text-center" style={{ background: 'var(--surface-1)' }}>
      <div className="aurora-bg" />
      <div className="space-y-6 animate-fade-in relative z-10">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto gradient-border"
             style={{ background: 'rgba(6,182,212,0.08)' }}>
          <Shield className="w-7 h-7" style={{ color: '#22d3ee' }} />
        </div>

        {/* 404 */}
        <div>
          <p className="text-8xl font-black select-none text-gradient">404</p>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>Страница не найдена</h1>
          <p className="mt-2 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
            Такой страницы не существует или она была перемещена
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/" className="btn-primary">
            На главную
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Личный кабинет
          </Link>
        </div>
      </div>
    </div>
  )
}

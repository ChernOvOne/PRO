import Link from 'next/link'
import { Shield } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center
                    justify-center px-6 text-center">
      <div className="space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/20
                        flex items-center justify-center mx-auto">
          <Shield className="w-7 h-7 text-brand-400" />
        </div>

        {/* 404 */}
        <div>
          <p className="text-8xl font-black text-gray-800 select-none">404</p>
          <h1 className="text-2xl font-bold mt-2">Страница не найдена</h1>
          <p className="text-gray-400 mt-2 max-w-sm">
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

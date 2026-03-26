'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="ru">
      <body className="bg-gray-950 text-white min-h-screen flex items-center
                       justify-center px-6">
        <div className="text-center space-y-6 animate-fade-in max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/20
                          flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">Произошла ошибка</h1>
            <p className="text-gray-400 mt-2">
              Что-то пошло не так на стороне приложения.
              {error.digest && (
                <span className="block text-xs text-gray-600 font-mono mt-1">
                  #{error.digest}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-6 py-3
                         bg-brand-600 hover:bg-brand-500 text-white font-medium
                         rounded-xl transition-colors">
              <RefreshCw className="w-4 h-4" />
              Попробовать снова
            </button>
            <a href="/"
               className="inline-flex items-center justify-center gap-2 px-6 py-3
                          bg-gray-800 hover:bg-gray-700 text-white font-medium
                          rounded-xl border border-gray-700 transition-colors">
              На главную
            </a>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <details className="text-left mt-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                Подробности (dev)
              </summary>
              <pre className="mt-2 text-xs text-red-400 bg-gray-900 p-4
                              rounded-xl overflow-auto max-h-48 border border-gray-800">
                {error.message}
                {error.stack && '\n\n' + error.stack}
              </pre>
            </details>
          )}
        </div>
      </body>
    </html>
  )
}

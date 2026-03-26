'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props   { children: ReactNode; fallback?: ReactNode }
interface State   { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught:', error, info)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px]
                        text-center px-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/20
                          flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-lg">Что-то пошло не так</p>
            <p className="text-gray-400 text-sm mt-1 max-w-sm">
              {this.state.error?.message || 'Произошла неожиданная ошибка'}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
                       border border-gray-700 rounded-xl text-sm transition-colors">
            <RefreshCw className="w-4 h-4" />
            Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Not found page ────────────────────────────────────────────
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center space-y-4 animate-fade-in">
        <p className="text-8xl font-black text-gray-800">404</p>
        <p className="text-xl font-semibold">Страница не найдена</p>
        <p className="text-gray-500">Возможно, ссылка устарела или страница была удалена</p>
        <a href="/" className="btn-primary inline-flex mt-4">
          На главную
        </a>
      </div>
    </div>
  )
}

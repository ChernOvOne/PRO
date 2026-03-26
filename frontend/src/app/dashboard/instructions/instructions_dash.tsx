'use client'

import { useEffect, useState } from 'react'
import { Monitor, Apple, Terminal as LinuxIcon,
         Smartphone, Router, HelpCircle } from 'lucide-react'

const DEVICE_ICONS: Record<string, any> = {
  WINDOWS:  Monitor,
  MACOS:    Apple,
  LINUX:    LinuxIcon,
  IOS:      Smartphone,
  ANDROID:  Smartphone,
  ROUTER:   Router,
  OTHER:    HelpCircle,
}
const DEVICE_LABELS: Record<string, string> = {
  WINDOWS: 'Windows', MACOS: 'macOS', LINUX: 'Linux',
  IOS: 'iOS', ANDROID: 'Android', ROUTER: 'Роутер', OTHER: 'Другое',
}

interface Instruction {
  id: string; title: string; deviceType: string; content: string
}

export default function InstructionsPage() {
  const [instructions, setInstructions] = useState<Instruction[]>([])
  const [active, setActive]             = useState<string>('')
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    fetch('/api/user/instructions', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setInstructions(data)
        if (data.length > 0) setActive(data[0].deviceType)
        setLoading(false)
      })
  }, [])

  const deviceTypes = [...new Set(instructions.map(i => i.deviceType))]
  const current     = instructions.filter(i => i.deviceType === active)

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="h-8 skeleton w-48" />
      <div className="flex gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 w-24 skeleton rounded-xl" />)}
      </div>
      <div className="h-96 skeleton rounded-2xl" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Инструкции по подключению</h1>
        <p className="text-gray-400 mt-1">Пошаговое подключение для каждого устройства</p>
      </div>

      {/* Device tabs */}
      <div className="flex flex-wrap gap-2">
        {deviceTypes.map(dt => {
          const Icon = DEVICE_ICONS[dt] || HelpCircle
          return (
            <button
              key={dt}
              onClick={() => setActive(dt)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm
                          font-medium border transition-all
                          ${active === dt
                            ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
              <Icon className="w-4 h-4" />
              {DEVICE_LABELS[dt] || dt}
            </button>
          )
        })}
      </div>

      {/* Instructions */}
      <div className="space-y-4">
        {current.length === 0 && (
          <div className="card text-center py-12 text-gray-500">
            Инструкции для этого устройства ещё не добавлены
          </div>
        )}
        {current.map(ins => (
          <div key={ins.id} className="card">
            <h2 className="font-semibold text-lg mb-4">{ins.title}</h2>
            <div className="prose-custom"
                 dangerouslySetInnerHTML={{ __html: markdownToHtml(ins.content) }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Minimal markdown → HTML (server would use a proper lib like marked)
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2 text-white">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 class="text-lg font-semibold mt-5 mb-2 text-white">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 class="text-xl font-bold mt-6 mb-3 text-white">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 bg-gray-800 rounded text-brand-300 text-sm font-mono">$1</code>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-gray-300 my-1">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300 my-1">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-brand-400 hover:underline">$1</a>')
    .replace(/\n\n/g, '</p><p class="text-gray-400 my-2">')
    .replace(/^(.+)$/gm, (line) =>
      line.startsWith('<') ? line : `<p class="text-gray-400 my-1">${line}</p>`)
}

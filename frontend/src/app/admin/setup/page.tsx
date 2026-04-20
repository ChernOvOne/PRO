'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Shield, CreditCard, Server, Coins, Loader2, CheckCircle2,
  ArrowRight, Rocket,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import { GroupCard } from './components/GroupCard'
import { useSetupState } from './hooks/useSetupState'
import { IdentityGroup } from './groups/IdentityGroup'
import { FinanceGroup } from './groups/FinanceGroup'
import { VpnGroup } from './groups/VpnGroup'
import { AccountingGroup } from './groups/AccountingGroup'

export default function SetupWizardPage() {
  const router = useRouter()
  const { state, patch, loaded, completed, markGroupComplete } = useSetupState()
  const [bootstrap, setBootstrap] = useState<{ hasAdmin: boolean; publicIp: string | null } | null>(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    adminApi.setupBootstrap().then(b => setBootstrap(b)).catch(() => {})
  }, [])

  const groups = [
    { id: 'identity',    icon: <Shield className="w-6 h-6" />,     title: 'Идентификация', description: 'Админ, бренд, домены и TLS', color: '#06b6d4' },
    { id: 'finance',     icon: <CreditCard className="w-6 h-6" />, title: 'Финансы',       description: 'Платёжки, SMTP, рефералы', color: '#f59e0b' },
    { id: 'vpn',         icon: <Server className="w-6 h-6" />,     title: 'VPN инфраструктура', description: 'REMNAWAVE, тарифы, бот', color: '#8b5cf6' },
    { id: 'accounting',  icon: <Coins className="w-6 h-6" />,      title: 'Бухгалтерия',   description: 'Капитал, категории, серверы, превью', color: '#22c55e' },
  ]

  const groupProgress = (id: string): number => {
    switch (id) {
      case 'identity': {
        let p = 0
        if (bootstrap?.hasAdmin) p += 33
        if (state.branding.app_name) p += 33
        // trusted domains check done elsewhere — count as complete if state saved at least once
        p += state.completedGroups.includes('identity') ? 34 : 0
        return Math.min(100, p)
      }
      case 'finance': {
        let p = 0
        if (state.payments.yukassa_shop_id || state.payments.crypto_token) p += 40
        if (state.smtp.host) p += 40
        if (state.referrals.enabled) p += 20
        return p
      }
      case 'vpn': {
        let p = 0
        if (state.remnawave.url && state.remnawave.token) p += 50
        if (state.bot.token) p += 50
        return p
      }
      case 'accounting': {
        let p = 0
        if (state.buh.sources.length > 0) p += 25
        if (state.buh.categories.some(c => c.enabled)) p += 25
        if (state.buh.servers.length > 0) p += 25
        if (state.buh.saas.length > 0) p += 25
        return p
      }
    }
    return 0
  }

  const overallProgress = Math.round(groups.reduce((s, g) => s + groupProgress(g.id), 0) / groups.length)

  const finishSetup = async () => {
    setFinishing(true)
    try {
      await adminApi.setupComplete()
      toast.success('Настройка завершена! 🎉')
      setTimeout(() => router.push('/admin'), 1000)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    } finally {
      setFinishing(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Rocket className="w-7 h-7" style={{ color: 'var(--accent-1)' }} />
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Настройка платформы
          </h1>
          {completed && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              ✓ Завершена
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Пройди 4 группы настроек чтобы запустить платформу. Любой шаг можно пропустить и настроить позже.
        </p>
      </div>

      {/* Overall progress */}
      <div className="rounded-xl p-4 flex items-center gap-4"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="flex-1">
          <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Общий прогресс</div>
          <div className="h-2 rounded-full overflow-hidden"
               style={{ background: 'var(--surface-1)' }}>
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${overallProgress}%`, background: 'linear-gradient(90deg, #06b6d4, #22c55e)' }} />
          </div>
        </div>
        <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {overallProgress}%
        </span>
      </div>

      {/* Public IP reminder */}
      {bootstrap?.publicIp && (
        <div className="text-xs p-3 rounded-lg"
             style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
          💡 IP этого сервера: <code className="font-mono px-1 py-0.5 rounded"
                                      style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
            {bootstrap.publicIp}
          </code>
          {' '}— используй его для A-записей в DNS-провайдере (Cloudflare и т.д.)
        </div>
      )}

      {/* Groups */}
      <div className="flex flex-col gap-3">
        <GroupCard
          id="identity"
          icon={groups[0].icon}
          title={groups[0].title}
          description={groups[0].description}
          color={groups[0].color}
          progress={groupProgress('identity')}
          completed={state.completedGroups.includes('identity')}
          defaultOpen={!state.completedGroups.includes('identity')}>
          <IdentityGroup
            state={state} patch={patch}
            hasAdmin={bootstrap?.hasAdmin ?? true}
            onDone={() => markGroupComplete('identity')} />
        </GroupCard>

        <GroupCard
          id="finance"
          icon={groups[1].icon}
          title={groups[1].title}
          description={groups[1].description}
          color={groups[1].color}
          progress={groupProgress('finance')}
          completed={state.completedGroups.includes('finance')}>
          <FinanceGroup
            state={state} patch={patch}
            onDone={() => markGroupComplete('finance')} />
        </GroupCard>

        <GroupCard
          id="vpn"
          icon={groups[2].icon}
          title={groups[2].title}
          description={groups[2].description}
          color={groups[2].color}
          progress={groupProgress('vpn')}
          completed={state.completedGroups.includes('vpn')}>
          <VpnGroup
            state={state} patch={patch}
            onDone={() => markGroupComplete('vpn')} />
        </GroupCard>

        <GroupCard
          id="accounting"
          icon={groups[3].icon}
          title={groups[3].title}
          description={groups[3].description}
          color={groups[3].color}
          progress={groupProgress('accounting')}
          completed={state.completedGroups.includes('accounting')}>
          <AccountingGroup
            state={state} patch={patch}
            onDone={() => markGroupComplete('accounting')} />
        </GroupCard>
      </div>

      {/* Finish */}
      <div className="rounded-xl p-5 flex items-center gap-4"
           style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(34,197,94,0.1))', border: '1px solid rgba(6,182,212,0.2)' }}>
        <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
        <div className="flex-1">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Всё готово?</h3>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Отметить визард завершённым. Его всегда можно перезапустить из /admin/settings.
          </p>
        </div>
        <button onClick={finishSetup} disabled={finishing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: '#22c55e', color: 'white' }}>
          {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Завершить настройку
        </button>
      </div>
    </div>
  )
}

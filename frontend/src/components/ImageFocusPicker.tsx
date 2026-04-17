'use client'

/**
 * 9-point focus picker + aspect ratio selector for cover images.
 * Overlays the preview image with a 3×3 grid of clickable dots.
 * The chosen point becomes CSS object-position, applied wherever the
 * image is rendered (news cards, landing block, dashboard).
 */

import { useMemo } from 'react'

interface Props {
  imageUrl: string
  focus?: string           // "50% 50%"
  aspect?: string          // "16/9" | "4/3" | "1/1" | "21/9" | "auto"
  onFocusChange: (v: string) => void
  onAspectChange: (v: string) => void
}

const POINTS: { x: number; y: number; label: string }[] = [
  { x: 0,   y: 0,   label: 'верхний левый'  },
  { x: 50,  y: 0,   label: 'верхний центр'  },
  { x: 100, y: 0,   label: 'верхний правый' },
  { x: 0,   y: 50,  label: 'центр слева'    },
  { x: 50,  y: 50,  label: 'центр'          },
  { x: 100, y: 50,  label: 'центр справа'   },
  { x: 0,   y: 100, label: 'нижний левый'   },
  { x: 50,  y: 100, label: 'нижний центр'   },
  { x: 100, y: 100, label: 'нижний правый'  },
]

const ASPECTS = [
  { value: '16/9', label: '🎬 16:9 (обложка)' },
  { value: '4/3',  label: '📺 4:3' },
  { value: '1/1',  label: '⬛ 1:1 (квадрат)' },
  { value: '21/9', label: '🖼 21:9 (панорама)' },
  { value: 'auto', label: '📸 Авто (без обрезки)' },
]

export function ImageFocusPicker({ imageUrl, focus = '50% 50%', aspect = '16/9', onFocusChange, onAspectChange }: Props) {
  const [curX, curY] = useMemo(() => {
    const parts = focus.match(/(\d+)%\s+(\d+)%/)
    return parts ? [Number(parts[1]), Number(parts[2])] : [50, 50]
  }, [focus])

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
          Форма обложки
        </label>
        <select value={aspect} onChange={e => onAspectChange(e.target.value)}
                className="glass-input">
          {ASPECTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
          Точка фокуса — клик по сетке = что важно показать
        </label>

        {/* Preview with aspect ratio + focus applied */}
        <div className="relative rounded-xl overflow-hidden"
             style={{
               aspectRatio: aspect === 'auto' ? undefined : aspect,
               maxHeight: aspect === 'auto' ? '300px' : undefined,
               background: 'var(--surface-2)',
               border: '1px solid var(--glass-border)',
             }}>
          <img src={imageUrl} alt=""
               className="w-full h-full"
               style={{
                 objectFit: aspect === 'auto' ? 'contain' : 'cover',
                 objectPosition: focus,
               }} />
          {/* 3×3 grid overlay — only meaningful when aspect crops */}
          {aspect !== 'auto' && (
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {POINTS.map(p => {
                const active = p.x === curX && p.y === curY
                return (
                  <button key={`${p.x}-${p.y}`}
                          type="button"
                          title={p.label}
                          onClick={() => onFocusChange(`${p.x}% ${p.y}%`)}
                          className="flex items-center justify-center transition-all hover:bg-black/10 group">
                    <div className="rounded-full transition-all"
                         style={{
                           width:  active ? '18px' : '10px',
                           height: active ? '18px' : '10px',
                           background: active ? 'var(--accent-1)' : 'rgba(255,255,255,0.7)',
                           border: active ? '3px solid #fff' : '2px solid rgba(0,0,0,0.3)',
                           boxShadow: active ? '0 0 0 4px rgba(6,182,212,0.3), 0 4px 12px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
                         }} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
          Текущая точка: <b>{focus}</b> · форма: <b>{aspect}</b>
          {aspect === 'auto' && ' — картинка показана полностью без обрезки'}
        </p>
      </div>
    </div>
  )
}

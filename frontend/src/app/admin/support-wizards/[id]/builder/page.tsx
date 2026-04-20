'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Plus, Trash2, Save, ZoomIn, ZoomOut, Maximize2,
  MousePointer2, Loader2, MessageCircle, Type, List, Flag,
  X, AlignLeft, Star, Link2,
} from 'lucide-react'
import { adminApi } from '@/lib/api'

/* ── Types ──────────────────────────────────────────────── */

type NodeType = 'choice' | 'text' | 'textarea' | 'terminal'

interface WizardOption {
  value: string
  label: string
  icon?: string | null
  nextNodeId?: string | null
}

interface WizardNode {
  id: string
  wizardId: string
  nodeType: NodeType
  answerId?: string | null
  question?: string | null
  hint?: string | null
  placeholder?: string | null
  optional: boolean
  options?: WizardOption[] | null
  nextNodeId?: string | null
  posX: number
  posY: number
  subjectTemplate?: string | null
  bodyTemplate?: string | null
}

interface Wizard {
  id: string
  category: string
  title: string
  icon: string | null
  description: string | null
  enabled: boolean
  entryNodeId: string | null
  sortOrder: number
  nodes: WizardNode[]
}

/* ── Constants ──────────────────────────────────────────── */

const NODE_W = 280
const NODE_HEADER_H = 42
const OPTION_H = 30
const TEXT_NODE_H = 100
const TERMINAL_NODE_H = 120

const NODE_TEMPLATES: Array<{ type: NodeType; label: string; icon: any; color: string; defaults: Partial<WizardNode> }> = [
  {
    type: 'choice', label: 'Вопрос с вариантами', icon: List, color: '#06b6d4',
    defaults: {
      question: 'Что именно вас интересует?',
      options: [
        { value: 'a', label: 'Вариант A', nextNodeId: null },
        { value: 'b', label: 'Вариант B', nextNodeId: null },
      ],
    },
  },
  {
    type: 'text', label: 'Короткий текст', icon: Type, color: '#8b5cf6',
    defaults: { question: 'Введите данные', placeholder: '...', optional: false },
  },
  {
    type: 'textarea', label: 'Длинный текст', icon: AlignLeft, color: '#ec4899',
    defaults: { question: 'Опишите подробнее', placeholder: 'Расскажите что произошло...' },
  },
  {
    type: 'terminal', label: 'Финал (создать тикет)', icon: Flag, color: '#22c55e',
    defaults: {
      subjectTemplate: 'Тема: {{answer_id}}',
      bodyTemplate: '📝 {{answer_id}}',
    },
  },
]

function nodeHeight(n: WizardNode): number {
  if (n.nodeType === 'choice') {
    return NODE_HEADER_H + OPTION_H * Math.max(1, (n.options?.length || 0)) + 12
  }
  if (n.nodeType === 'terminal') return TERMINAL_NODE_H
  return TEXT_NODE_H
}

/* ── Component ──────────────────────────────────────────── */

export default function WizardBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [wizard, setWizard] = useState<Wizard | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  /* Canvas viewport */
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(60)
  const [panY, setPanY] = useState(60)

  const canvasRef = useRef<HTMLDivElement>(null)

  /* DnD state */
  const [dragging, setDragging] = useState<{ nodeId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)
  const [connecting, setConnecting] = useState<{ fromNodeId: string; fromOptionValue: string | null; mouseX: number; mouseY: number } | null>(null)

  /* ── Load ─────────────────────────────────────────────── */

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getSupportWizard(id)
      setWizard(data)
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить')
      router.push('/admin/support-wizards')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  /* ── Persistence helpers ──────────────────────────────── */

  const markDirty = () => setDirty(true)

  const savePositions = useCallback(async (nodes: WizardNode[]) => {
    await adminApi.saveSupportWizardPositions(id, nodes.map(n => ({ id: n.id, posX: n.posX, posY: n.posY })))
  }, [id])

  /* ── Canvas mouse handlers ────────────────────────────── */

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).dataset?.canvas !== '1') return
    setSelectedNodeId(null)
    setPanning({ startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY })
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setPanX(panning.origPanX + (e.clientX - panning.startX))
      setPanY(panning.origPanY + (e.clientY - panning.startY))
    } else if (dragging && wizard) {
      const dx = (e.clientX - dragging.startX) / zoom
      const dy = (e.clientY - dragging.startY) / zoom
      setWizard(w => w && {
        ...w,
        nodes: w.nodes.map(n => n.id === dragging.nodeId
          ? { ...n, posX: dragging.origPosX + dx, posY: dragging.origPosY + dy }
          : n),
      })
    } else if (connecting && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      setConnecting({ ...connecting, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top })
    }
  }

  const handleCanvasMouseUp = async () => {
    if (dragging && wizard) {
      setDragging(null)
      await savePositions(wizard.nodes)
    }
    if (panning) setPanning(null)
    if (connecting) setConnecting(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    setZoom(z => Math.max(0.3, Math.min(1.8, z * delta)))
  }

  /* ── Node actions ─────────────────────────────────────── */

  const addNode = async (type: NodeType) => {
    if (!wizard) return
    const tmpl = NODE_TEMPLATES.find(t => t.type === type)!
    const centerX = -panX / zoom + 200
    const centerY = -panY / zoom + 200
    try {
      const created = await adminApi.createSupportWizardNode(id, {
        nodeType: type,
        ...tmpl.defaults,
        posX: centerX,
        posY: centerY,
      })
      const fresh = await adminApi.getSupportWizard(id)
      setWizard(fresh)
      setSelectedNodeId(created.id)
      toast.success('Узел добавлен')
    } catch (e: any) {
      toast.error(e.message || 'Не удалось добавить узел')
    }
  }

  const patchNode = (nodeId: string, patch: Partial<WizardNode>) => {
    setWizard(w => w && {
      ...w,
      nodes: w.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n),
    })
    markDirty()
  }

  const saveNode = async (node: WizardNode) => {
    try {
      await adminApi.updateSupportWizardNode(id, node.id, {
        nodeType: node.nodeType,
        answerId: node.answerId,
        question: node.question,
        hint: node.hint,
        placeholder: node.placeholder,
        optional: node.optional,
        options: node.options,
        nextNodeId: node.nextNodeId,
        subjectTemplate: node.subjectTemplate,
        bodyTemplate: node.bodyTemplate,
      })
    } catch (e: any) {
      toast.error(e.message || 'Не удалось сохранить узел')
    }
  }

  const saveAll = async () => {
    if (!wizard) return
    setSaving(true)
    try {
      for (const n of wizard.nodes) await saveNode(n)
      setDirty(false)
      toast.success('Сохранено')
    } finally {
      setSaving(false)
    }
  }

  const deleteNode = async (nodeId: string) => {
    if (!wizard) return
    if (!confirm('Удалить узел и все связи?')) return
    try {
      await adminApi.deleteSupportWizardNode(id, nodeId)
      setSelectedNodeId(null)
      const fresh = await adminApi.getSupportWizard(id)
      setWizard(fresh)
      toast.success('Удалено')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    }
  }

  const setAsEntry = async (nodeId: string) => {
    if (!wizard) return
    try {
      await adminApi.updateSupportWizard(id, { entryNodeId: nodeId })
      setWizard(w => w && { ...w, entryNodeId: nodeId })
      toast.success('Стартовый узел установлен')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    }
  }

  /* ── Edge connection ──────────────────────────────────── */

  const startConnection = (fromNodeId: string, fromOptionValue: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    setConnecting({
      fromNodeId, fromOptionValue,
      mouseX: e.clientX - rect.left,
      mouseY: e.clientY - rect.top,
    })
  }

  const finishConnection = (toNodeId: string) => {
    if (!connecting || !wizard) return
    if (connecting.fromNodeId === toNodeId) { setConnecting(null); return }

    if (connecting.fromOptionValue === null) {
      // text/textarea → simple next
      patchNode(connecting.fromNodeId, { nextNodeId: toNodeId })
      const node = wizard.nodes.find(n => n.id === connecting.fromNodeId)
      if (node) saveNode({ ...node, nextNodeId: toNodeId })
    } else {
      // choice option
      const node = wizard.nodes.find(n => n.id === connecting.fromNodeId)
      if (node && node.options) {
        const newOptions = node.options.map(o =>
          o.value === connecting.fromOptionValue ? { ...o, nextNodeId: toNodeId } : o)
        patchNode(connecting.fromNodeId, { options: newOptions })
        saveNode({ ...node, options: newOptions })
      }
    }
    setConnecting(null)
  }

  const clearConnection = (fromNodeId: string, fromOptionValue: string | null) => {
    if (!wizard) return
    if (fromOptionValue === null) {
      patchNode(fromNodeId, { nextNodeId: null })
      const node = wizard.nodes.find(n => n.id === fromNodeId)
      if (node) saveNode({ ...node, nextNodeId: null })
    } else {
      const node = wizard.nodes.find(n => n.id === fromNodeId)
      if (node && node.options) {
        const newOptions = node.options.map(o =>
          o.value === fromOptionValue ? { ...o, nextNodeId: null } : o)
        patchNode(fromNodeId, { options: newOptions })
        saveNode({ ...node, options: newOptions })
      }
    }
  }

  /* ── Derived ──────────────────────────────────────────── */

  const selectedNode = useMemo(
    () => wizard?.nodes.find(n => n.id === selectedNodeId) || null,
    [wizard, selectedNodeId],
  )

  /* ── Edge points calculation ──────────────────────────── */

  const getNodeOutputPos = (node: WizardNode, optionValue: string | null) => {
    const x = node.posX + NODE_W
    let y: number
    if (optionValue === null) {
      // bottom-center for text/textarea, or center for terminal (no output)
      y = node.posY + nodeHeight(node) / 2
    } else {
      // choice option row
      const idx = node.options?.findIndex(o => o.value === optionValue) ?? 0
      y = node.posY + NODE_HEADER_H + OPTION_H * idx + OPTION_H / 2
    }
    return { x, y }
  }

  const getNodeInputPos = (node: WizardNode) => ({
    x: node.posX,
    y: node.posY + NODE_HEADER_H / 2,
  })

  const worldToScreen = (x: number, y: number) => ({
    sx: x * zoom + panX,
    sy: y * zoom + panY,
  })

  /* ── Render ───────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
      </div>
    )
  }
  if (!wizard) return null

  /* Build edges list for SVG rendering */
  const edges: Array<{ fromId: string; toId: string; optionValue: string | null; label?: string }> = []
  for (const n of wizard.nodes) {
    if (n.nodeType === 'choice' && n.options) {
      for (const o of n.options) {
        if (o.nextNodeId) {
          edges.push({ fromId: n.id, toId: o.nextNodeId, optionValue: o.value, label: o.label })
        }
      }
    } else if ((n.nodeType === 'text' || n.nodeType === 'textarea') && n.nextNodeId) {
      edges.push({ fromId: n.id, toId: n.nextNodeId, optionValue: null })
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]" onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
      {/* ── Palette ─────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 glass rounded-2xl p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <Link href="/admin/support-wizards"
                className="flex items-center gap-1.5 text-sm px-2 py-1 rounded-lg hover:bg-white/5 transition"
                style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="w-4 h-4" /> Назад
          </Link>
        </div>

        <div>
          <h2 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            {wizard.title}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {wizard.nodes.length} узлов
          </p>
        </div>

        <div className="h-px" style={{ background: 'var(--glass-border)' }} />

        <div className="text-[11px] font-semibold uppercase tracking-wider"
             style={{ color: 'var(--text-tertiary)' }}>
          Добавить узел
        </div>
        {NODE_TEMPLATES.map(t => {
          const Icon = t.icon
          return (
            <button key={t.type} onClick={() => addNode(t.type)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition hover:bg-white/5"
                    style={{ color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
              <Icon className="w-4 h-4 shrink-0" style={{ color: t.color }} />
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}

        <div className="h-px" style={{ background: 'var(--glass-border)' }} />

        <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <div className="font-semibold mb-1">💡 Подсказки</div>
          <ul className="space-y-1 leading-snug">
            <li>• Тяни от ● к ● чтобы соединить</li>
            <li>• Ctrl+колесо для зума</li>
            <li>• Перетаскивай фон для скролла</li>
            <li>• {'{{id}}'} в шаблоне = ответ</li>
          </ul>
        </div>

        <div className="flex-1" />

        {dirty && (
          <button onClick={saveAll} disabled={saving}
                  className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg text-sm transition"
                  style={{ background: '#22c55e', color: 'white' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        )}
      </div>

      {/* ── Canvas ──────────────────────────────────────── */}
      <div className="flex-1 relative rounded-2xl overflow-hidden"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 glass rounded-lg p-1">
          <button onClick={() => setZoom(z => Math.max(0.3, z * 0.9))}
                  className="p-1.5 rounded hover:bg-white/10" title="Уменьшить">
            <ZoomOut className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-[11px] w-10 text-center" style={{ color: 'var(--text-tertiary)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(1.8, z * 1.1))}
                  className="p-1.5 rounded hover:bg-white/10" title="Увеличить">
            <ZoomIn className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="w-px h-4 mx-1" style={{ background: 'var(--glass-border)' }} />
          <button onClick={() => { setZoom(1); setPanX(60); setPanY(60) }}
                  className="p-1.5 rounded hover:bg-white/10" title="Сбросить вид">
            <Maximize2 className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {wizard.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center" style={{ color: 'var(--text-tertiary)' }}>
              <MousePointer2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Слева выбери тип узла чтобы начать</p>
            </div>
          </div>
        )}

        <div ref={canvasRef}
             data-canvas="1"
             className="w-full h-full relative cursor-grab"
             style={{ cursor: panning ? 'grabbing' : (connecting ? 'crosshair' : 'grab') }}
             onMouseDown={handleCanvasMouseDown}
             onMouseMove={handleCanvasMouseMove}
             onWheel={handleWheel}>
          {/* Grid background via SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none"
               style={{ zIndex: 0 }}>
            <defs>
              <pattern id="wz-grid" width={20 * zoom} height={20 * zoom}
                       patternUnits="userSpaceOnUse"
                       x={panX % (20 * zoom)} y={panY % (20 * zoom)}>
                <circle cx={1} cy={1} r={1} fill="currentColor" opacity={0.1} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wz-grid)"
                  style={{ color: 'var(--text-tertiary)' }} />
          </svg>

          {/* Edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none"
               style={{ zIndex: 1, overflow: 'visible' }}>
            <defs>
              <marker id="wz-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
              </marker>
            </defs>
            {edges.map((edge, i) => {
              const fromNode = wizard.nodes.find(n => n.id === edge.fromId)
              const toNode = wizard.nodes.find(n => n.id === edge.toId)
              if (!fromNode || !toNode) return null
              const from = getNodeOutputPos(fromNode, edge.optionValue)
              const to = getNodeInputPos(toNode)
              const s1 = worldToScreen(from.x, from.y)
              const s2 = worldToScreen(to.x, to.y)
              const midX = (s1.sx + s2.sx) / 2
              const d = `M ${s1.sx},${s1.sy} C ${midX},${s1.sy} ${midX},${s2.sy} ${s2.sx},${s2.sy}`
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#06b6d4" strokeWidth={2 * zoom}
                        markerEnd="url(#wz-arrow)" opacity={0.8} />
                  {edge.label && (
                    <text x={midX} y={(s1.sy + s2.sy) / 2 - 6} textAnchor="middle"
                          fill="#06b6d4" fontSize={10 * zoom} opacity={0.9}>
                      {edge.label.length > 20 ? edge.label.slice(0, 20) + '…' : edge.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* In-progress connection */}
            {connecting && (() => {
              const fromNode = wizard.nodes.find(n => n.id === connecting.fromNodeId)
              if (!fromNode) return null
              const from = getNodeOutputPos(fromNode, connecting.fromOptionValue)
              const s1 = worldToScreen(from.x, from.y)
              return (
                <path d={`M ${s1.sx},${s1.sy} L ${connecting.mouseX},${connecting.mouseY}`}
                      fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />
              )
            })()}
          </svg>

          {/* Nodes */}
          <div className="absolute inset-0" style={{ zIndex: 2 }}>
            {wizard.nodes.map(n => {
              const { sx, sy } = worldToScreen(n.posX, n.posY)
              const h = nodeHeight(n)
              const tmpl = NODE_TEMPLATES.find(t => t.type === n.nodeType)!
              const isEntry = wizard.entryNodeId === n.id
              const isSelected = selectedNodeId === n.id

              return (
                <div key={n.id}
                     onMouseDown={e => {
                       e.stopPropagation()
                       setSelectedNodeId(n.id)
                       setDragging({
                         nodeId: n.id,
                         startX: e.clientX, startY: e.clientY,
                         origPosX: n.posX, origPosY: n.posY,
                       })
                     }}
                     className="absolute rounded-xl shadow-lg"
                     style={{
                       left: sx,
                       top: sy,
                       width: NODE_W * zoom,
                       height: h * zoom,
                       background: 'var(--surface-1)',
                       border: `2px solid ${isSelected ? '#06b6d4' : (isEntry ? '#22c55e' : 'var(--glass-border)')}`,
                       cursor: dragging?.nodeId === n.id ? 'grabbing' : 'grab',
                       transform: 'translate(0, 0)',
                       transformOrigin: 'top left',
                     }}>
                  {/* Header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b"
                       style={{
                         borderColor: 'var(--glass-border)',
                         fontSize: 13 * zoom,
                         height: NODE_HEADER_H * zoom,
                       }}>
                    <tmpl.icon className="shrink-0" style={{ width: 16 * zoom, height: 16 * zoom, color: tmpl.color }} />
                    <span className="flex-1 truncate font-medium"
                          style={{ color: 'var(--text-primary)', fontSize: 13 * zoom }}>
                      {n.nodeType === 'terminal' ? 'Финал' : (n.question || tmpl.label)}
                    </span>
                    {isEntry && <Star style={{ width: 12 * zoom, height: 12 * zoom, color: '#22c55e' }} />}
                  </div>

                  {/* Input port (left center of header) */}
                  {n.nodeType !== 'terminal' || true ? (
                    <div
                      onMouseUp={e => { e.stopPropagation(); if (connecting) finishConnection(n.id) }}
                      className="absolute rounded-full border-2"
                      style={{
                        left: -6 * zoom,
                        top: (NODE_HEADER_H / 2 - 6) * zoom,
                        width: 12 * zoom, height: 12 * zoom,
                        background: 'var(--surface-1)',
                        borderColor: '#06b6d4',
                        cursor: connecting ? 'crosshair' : 'default',
                      }}
                    />
                  ) : null}

                  {/* Body */}
                  {n.nodeType === 'choice' && n.options && (
                    <div className="py-1">
                      {n.options.map((o, i) => (
                        <div key={o.value} className="relative flex items-center px-3"
                             style={{
                               height: OPTION_H * zoom,
                               fontSize: 12 * zoom,
                               color: 'var(--text-secondary)',
                             }}>
                          <span className="truncate flex-1">
                            {o.icon && <span className="mr-1">{o.icon}</span>}
                            {o.label}
                          </span>
                          {/* Per-option output port */}
                          <div
                            onMouseDown={e => startConnection(n.id, o.value, e)}
                            className="absolute rounded-full border-2"
                            style={{
                              right: -6 * zoom,
                              top: (OPTION_H / 2 - 6) * zoom,
                              width: 12 * zoom, height: 12 * zoom,
                              background: o.nextNodeId ? '#06b6d4' : 'var(--surface-1)',
                              borderColor: '#06b6d4',
                              cursor: 'crosshair',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {(n.nodeType === 'text' || n.nodeType === 'textarea') && (
                    <div className="px-3 py-2 flex flex-col gap-1"
                         style={{ fontSize: 11 * zoom, color: 'var(--text-tertiary)' }}>
                      <div className="truncate">{n.placeholder || '—'}</div>
                      {n.optional && <div className="text-[10px]" style={{ color: '#f59e0b' }}>необязательно</div>}
                      {/* Output port on right middle */}
                      <div
                        onMouseDown={e => startConnection(n.id, null, e)}
                        className="absolute rounded-full border-2"
                        style={{
                          right: -6 * zoom,
                          top: (nodeHeight(n) / 2 - 6) * zoom,
                          width: 12 * zoom, height: 12 * zoom,
                          background: n.nextNodeId ? '#06b6d4' : 'var(--surface-1)',
                          borderColor: '#06b6d4',
                          cursor: 'crosshair',
                        }}
                      />
                    </div>
                  )}

                  {n.nodeType === 'terminal' && (
                    <div className="px-3 py-2"
                         style={{ fontSize: 11 * zoom, color: 'var(--text-tertiary)' }}>
                      <div className="font-medium mb-1 truncate"
                           style={{ color: 'var(--text-secondary)' }}>
                        {n.subjectTemplate || '(шаблон темы)'}
                      </div>
                      <div className="truncate opacity-70">
                        {n.bodyTemplate?.split('\n')[0] || '(шаблон текста)'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Inspector ───────────────────────────────────── */}
      <div className="w-[340px] shrink-0 glass rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto">
        {!selectedNode ? (
          <div className="flex items-center justify-center h-full text-center"
               style={{ color: 'var(--text-tertiary)' }}>
            <div>
              <MousePointer2 className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Выбери узел для редактирования</p>
            </div>
          </div>
        ) : (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            isEntry={wizard.entryNodeId === selectedNode.id}
            allNodes={wizard.nodes}
            onPatch={patch => patchNode(selectedNode.id, patch)}
            onSave={() => saveNode(selectedNode)}
            onDelete={() => deleteNode(selectedNode.id)}
            onSetEntry={() => setAsEntry(selectedNode.id)}
            onClearEdge={(optionValue) => clearConnection(selectedNode.id, optionValue)}
          />
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   Node Inspector (right panel)
   ════════════════════════════════════════════════════════════ */

function NodeInspector({
  node, isEntry, allNodes,
  onPatch, onSave, onDelete, onSetEntry, onClearEdge,
}: {
  node: WizardNode
  isEntry: boolean
  allNodes: WizardNode[]
  onPatch: (patch: Partial<WizardNode>) => void
  onSave: () => void
  onDelete: () => void
  onSetEntry: () => void
  onClearEdge: (optionValue: string | null) => void
}) {
  const saveDebounce = useRef<number | null>(null)
  const debouncedSave = () => {
    if (saveDebounce.current) window.clearTimeout(saveDebounce.current)
    saveDebounce.current = window.setTimeout(() => onSave(), 500)
  }

  const tmpl = NODE_TEMPLATES.find(t => t.type === node.nodeType)!

  const answerIds = useMemo(() => {
    const ids: string[] = []
    for (const n of allNodes) {
      if (n.nodeType !== 'terminal' && n.answerId) ids.push(n.answerId)
    }
    return ids
  }, [allNodes])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <tmpl.icon className="w-4 h-4" style={{ color: tmpl.color }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {tmpl.label}
        </span>
        {node.answerId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full ml-auto font-mono"
                style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
            {node.answerId}
          </span>
        )}
      </div>

      {!isEntry ? (
        <button onClick={onSetEntry}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition hover:bg-white/5"
                style={{ color: 'var(--text-secondary)', border: '1px dashed var(--glass-border)' }}>
          <Star className="w-3.5 h-3.5" />
          Сделать стартовым
        </button>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
             style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
          <Star className="w-3.5 h-3.5 fill-current" />
          Стартовый узел
        </div>
      )}

      {node.nodeType !== 'terminal' && (
        <>
          <Field label="ID ответа (для шаблонов)">
            <input type="text"
                   value={node.answerId || ''}
                   placeholder="например: device"
                   onChange={e => { onPatch({ answerId: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() }); debouncedSave() }}
                   onBlur={onSave}
                   className="w-full px-2 py-1.5 rounded-md text-sm font-mono"
                   style={inputStyle} />
          </Field>
          <Field label="Вопрос">
            <input type="text"
                   value={node.question || ''}
                   onChange={e => { onPatch({ question: e.target.value }); debouncedSave() }}
                   onBlur={onSave}
                   className="w-full px-2 py-1.5 rounded-md text-sm"
                   style={inputStyle} />
          </Field>
          <Field label="Подсказка (мелким шрифтом)">
            <input type="text"
                   value={node.hint || ''}
                   onChange={e => { onPatch({ hint: e.target.value }); debouncedSave() }}
                   onBlur={onSave}
                   className="w-full px-2 py-1.5 rounded-md text-sm"
                   style={inputStyle} />
          </Field>
        </>
      )}

      {(node.nodeType === 'text' || node.nodeType === 'textarea') && (
        <>
          <Field label="Placeholder">
            <input type="text"
                   value={node.placeholder || ''}
                   onChange={e => { onPatch({ placeholder: e.target.value }); debouncedSave() }}
                   onBlur={onSave}
                   className="w-full px-2 py-1.5 rounded-md text-sm"
                   style={inputStyle} />
          </Field>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox"
                   checked={node.optional}
                   onChange={e => { onPatch({ optional: e.target.checked }); onSave() }} />
            Необязательный ответ
          </label>
          <EdgeRow label="→ Следующий узел"
                   targetId={node.nextNodeId}
                   allNodes={allNodes}
                   currentId={node.id}
                   onChange={(id) => { onPatch({ nextNodeId: id }); onSave() }}
                   onClear={() => onClearEdge(null)} />
        </>
      )}

      {node.nodeType === 'choice' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-tertiary)' }}>
              Варианты ответа
            </span>
            <button onClick={() => {
              const newOptions = [...(node.options || []), {
                value: `opt${Date.now().toString(36).slice(-4)}`,
                label: 'Новый вариант',
                icon: null,
                nextNodeId: null,
              }]
              onPatch({ options: newOptions })
              onSave()
            }} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/5 transition"
                    style={{ color: 'var(--accent-1)' }}>
              <Plus className="w-3.5 h-3.5" /> Добавить
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(node.options || []).map((opt, idx) => (
              <div key={opt.value} className="rounded-lg p-2 flex flex-col gap-1.5"
                   style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-1.5">
                  <input type="text" value={opt.icon || ''} placeholder="🔹"
                         maxLength={2}
                         onChange={e => {
                           const newOpts = [...(node.options || [])]
                           newOpts[idx] = { ...opt, icon: e.target.value || null }
                           onPatch({ options: newOpts }); debouncedSave()
                         }}
                         onBlur={onSave}
                         className="w-9 px-1.5 py-1 rounded text-center text-sm"
                         style={inputStyle} />
                  <input type="text" value={opt.label}
                         onChange={e => {
                           const newOpts = [...(node.options || [])]
                           newOpts[idx] = { ...opt, label: e.target.value }
                           onPatch({ options: newOpts }); debouncedSave()
                         }}
                         onBlur={onSave}
                         className="flex-1 px-2 py-1 rounded text-sm"
                         style={inputStyle} />
                  <button onClick={() => {
                    const newOpts = (node.options || []).filter((_, i) => i !== idx)
                    onPatch({ options: newOpts }); onSave()
                  }}
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-400"
                          style={{ color: 'var(--text-tertiary)' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Link2 className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                  <select value={opt.nextNodeId || ''}
                          onChange={e => {
                            const newOpts = [...(node.options || [])]
                            newOpts[idx] = { ...opt, nextNodeId: e.target.value || null }
                            onPatch({ options: newOpts }); onSave()
                          }}
                          className="flex-1 px-1.5 py-1 rounded text-xs"
                          style={inputStyle}>
                    <option value="">— не подключено —</option>
                    {allNodes.filter(n => n.id !== node.id).map(n => (
                      <option key={n.id} value={n.id}>
                        {n.nodeType === 'terminal' ? '🏁 Финал' : (n.question?.slice(0, 40) || n.id.slice(0, 8))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {(node.options || []).length === 0 && (
              <div className="text-xs text-center py-3" style={{ color: 'var(--text-tertiary)' }}>
                Добавь хотя бы один вариант
              </div>
            )}
          </div>
        </div>
      )}

      {node.nodeType === 'terminal' && (
        <>
          <div className="text-xs p-2 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
            Используй <code className="px-1 rounded" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>{'{{answerId}}'}</code> для
            подстановки значения или <code className="px-1 rounded" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>{'{{answerId:label}}'}</code> для
            человекочитаемой метки варианта.
          </div>
          {answerIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {answerIds.map(aid => (
                <code key={aid} className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                      onClick={() => navigator.clipboard?.writeText(`{{${aid}}}`)}
                      style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
                      title="Кликни чтобы скопировать">
                  {`{{${aid}}}`}
                </code>
              ))}
            </div>
          )}
          <Field label="Шаблон темы тикета">
            <input type="text"
                   value={node.subjectTemplate || ''}
                   onChange={e => { onPatch({ subjectTemplate: e.target.value }); debouncedSave() }}
                   onBlur={onSave}
                   className="w-full px-2 py-1.5 rounded-md text-sm font-mono"
                   style={inputStyle} />
          </Field>
          <Field label="Шаблон текста тикета">
            <textarea rows={5}
                      value={node.bodyTemplate || ''}
                      onChange={e => { onPatch({ bodyTemplate: e.target.value }); debouncedSave() }}
                      onBlur={onSave}
                      className="w-full px-2 py-1.5 rounded-md text-sm font-mono"
                      style={inputStyle} />
          </Field>
        </>
      )}

      <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--glass-border)' }}>
        <button onClick={onDelete}
                className="w-full flex items-center gap-2 justify-center px-3 py-2 rounded-lg text-sm transition"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <Trash2 className="w-4 h-4" /> Удалить узел
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function EdgeRow({
  label, targetId, allNodes, currentId, onChange, onClear,
}: {
  label: string
  targetId: string | null | undefined
  allNodes: WizardNode[]
  currentId: string
  onChange: (id: string | null) => void
  onClear: () => void
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <select value={targetId || ''}
                onChange={e => onChange(e.target.value || null)}
                className="flex-1 px-2 py-1.5 rounded text-sm"
                style={inputStyle}>
          <option value="">— не подключено —</option>
          {allNodes.filter(n => n.id !== currentId).map(n => (
            <option key={n.id} value={n.id}>
              {n.nodeType === 'terminal' ? '🏁 Финал' : (n.question?.slice(0, 40) || n.id.slice(0, 8))}
            </option>
          ))}
        </select>
        {targetId && (
          <button onClick={onClear}
                  className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400"
                  style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Field>
  )
}

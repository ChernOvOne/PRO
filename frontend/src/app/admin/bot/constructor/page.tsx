'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Search, Plus, ChevronDown, ChevronRight, GripVertical,
  Trash2, Copy, Eye, EyeOff, X, ZoomIn, ZoomOut, Maximize2,
  MessageSquare, GitBranch, Zap, TextCursorInput, Clock,
  SplitSquareHorizontal, CornerUpRight, CreditCard, Image,
  Sparkles, Heart, Radio, Gift, Globe, Mail, Bell, UserCheck,
  Filter, Play, Bold, Italic, Code, Link2, Quote, Smile,
  Variable, ChevronUp, ArrowDown, ArrowUp, Save, Check,
  LayoutGrid, Workflow,
} from 'lucide-react'

/* ================================================================
   Types
   ================================================================ */

interface BotGroup {
  id: string
  name: string
  sortOrder: number
  blocks?: BotBlock[]
}

interface BotButton {
  id: string
  blockId: string
  label: string
  type: 'block' | 'url' | 'webapp' | 'copy_text' | 'pay'
  nextBlockId?: string | null
  url?: string | null
  copyText?: string | null
  style: string
  iconEmojiId?: string | null
  row: number
  col: number
  sortOrder: number
}

interface BotTrigger {
  id: string
  blockId: string
  type: 'command' | 'text' | 'callback' | 'event'
  value: string
  priority: number
}

interface BotBlock {
  id: string
  groupId: string
  name: string
  type: BlockType
  isDraft: boolean
  posX: number
  posY: number
  text?: string | null
  parseMode?: string | null
  mediaUrl?: string | null
  mediaType?: string | null
  pinMessage?: boolean
  deletePrevious?: string | null
  messageEffectId?: string | null
  nextBlockId?: string | null
  nextBlockTrue?: string | null
  nextBlockFalse?: string | null
  conditionType?: string | null
  conditionValue?: string | null
  conditionLogic?: string | null
  conditions?: any[] | null
  actionType?: string | null
  actionValue?: string | null
  promptText?: string | null
  varName?: string | null
  validation?: string | null
  delayMinutes?: number | null
  delayUnit?: string | null
  paymentTitle?: string | null
  paymentDescription?: string | null
  paymentAmount?: number | null
  paymentPayload?: string | null
  metaJson?: any
  buttons?: BotButton[]
  triggers?: BotTrigger[]
}

type BlockType =
  | 'MESSAGE' | 'CONDITION' | 'ACTION' | 'INPUT' | 'DELAY'
  | 'SPLIT' | 'REDIRECT' | 'PAYMENT' | 'MEDIA_GROUP' | 'EFFECT'
  | 'REACTION' | 'STREAMING' | 'GIFT' | 'HTTP' | 'EMAIL'
  | 'NOTIFY_ADMIN' | 'ASSIGN' | 'FUNNEL'

interface DraggingConnection {
  sourceId: string
  sourcePort: 'next' | 'true' | 'false'
  mouseX: number
  mouseY: number
}

/* ================================================================
   Constants
   ================================================================ */

const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  MESSAGE: '#06b6d4',
  CONDITION: '#f59e0b',
  ACTION: '#a855f7',
  INPUT: '#10b981',
  DELAY: '#64748b',
  SPLIT: '#ec4899',
  REDIRECT: '#6366f1',
  PAYMENT: '#eab308',
  MEDIA_GROUP: '#92400e',
  EFFECT: '#d946ef',
  REACTION: '#f97316',
  STREAMING: '#facc15',
  GIFT: '#f43f5e',
  HTTP: '#14b8a6',
  EMAIL: '#3b82f6',
  NOTIFY_ADMIN: '#ef4444',
  ASSIGN: '#6b7280',
  FUNNEL: '#7c3aed',
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  MESSAGE: 'Сообщение',
  CONDITION: 'Условие',
  ACTION: 'Действие',
  INPUT: 'Ввод данных',
  DELAY: 'Задержка',
  SPLIT: 'A/B тест',
  REDIRECT: 'Переход',
  PAYMENT: 'Оплата',
  MEDIA_GROUP: 'Альбом',
  EFFECT: 'Эффект',
  REACTION: 'Реакция',
  STREAMING: 'Стриминг',
  GIFT: 'Подарок',
  HTTP: 'HTTP запрос',
  EMAIL: 'Email',
  NOTIFY_ADMIN: 'Уведомить админа',
  ASSIGN: 'Оператор',
  FUNNEL: 'Воронка',
}

const BLOCK_TYPE_ICONS: Record<BlockType, any> = {
  MESSAGE: MessageSquare,
  CONDITION: GitBranch,
  ACTION: Zap,
  INPUT: TextCursorInput,
  DELAY: Clock,
  SPLIT: SplitSquareHorizontal,
  REDIRECT: CornerUpRight,
  PAYMENT: CreditCard,
  MEDIA_GROUP: Image,
  EFFECT: Sparkles,
  REACTION: Heart,
  STREAMING: Radio,
  GIFT: Gift,
  HTTP: Globe,
  EMAIL: Mail,
  NOTIFY_ADMIN: Bell,
  ASSIGN: UserCheck,
  FUNNEL: Filter,
}

const BLOCK_TYPES: BlockType[] = [
  'MESSAGE', 'CONDITION', 'ACTION', 'INPUT', 'DELAY',
  'SPLIT', 'REDIRECT', 'PAYMENT', 'MEDIA_GROUP', 'EFFECT',
  'REACTION', 'STREAMING', 'GIFT', 'HTTP', 'EMAIL',
  'NOTIFY_ADMIN', 'ASSIGN', 'FUNNEL',
]

const VARIABLES = [
  '{name}', '{email}', '{balance}', '{bonusDays}',
  '{subStatus}', '{daysLeft}', '{referralCode}', '{appUrl}',
]

const CONDITION_TYPES: { value: string; label: string }[] = [
  { value: 'has_sub', label: 'Есть подписка' },
  { value: 'no_sub', label: 'Нет подписки' },
  { value: 'expired', label: 'Подписка истекла' },
  { value: 'has_email', label: 'Есть email' },
  { value: 'has_tag', label: 'Есть тег' },
  { value: 'has_var', label: 'Есть переменная' },
  { value: 'balance_gt', label: 'Баланс больше' },
  { value: 'bonus_days_gt', label: 'Бонус дней больше' },
  { value: 'days_left_lt', label: 'Дней осталось меньше' },
  { value: 'referral_count_gt', label: 'Рефералов больше' },
  { value: 'is_new', label: 'Новый пользователь' },
  { value: 'language_is', label: 'Язык равен' },
]

const ACTION_TYPES: { value: string; label: string }[] = [
  { value: 'bonus_days', label: 'Начислить бонус дней' },
  { value: 'balance', label: 'Изменить баланс' },
  { value: 'trial', label: 'Выдать триал' },
  { value: 'add_tag', label: 'Добавить тег' },
  { value: 'remove_tag', label: 'Удалить тег' },
  { value: 'set_var', label: 'Установить переменную' },
]

const BUTTON_TYPE_LABELS: Record<string, string> = {
  block: 'Переход к блоку',
  url: 'Ссылка',
  webapp: 'Web-приложение',
  copy_text: 'Копировать текст',
  pay: 'Оплата',
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  command: 'Команда',
  text: 'Текст',
  callback: 'Callback',
  event: 'Событие',
}

const VALIDATION_TYPES = ['email', 'phone', 'number', 'text']

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Смайлики': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','😘','😗','😋','😛','😜','🤪','😝','🤗','🤭','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😥','😓','🤗','🤠','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😴','💤','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Люди': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄'],
  'Природа': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷','🌸','🌹','🌺','🌻','🌼','🌷','🌱','🌿','☘','🍀','🍁','🍂','🍃','🌲','🌳','🌴'],
  'Еда': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🥕','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪'],
  'Символы': ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','☸','✡','🔯','🕎','☯','☦','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','✅','❌','⭕','❗','❓','💯','🔥','⭐','🌟','✨','💫','💥','💢','💤'],
}

const NODE_W = 180
const NODE_H = 60

/* ================================================================
   Component
   ================================================================ */

export default function BotConstructorPage() {
  /* ── Data state ─────────────────────────────────────────── */
  const [groups, setGroups] = useState<BotGroup[]>([])
  const [blocks, setBlocks] = useState<BotBlock[]>([])
  const [allBlocks, setAllBlocks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  /* ── UI state ───────────────────────────────────────────── */
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Смайлики')
  const [variableDropdownOpen, setVariableDropdownOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  /* ── Canvas state ───────────────────────────────────────── */
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(50)
  const [panY, setPanY] = useState(50)
  const [dragging, setDragging] = useState<{ blockId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Connection dragging state ──────────────────────────── */
  const [draggingConnection, setDraggingConnection] = useState<DraggingConnection | null>(null)
  const [hoveredInputPort, setHoveredInputPort] = useState<string | null>(null)

  /* ── Editor form state ──────────────────────────────────── */
  const [editForm, setEditForm] = useState<Partial<BotBlock>>({})
  const [editDirty, setEditDirty] = useState(false)

  /* ── New group / block dialogs ──────────────────────────── */
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newBlockGroupId, setNewBlockGroupId] = useState<string | null>(null)
  const [newBlockName, setNewBlockName] = useState('')
  const [newBlockType, setNewBlockType] = useState<BlockType>('MESSAGE')

  /* ── Trigger form ───────────────────────────────────────── */
  const [showTriggerForm, setShowTriggerForm] = useState(false)
  const [triggerForm, setTriggerForm] = useState({ type: 'command' as string, value: '', priority: 0 })

  /* ── Button form ────────────────────────────────────────── */
  const [showButtonForm, setShowButtonForm] = useState(false)
  const [buttonForm, setButtonForm] = useState({
    label: '', type: 'block' as string, nextBlockId: '' as string,
    url: '', copyText: '', style: 'default', iconEmojiId: '', row: 0, col: 0,
  })

  /* ── Condition form ─────────────────────────────────────── */
  const [conditionRows, setConditionRows] = useState<{ type: string; value: string }[]>([])

  /* ================================================================
     Data fetching — single Promise.all on mount
     ================================================================ */

  const fetchData = useCallback(async () => {
    try {
      const [grps, blkRes, blkList] = await Promise.all([
        adminApi.botBlockGroups(),
        adminApi.botBlocks(),
        adminApi.botBlocksList(),
      ])
      setGroups(grps || [])
      setBlocks((blkRes as any).blocks || blkRes || [])
      setAllBlocks(blkList || [])
    } catch (e: any) {
      toast.error('Ошибка загрузки: ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── Derived (memoized) ─────────────────────────────────── */
  const selectedBlock = useMemo(
    () => blocks.find(b => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId],
  )

  const blockMap = useMemo(() => {
    const m = new Map<string, BotBlock>()
    blocks.forEach(b => m.set(b.id, b))
    return m
  }, [blocks])

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return blocks
    const q = searchQuery.toLowerCase()
    return blocks.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.type.toLowerCase().includes(q) ||
      (BLOCK_TYPE_LABELS[b.type] || '').toLowerCase().includes(q)
    )
  }, [blocks, searchQuery])

  const groupedBlocks = useMemo(() => {
    const m = new Map<string, BotBlock[]>()
    filteredBlocks.forEach(b => {
      const arr = m.get(b.groupId) || []
      arr.push(b)
      m.set(b.groupId, arr)
    })
    return m
  }, [filteredBlocks])

  /* ── Select block ────────────────────────────────────────── */
  const selectBlock = useCallback((block: BotBlock | null) => {
    if (block) {
      setSelectedBlockId(block.id)
      setEditForm({ ...block })
      setEditDirty(false)
      setRightPanelOpen(true)
      setConditionRows(block.conditions || (block.conditionType ? [{ type: block.conditionType, value: block.conditionValue || '' }] : []))
    } else {
      setSelectedBlockId(null)
      setEditForm({})
      setEditDirty(false)
    }
  }, [])

  /* ── Edit helpers (local state, API only on Save) ───────── */
  const updateField = (field: string, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    setEditDirty(true)
  }

  const saveBlock = async () => {
    if (!selectedBlockId || !editDirty) return
    try {
      const payload = { ...editForm }
      delete payload.id
      delete payload.buttons
      delete payload.triggers
      if (conditionRows.length > 0 && editForm.type === 'CONDITION') {
        payload.conditions = conditionRows
        payload.conditionType = conditionRows[0]?.type
        payload.conditionValue = conditionRows[0]?.value
      }
      await adminApi.updateBotBlock(selectedBlockId, payload)
      toast.success('Блок сохранён')
      setEditDirty(false)
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const publishBlock = async () => {
    if (!selectedBlockId) return
    try {
      await adminApi.publishBotBlock(selectedBlockId)
      toast.success('Блок опубликован')
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const deleteBlock = async (id: string) => {
    try {
      await adminApi.deleteBotBlock(id)
      toast.success('Блок удалён')
      if (selectedBlockId === id) selectBlock(null)
      setDeleteConfirmId(null)
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Groups CRUD ─────────────────────────────────────────── */
  const createGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      await adminApi.createBotGroup({ name: newGroupName.trim(), sortOrder: groups.length })
      toast.success('Группа создана')
      setNewGroupName('')
      setShowNewGroup(false)
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm('Удалить группу и все её блоки?')) return
    try {
      await adminApi.deleteBotGroup(id)
      toast.success('Группа удалена')
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Block creation ──────────────────────────────────────── */
  const createBlock = async () => {
    if (!newBlockGroupId || !newBlockName.trim()) return
    try {
      const posX = 100 + Math.random() * 400
      const posY = 100 + Math.random() * 400
      await adminApi.createBotBlock({
        groupId: newBlockGroupId,
        name: newBlockName.trim(),
        type: newBlockType,
        posX: Math.round(posX),
        posY: Math.round(posY),
      })
      toast.success('Блок создан')
      setNewBlockGroupId(null)
      setNewBlockName('')
      setNewBlockType('MESSAGE')
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Buttons CRUD ────────────────────────────────────────── */
  const addButton = async () => {
    if (!selectedBlockId || !buttonForm.label.trim()) return
    try {
      await adminApi.createBotButton(selectedBlockId, {
        ...buttonForm,
        nextBlockId: buttonForm.type === 'block' ? buttonForm.nextBlockId || null : null,
        url: buttonForm.type === 'url' || buttonForm.type === 'webapp' ? buttonForm.url : null,
        copyText: buttonForm.type === 'copy_text' ? buttonForm.copyText : null,
      })
      toast.success('Кнопка добавлена')
      setShowButtonForm(false)
      setButtonForm({ label: '', type: 'block', nextBlockId: '', url: '', copyText: '', style: 'default', iconEmojiId: '', row: 0, col: 0 })
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const removeButton = async (id: string) => {
    try {
      await adminApi.deleteBotButton(id)
      toast.success('Кнопка удалена')
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Triggers CRUD ───────────────────────────────────────── */
  const addTrigger = async () => {
    if (!selectedBlockId || !triggerForm.value.trim()) return
    try {
      await adminApi.createBotTrigger({ blockId: selectedBlockId, ...triggerForm })
      toast.success('Триггер добавлен')
      setShowTriggerForm(false)
      setTriggerForm({ type: 'command', value: '', priority: 0 })
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const removeTrigger = async (id: string) => {
    try {
      await adminApi.deleteBotTrigger(id)
      toast.success('Триггер удалён')
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Debounced position save (500ms) ────────────────────── */
  const debouncedSavePosition = useCallback((blockId: string, posX: number, posY: number) => {
    if (positionSaveTimerRef.current) {
      clearTimeout(positionSaveTimerRef.current)
    }
    positionSaveTimerRef.current = setTimeout(async () => {
      try {
        await adminApi.updateBotBlock(blockId, { posX, posY })
      } catch {}
    }, 500)
  }, [])

  /* ── Canvas interactions ─────────────────────────────────── */
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-block-node]')) return
    if ((e.target as HTMLElement).closest('[data-port]')) return
    setPanning({ startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY })
  }

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setPanX(panning.origPanX + (e.clientX - panning.startX))
      setPanY(panning.origPanY + (e.clientY - panning.startY))
    }
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom
      const dy = (e.clientY - dragging.startY) / zoom
      setBlocks(prev => prev.map(b =>
        b.id === dragging.blockId
          ? { ...b, posX: Math.round(dragging.origPosX + dx), posY: Math.round(dragging.origPosY + dy) }
          : b
      ))
    }
    if (draggingConnection) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        setDraggingConnection(prev => prev ? {
          ...prev,
          mouseX: e.clientX - rect.left,
          mouseY: e.clientY - rect.top,
        } : null)
      }
    }
  }, [panning, dragging, draggingConnection, zoom])

  const handleCanvasMouseUp = useCallback(async () => {
    if (dragging) {
      const block = blocks.find(b => b.id === dragging.blockId)
      if (block) {
        debouncedSavePosition(block.id, block.posX, block.posY)
      }
    }
    if (draggingConnection && hoveredInputPort) {
      const { sourceId, sourcePort } = draggingConnection
      const targetId = hoveredInputPort
      if (sourceId !== targetId) {
        try {
          const updatePayload: Record<string, string | null> = {}
          if (sourcePort === 'next') updatePayload.nextBlockId = targetId
          else if (sourcePort === 'true') updatePayload.nextBlockTrue = targetId
          else if (sourcePort === 'false') updatePayload.nextBlockFalse = targetId
          await adminApi.updateBotBlock(sourceId, updatePayload)
          toast.success('Связь создана')
          fetchData()
        } catch (e: any) {
          toast.error('Ошибка создания связи: ' + (e.message || ''))
        }
      }
    }
    setPanning(null)
    setDragging(null)
    setDraggingConnection(null)
    setHoveredInputPort(null)
  }, [dragging, blocks, draggingConnection, hoveredInputPort, debouncedSavePosition, fetchData])

  const handleNodeMouseDown = (e: React.MouseEvent, block: BotBlock) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('[data-port]')) return
    setDragging({ blockId: block.id, startX: e.clientX, startY: e.clientY, origPosX: block.posX, origPosY: block.posY })
  }

  /* ── Output port drag start ─────────────────────────────── */
  const handleOutputPortMouseDown = (e: React.MouseEvent, blockId: string, port: 'next' | 'true' | 'false') => {
    e.stopPropagation()
    e.preventDefault()
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      setDraggingConnection({
        sourceId: blockId,
        sourcePort: port,
        mouseX: e.clientX - rect.left,
        mouseY: e.clientY - rect.top,
      })
    }
  }

  /* ── Input port hover handlers ──────────────────────────── */
  const handleInputPortMouseEnter = (blockId: string) => {
    if (draggingConnection) {
      setHoveredInputPort(blockId)
    }
  }

  const handleInputPortMouseLeave = () => {
    setHoveredInputPort(null)
  }

  /* ── Delete a connection ────────────────────────────────── */
  const deleteConnection = async (sourceId: string, type: 'next' | 'true' | 'false' | 'button') => {
    try {
      const updatePayload: Record<string, null> = {}
      if (type === 'next') updatePayload.nextBlockId = null
      else if (type === 'true') updatePayload.nextBlockTrue = null
      else if (type === 'false') updatePayload.nextBlockFalse = null
      if (Object.keys(updatePayload).length > 0) {
        await adminApi.updateBotBlock(sourceId, updatePayload)
        toast.success('Связь удалена')
        fetchData()
      }
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Auto-layout ─────────────────────────────────────────── */
  const autoLayout = async () => {
    const sorted = [...blocks].sort((a, b) => {
      const aHasParent = blocks.some(p => p.nextBlockId === a.id || p.nextBlockTrue === a.id || p.nextBlockFalse === a.id)
      const bHasParent = blocks.some(p => p.nextBlockId === b.id || p.nextBlockTrue === b.id || p.nextBlockFalse === b.id)
      if (!aHasParent && bHasParent) return -1
      if (aHasParent && !bHasParent) return 1
      return 0
    })

    const positions = new Map<string, { x: number; y: number }>()
    const visited = new Set<string>()
    let col = 0

    const layout = (id: string, depth: number, colOffset: number) => {
      if (visited.has(id)) return
      visited.add(id)
      positions.set(id, { x: colOffset * 250, y: depth * 120 })
      const block = blockMap.get(id)
      if (!block) return
      let childCol = colOffset
      if (block.nextBlockId && !visited.has(block.nextBlockId)) {
        layout(block.nextBlockId, depth + 1, childCol)
        childCol++
      }
      if (block.nextBlockTrue && !visited.has(block.nextBlockTrue)) {
        layout(block.nextBlockTrue, depth + 1, childCol)
        childCol++
      }
      if (block.nextBlockFalse && !visited.has(block.nextBlockFalse)) {
        layout(block.nextBlockFalse, depth + 1, childCol)
        childCol++
      }
      block.buttons?.forEach(btn => {
        if (btn.nextBlockId && !visited.has(btn.nextBlockId)) {
          layout(btn.nextBlockId, depth + 1, childCol)
          childCol++
        }
      })
    }

    sorted.forEach(b => {
      if (!visited.has(b.id)) {
        layout(b.id, 0, col)
        col += 2
      }
    })

    const updates: Promise<any>[] = []
    const updated = blocks.map(b => {
      const pos = positions.get(b.id)
      if (pos) {
        updates.push(adminApi.updateBotBlock(b.id, { posX: pos.x, posY: pos.y }).catch(() => {}))
        return { ...b, posX: pos.x, posY: pos.y }
      }
      return b
    })
    setBlocks(updated)
    await Promise.all(updates)
    toast.success('Расположение обновлено')
  }

  /* ── Text toolbar ────────────────────────────────────────── */
  const insertAtCursor = (before: string, after: string = '') => {
    const ta = document.getElementById('block-text-area') as HTMLTextAreaElement | null
    if (!ta) { updateField('text', (editForm.text || '') + before + after); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const txt = editForm.text || ''
    const selected = txt.slice(start, end)
    const newText = txt.slice(0, start) + before + selected + after + txt.slice(end)
    updateField('text', newText)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  /* ── Connection lines calculation (memoized) ────────────── */
  const getConnections = useMemo(() => {
    const conns: { from: string; to: string; type: 'next' | 'true' | 'false' | 'button' }[] = []
    blocks.forEach(b => {
      if (b.nextBlockId && blockMap.has(b.nextBlockId))
        conns.push({ from: b.id, to: b.nextBlockId, type: 'next' })
      if (b.nextBlockTrue && blockMap.has(b.nextBlockTrue))
        conns.push({ from: b.id, to: b.nextBlockTrue, type: 'true' })
      if (b.nextBlockFalse && blockMap.has(b.nextBlockFalse))
        conns.push({ from: b.id, to: b.nextBlockFalse, type: 'false' })
      b.buttons?.forEach(btn => {
        if (btn.nextBlockId && blockMap.has(btn.nextBlockId))
          conns.push({ from: b.id, to: btn.nextBlockId, type: 'button' })
      })
    })
    return conns
  }, [blocks, blockMap])

  /* ── Connection line label helper ───────────────────────── */
  const connectionLabel = (type: 'next' | 'true' | 'false' | 'button') => {
    switch (type) {
      case 'true': return 'Да'
      case 'false': return 'Нет'
      case 'button': return 'Кнопка'
      default: return ''
    }
  }

  /* ================================================================
     Render helpers
     ================================================================ */

  const TypeBadge = ({ type }: { type: BlockType }) => {
    const color = BLOCK_TYPE_COLORS[type] || '#6b7280'
    const label = BLOCK_TYPE_LABELS[type] || type
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: color + '22', color }}>
        {label}
      </span>
    )
  }

  const HintText = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>
      {children}
    </p>
  )

  const BlockSelector = ({ value, onChange, label }: { value: string | null | undefined; onChange: (v: string) => void; label: string }) => (
    <div>
      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <select
        className="w-full px-3 py-2 rounded-lg text-[13px]"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">-- нет --</option>
        {allBlocks.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  )

  /* ── Port position helpers ──────────────────────────────── */
  const getInputPortPos = (block: BotBlock) => ({
    x: block.posX * zoom + panX + (NODE_W * zoom) / 2,
    y: block.posY * zoom + panY,
  })

  const getOutputPortPos = (block: BotBlock, port: 'next' | 'true' | 'false') => {
    const baseX = block.posX * zoom + panX
    const baseY = block.posY * zoom + panY + NODE_H * zoom
    if (block.type === 'CONDITION') {
      if (port === 'true') return { x: baseX + (NODE_W * zoom) * 0.33, y: baseY }
      if (port === 'false') return { x: baseX + (NODE_W * zoom) * 0.67, y: baseY }
    }
    return { x: baseX + (NODE_W * zoom) / 2, y: baseY }
  }

  /* ================================================================
     Render
     ================================================================ */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-transparent"
               style={{ borderTopColor: '#8b5cf6', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}>
            <Workflow className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Конструктор бота</h1>
            <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              {blocks.length} блоков в {groups.length} группах
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={autoLayout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
            <LayoutGrid className="w-4 h-4" /> Авто-раскладка
          </button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 gap-0 min-h-0 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>

        {/* ══════════════════════════════════════════════════════════
           ЛЕВАЯ ПАНЕЛЬ — Навигатор групп (250px)
           ══════════════════════════════════════════════════════════ */}
        <div className="w-[250px] flex-shrink-0 flex flex-col overflow-hidden"
             style={{ background: 'var(--glass-bg)', borderRight: '1px solid var(--glass-border)' }}>

          {/* Поиск */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Поиск блоков..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Дерево групп */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groups.map(group => {
              const gBlocks = groupedBlocks.get(group.id) || []
              const collapsed = collapsedGroups.has(group.id)
              return (
                <div key={group.id}>
                  {/* Заголовок группы */}
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 group"
                       onClick={() => setCollapsedGroups(prev => {
                         const n = new Set(prev)
                         collapsed ? n.delete(group.id) : n.add(group.id)
                         return n
                       })}>
                    {collapsed
                      ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    }
                    <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                      {group.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                      {gBlocks.length}
                    </span>
                    <button onClick={e => { e.stopPropagation(); setNewBlockGroupId(group.id) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
                            title="Создать блок">
                      <Plus className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteGroup(group.id) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20"
                            title="Удалить группу">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>

                  {/* Список блоков */}
                  {!collapsed && gBlocks.map(block => (
                    <div key={block.id}
                         className="flex items-center gap-2 px-4 py-1.5 rounded-lg cursor-pointer transition-colors ml-2"
                         style={{
                           background: selectedBlockId === block.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                           color: selectedBlockId === block.id ? '#a78bfa' : 'var(--text-secondary)',
                         }}
                         onClick={() => selectBlock(block)}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                           style={{ background: BLOCK_TYPE_COLORS[block.type] || '#6b7280' }} />
                      <span className="text-[12px] truncate flex-1">{block.name}</span>
                      {block.isDraft && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Черновик</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Кнопка новой группы */}
            {showNewGroup ? (
              <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                <input
                  type="text"
                  placeholder="Имя группы"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createGroup()}
                  className="w-full px-2 py-1.5 rounded text-[12px] mb-2"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                  autoFocus
                />
                <div className="flex gap-1">
                  <button onClick={createGroup}
                          className="flex-1 px-2 py-1 rounded text-[11px] font-medium text-white"
                          style={{ background: '#8b5cf6' }}>
                    Создать группу
                  </button>
                  <button onClick={() => { setShowNewGroup(false); setNewGroupName('') }}
                          className="px-2 py-1 rounded text-[11px]"
                          style={{ color: 'var(--text-tertiary)' }}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNewGroup(true)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-tertiary)' }}>
                <Plus className="w-3.5 h-3.5" /> Создать группу
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
           ЦЕНТРАЛЬНАЯ ПАНЕЛЬ — Визуальный холст
           ══════════════════════════════════════════════════════════ */}
        <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--surface-1)' }}>
          {/* Управление зумом */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(z + 0.15, 3))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <ZoomIn className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>
            <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.2))}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <ZoomOut className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>
            <button onClick={() => { setZoom(1); setPanX(50); setPanY(50) }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <Maximize2 className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>
          </div>

          {/* Метка зума */}
          <div className="absolute bottom-3 left-3 z-20 text-[10px] px-2 py-1 rounded"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
            {Math.round(zoom * 100)}%
          </div>

          {/* Подсказка при перетаскивании связи */}
          {draggingConnection && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 text-[11px] px-3 py-1.5 rounded-lg"
                 style={{ background: 'rgba(139,92,246,0.9)', color: '#fff' }}>
              Отпустите на входном порте блока для создания связи
            </div>
          )}

          {/* Область холста */}
          <div
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            style={{ position: 'relative' }}
          >
            {/* Сетка */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.08 }}>
              <defs>
                <pattern id="grid" width={30 * zoom} height={30 * zoom} patternUnits="userSpaceOnUse"
                         x={panX % (30 * zoom)} y={panY % (30 * zoom)}>
                  <path d={`M ${30 * zoom} 0 L 0 0 0 ${30 * zoom}`} fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* SVG Линии связей */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1, pointerEvents: 'none' }}>
              {getConnections.map((conn, i) => {
                const fromBlock = blockMap.get(conn.from)
                const toBlock = blockMap.get(conn.to)
                if (!fromBlock || !toBlock) return null

                const sourcePort = conn.type === 'button' ? 'next' : conn.type
                const from = getOutputPortPos(fromBlock, sourcePort as 'next' | 'true' | 'false')
                const to = getInputPortPos(toBlock)

                const x1 = from.x
                const y1 = from.y
                const x2 = to.x
                const y2 = to.y
                const midY = (y1 + y2) / 2

                let strokeColor = '#6b7280'
                let dashArray = ''
                if (conn.type === 'true') { strokeColor = '#22c55e'; dashArray = '6,3' }
                else if (conn.type === 'false') { strokeColor = '#ef4444'; dashArray = '6,3' }
                else if (conn.type === 'button') { strokeColor = '#8b5cf6'; dashArray = '4,2' }

                const midX = (x1 + x2) / 2
                const labelY = midY - 8

                return (
                  <g key={`${conn.from}-${conn.to}-${conn.type}-${i}`}>
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                      strokeDasharray={dashArray}
                      opacity={0.6}
                    />
                    {/* Невидимая толстая линия для клика */}
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (conn.type !== 'button') {
                          deleteConnection(conn.from, conn.type)
                        }
                      }}
                    />
                    {/* Стрелка */}
                    <polygon
                      points={`${x2 - 4},${y2 - 8} ${x2 + 4},${y2 - 8} ${x2},${y2}`}
                      fill={strokeColor}
                      opacity={0.6}
                    />
                    {/* Кнопка удаления на линии */}
                    {conn.type !== 'button' && (
                      <g style={{ pointerEvents: 'all', cursor: 'pointer' }}
                         onClick={(e) => { e.stopPropagation(); deleteConnection(conn.from, conn.type) }}>
                        <circle cx={midX} cy={labelY} r={8} fill="rgba(0,0,0,0.6)" stroke={strokeColor} strokeWidth={1} />
                        <line x1={midX - 3} y1={labelY - 3} x2={midX + 3} y2={labelY + 3} stroke="#fff" strokeWidth={1.5} />
                        <line x1={midX + 3} y1={labelY - 3} x2={midX - 3} y2={labelY + 3} stroke="#fff" strokeWidth={1.5} />
                      </g>
                    )}
                    {/* Метка типа связи */}
                    {(conn.type === 'true' || conn.type === 'false') && (
                      <text x={midX + 14} y={labelY + 4} fill={strokeColor} fontSize="10" fontWeight="bold">
                        {connectionLabel(conn.type)}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Временная линия при перетаскивании связи */}
              {draggingConnection && (() => {
                const sourceBlock = blockMap.get(draggingConnection.sourceId)
                if (!sourceBlock) return null
                const from = getOutputPortPos(sourceBlock, draggingConnection.sourcePort)
                const x1 = from.x
                const y1 = from.y
                const x2 = draggingConnection.mouseX
                const y2 = draggingConnection.mouseY
                const midY = (y1 + y2) / 2

                let strokeColor = '#8b5cf6'
                if (draggingConnection.sourcePort === 'true') strokeColor = '#22c55e'
                else if (draggingConnection.sourcePort === 'false') strokeColor = '#ef4444'

                return (
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray="8,4"
                    opacity={0.8}
                  />
                )
              })()}
            </svg>

            {/* Узлы блоков */}
            {blocks.map(block => {
              const Icon = BLOCK_TYPE_ICONS[block.type] || MessageSquare
              const color = BLOCK_TYPE_COLORS[block.type] || '#6b7280'
              const label = BLOCK_TYPE_LABELS[block.type] || block.type
              const isSelected = block.id === selectedBlockId
              const isCondition = block.type === 'CONDITION'
              const isHoveredInput = hoveredInputPort === block.id && draggingConnection

              return (
                <div
                  key={block.id}
                  data-block-node
                  className="absolute rounded-xl shadow-lg transition-shadow duration-150 cursor-pointer select-none"
                  style={{
                    transform: `translate(${block.posX * zoom + panX}px, ${block.posY * zoom + panY}px)`,
                    width: NODE_W * zoom,
                    height: NODE_H * zoom,
                    background: 'var(--glass-bg)',
                    border: isSelected
                      ? `2px solid ${color}`
                      : block.isDraft
                        ? '1.5px dashed var(--glass-border)'
                        : '1px solid var(--glass-border)',
                    boxShadow: isSelected
                      ? `0 0 20px ${color}33`
                      : isHoveredInput
                        ? `0 0 16px ${color}55`
                        : undefined,
                    zIndex: isSelected ? 10 : 2,
                  }}
                  onMouseDown={e => handleNodeMouseDown(e, block)}
                  onClick={e => { e.stopPropagation(); selectBlock(block) }}
                >
                  {/* Цветная полоска сверху */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: color }} />

                  <div className="flex items-center gap-1.5 h-full px-2 pt-1" style={{ transform: `scale(${Math.min(zoom, 1.2)})`, transformOrigin: 'left center' }}>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                         style={{ background: color + '22' }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {block.name}
                      </div>
                      <div className="text-[8px]" style={{ color }}>{label}</div>
                    </div>
                    {block.isDraft && (
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" title="Черновик" />
                    )}
                  </div>

                  {/* Входной порт (сверху по центру) */}
                  <div
                    data-port="input"
                    className="absolute left-1/2 -translate-x-1/2 -top-[5px] w-[10px] h-[10px] rounded-full transition-transform"
                    style={{
                      background: isHoveredInput ? '#22c55e' : color,
                      border: '2px solid var(--surface-1)',
                      cursor: draggingConnection ? 'crosshair' : 'default',
                      transform: `translateX(-50%) ${isHoveredInput ? 'scale(1.6)' : 'scale(1)'}`,
                      zIndex: 20,
                    }}
                    onMouseEnter={() => handleInputPortMouseEnter(block.id)}
                    onMouseLeave={handleInputPortMouseLeave}
                  />

                  {/* Выходные порты (снизу) */}
                  {isCondition ? (
                    <>
                      {/* Порт TRUE (зелёный) */}
                      <div
                        data-port="output-true"
                        className="absolute -bottom-[5px] w-[10px] h-[10px] rounded-full hover:scale-150 transition-transform"
                        style={{
                          left: '33%',
                          transform: 'translateX(-50%)',
                          background: '#22c55e',
                          border: '2px solid var(--surface-1)',
                          cursor: 'crosshair',
                          zIndex: 20,
                        }}
                        title="Да (true)"
                        onMouseDown={e => handleOutputPortMouseDown(e, block.id, 'true')}
                      />
                      {/* Порт FALSE (красный) */}
                      <div
                        data-port="output-false"
                        className="absolute -bottom-[5px] w-[10px] h-[10px] rounded-full hover:scale-150 transition-transform"
                        style={{
                          left: '67%',
                          transform: 'translateX(-50%)',
                          background: '#ef4444',
                          border: '2px solid var(--surface-1)',
                          cursor: 'crosshair',
                          zIndex: 20,
                        }}
                        title="Нет (false)"
                        onMouseDown={e => handleOutputPortMouseDown(e, block.id, 'false')}
                      />
                    </>
                  ) : (
                    /* Обычный выходной порт (синий) */
                    <div
                      data-port="output-next"
                      className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-[10px] h-[10px] rounded-full hover:scale-150 transition-transform"
                      style={{
                        background: '#3b82f6',
                        border: '2px solid var(--surface-1)',
                        cursor: 'crosshair',
                        zIndex: 20,
                      }}
                      title="Следующий блок"
                      onMouseDown={e => handleOutputPortMouseDown(e, block.id, 'next')}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
           ПРАВАЯ ПАНЕЛЬ — Редактор блока (400px, сворачиваемая)
           ══════════════════════════════════════════════════════════ */}
        {rightPanelOpen && selectedBlock && (
          <div className="w-[400px] flex-shrink-0 flex flex-col overflow-hidden"
               style={{ background: 'var(--glass-bg)', borderLeft: '1px solid var(--glass-border)' }}>

            {/* Заголовок редактора */}
            <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TypeBadge type={editForm.type as BlockType || selectedBlock.type} />
                  {editForm.isDraft !== false ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Черновик</span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Опубликован</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={saveBlock} disabled={!editDirty}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-40"
                          style={{ background: editDirty ? '#8b5cf6' : 'var(--surface-2)', color: editDirty ? '#fff' : 'var(--text-tertiary)' }}>
                    <Save className="w-3 h-3" /> Сохранить
                  </button>
                  <button onClick={publishBlock}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1"
                          style={{ background: '#22c55e22', color: '#22c55e' }}>
                    <Check className="w-3 h-3" /> Опубликовать
                  </button>
                  <button onClick={() => setRightPanelOpen(false)}
                          className="p-1.5 rounded-lg hover:bg-white/5"
                          style={{ color: 'var(--text-tertiary)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Название */}
              <input
                type="text"
                value={editForm.name || ''}
                onChange={e => updateField('name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px] font-medium mb-2"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                placeholder="Название блока"
              />

              {/* Выбор типа */}
              <select
                value={editForm.type || 'MESSAGE'}
                onChange={e => updateField('type', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[12px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
              >
                {BLOCK_TYPES.map(t => (
                  <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
                ))}
              </select>

              {/* Удаление */}
              <div className="mt-2 flex justify-end">
                {deleteConfirmId === selectedBlock.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-red-400">Удалить блок?</span>
                    <button onClick={() => deleteBlock(selectedBlock.id)}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-red-500/20 text-red-400">Да</button>
                    <button onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 rounded text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Нет</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(selectedBlock.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3 h-3" /> Удалить
                  </button>
                )}
              </div>
            </div>

            {/* Прокручиваемое тело редактора */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ── Поля типа СООБЩЕНИЕ ──────────────────────── */}
              {(editForm.type === 'MESSAGE' || editForm.type === 'MEDIA_GROUP' || editForm.type === 'STREAMING') && (
                <>
                  {/* Панель инструментов */}
                  <div className="flex flex-wrap gap-1 mb-1">
                    <button onClick={() => insertAtCursor('**', '**')} className="p-1.5 rounded hover:bg-white/10" title="Жирный" style={{ color: 'var(--text-tertiary)' }}>
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => insertAtCursor('__', '__')} className="p-1.5 rounded hover:bg-white/10" title="Курсив" style={{ color: 'var(--text-tertiary)' }}>
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => insertAtCursor('||', '||')} className="p-1.5 rounded hover:bg-white/10" title="Спойлер" style={{ color: 'var(--text-tertiary)' }}>
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => insertAtCursor('`', '`')} className="p-1.5 rounded hover:bg-white/10" title="Код" style={{ color: 'var(--text-tertiary)' }}>
                      <Code className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => insertAtCursor('[текст](', ')')} className="p-1.5 rounded hover:bg-white/10" title="Ссылка" style={{ color: 'var(--text-tertiary)' }}>
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => insertAtCursor('> ', '')} className="p-1.5 rounded hover:bg-white/10" title="Цитата" style={{ color: 'var(--text-tertiary)' }}>
                      <Quote className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px mx-1" style={{ background: 'var(--glass-border)' }} />
                    {/* Эмодзи */}
                    <div className="relative">
                      <button onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                              className="p-1.5 rounded hover:bg-white/10" title="Эмодзи" style={{ color: 'var(--text-tertiary)' }}>
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                      {emojiPickerOpen && (
                        <div className="absolute top-8 left-0 z-50 w-[280px] rounded-xl shadow-2xl p-2"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                          <div className="flex gap-1 mb-2 flex-wrap">
                            {Object.keys(EMOJI_CATEGORIES).map(cat => (
                              <button key={cat} onClick={() => setEmojiCategory(cat)}
                                      className="px-2 py-1 rounded text-[10px]"
                                      style={{ background: emojiCategory === cat ? '#8b5cf622' : 'transparent', color: emojiCategory === cat ? '#a78bfa' : 'var(--text-tertiary)' }}>
                                {cat}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-8 gap-0.5 max-h-[180px] overflow-y-auto">
                            {EMOJI_CATEGORIES[emojiCategory]?.map((emoji, i) => (
                              <button key={i} onClick={() => { insertAtCursor(emoji, ''); setEmojiPickerOpen(false) }}
                                      className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-[16px]">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Вставка переменной */}
                    <div className="relative">
                      <button onClick={() => setVariableDropdownOpen(!variableDropdownOpen)}
                              className="p-1.5 rounded hover:bg-white/10" style={{ color: 'var(--text-tertiary)' }} title="Переменная">
                        <Variable className="w-3.5 h-3.5" />
                      </button>
                      {variableDropdownOpen && (
                        <div className="absolute top-8 left-0 z-50 w-[180px] rounded-lg shadow-2xl py-1"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                          {VARIABLES.map(v => (
                            <button key={v} onClick={() => { insertAtCursor(v, ''); setVariableDropdownOpen(false) }}
                                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-white/5 font-mono"
                                    style={{ color: 'var(--text-secondary)' }}>
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Текстовое поле */}
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текст сообщения</label>
                    <textarea
                      id="block-text-area"
                      value={editForm.text || ''}
                      onChange={e => updateField('text', e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 rounded-lg text-[12px] font-mono resize-y"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                      placeholder="Текст сообщения с Markdown/HTML разметкой..."
                    />
                    <HintText>Поддерживается Markdown. Переменные: {'{name}'}, {'{email}'}, {'{balance}'}, {'{bonusDays}'}, {'{subStatus}'}, {'{daysLeft}'}</HintText>
                  </div>

                  {/* Режим парсинга */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Режим разметки:</label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                      {['Markdown', 'HTML'].map(m => (
                        <button key={m}
                                onClick={() => updateField('parseMode', m)}
                                className="px-3 py-1 text-[11px]"
                                style={{
                                  background: editForm.parseMode === m ? '#8b5cf622' : 'transparent',
                                  color: editForm.parseMode === m ? '#a78bfa' : 'var(--text-tertiary)',
                                }}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Медиа */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>URL медиа</label>
                      <input type="text" value={editForm.mediaUrl || ''} onChange={e => updateField('mediaUrl', e.target.value)}
                             className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder="https://..." />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тип медиа</label>
                      <select value={editForm.mediaType || ''} onChange={e => updateField('mediaType', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        <option value="">нет</option>
                        <option value="photo">Фото</option>
                        <option value="video">Видео</option>
                        <option value="animation">Анимация</option>
                        <option value="document">Документ</option>
                      </select>
                    </div>
                  </div>

                  {/* Переключатели */}
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!editForm.pinMessage}
                             onChange={e => updateField('pinMessage', e.target.checked)}
                             className="w-3.5 h-3.5 rounded" />
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Закрепить сообщение</span>
                    </label>
                  </div>

                  {/* Удалить предыдущее */}
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Удалить предыдущее</label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                      {[
                        { key: 'none', label: 'Нет' },
                        { key: 'buttons', label: 'Кнопки' },
                        { key: 'full', label: 'Полностью' },
                      ].map(m => (
                        <button key={m.key}
                                onClick={() => updateField('deletePrevious', m.key === 'none' ? null : m.key)}
                                className="px-3 py-1 text-[11px] flex-1"
                                style={{
                                  background: (editForm.deletePrevious || 'none') === (m.key === 'none' ? null : m.key) || (!editForm.deletePrevious && m.key === 'none')
                                    ? '#8b5cf622' : 'transparent',
                                  color: (editForm.deletePrevious || 'none') === (m.key === 'none' ? null : m.key) || (!editForm.deletePrevious && m.key === 'none')
                                    ? '#a78bfa' : 'var(--text-tertiary)',
                                }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ID эффекта сообщения */}
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>ID эффекта сообщения (необязательно)</label>
                    <input type="text" value={editForm.messageEffectId || ''} onChange={e => updateField('messageEffectId', e.target.value)}
                           className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="5104841245755180586" />
                  </div>

                  {/* Следующий блок */}
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />

                  {/* ── Секция кнопок ────────────────────────────── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Кнопки</label>
                      <button onClick={() => setShowButtonForm(true)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                              style={{ background: '#8b5cf622', color: '#a78bfa' }}>
                        <Plus className="w-3 h-3" /> Добавить
                      </button>
                    </div>
                    <HintText>Кнопки отображаются под сообщением. Можно задать цвет и иконку</HintText>

                    {/* Существующие кнопки */}
                    {selectedBlock.buttons && selectedBlock.buttons.length > 0 && (
                      <div className="space-y-1 mb-2 mt-2">
                        {selectedBlock.buttons.map(btn => {
                          const styleColors: Record<string, string> = {
                            default: '#6b7280', success: '#22c55e', danger: '#ef4444', primary: '#3b82f6',
                          }
                          return (
                            <div key={btn.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                              <div className="w-1.5 h-4 rounded-full" style={{ background: styleColors[btn.style] || '#6b7280' }} />
                              <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{btn.label}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
                                {BUTTON_TYPE_LABELS[btn.type] || btn.type} р{btn.row}к{btn.col}
                              </span>
                              <button onClick={() => removeButton(btn.id)} className="p-0.5 rounded hover:bg-red-500/20">
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Форма создания кнопки */}
                    {showButtonForm && (
                      <div className="p-3 rounded-lg space-y-2 mt-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                        <input type="text" value={buttonForm.label} onChange={e => setButtonForm(p => ({ ...p, label: e.target.value }))}
                               placeholder="Текст кнопки" className="w-full px-2 py-1.5 rounded text-[12px]"
                               style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Тип кнопки</label>
                            <select value={buttonForm.type} onChange={e => setButtonForm(p => ({ ...p, type: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded text-[11px]"
                                    style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                              <option value="block">Переход к блоку</option>
                              <option value="url">Ссылка</option>
                              <option value="webapp">Web-приложение</option>
                              <option value="copy_text">Копировать текст</option>
                              <option value="pay">Оплата</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Стиль</label>
                            <select value={buttonForm.style} onChange={e => setButtonForm(p => ({ ...p, style: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded text-[11px]"
                                    style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                              <option value="default">Обычный</option>
                              <option value="success">Успех</option>
                              <option value="danger">Опасность</option>
                              <option value="primary">Основной</option>
                            </select>
                          </div>
                        </div>
                        {buttonForm.type === 'block' && (
                          <div>
                            <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Целевой блок</label>
                            <select value={buttonForm.nextBlockId} onChange={e => setButtonForm(p => ({ ...p, nextBlockId: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded text-[11px]"
                                    style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                              <option value="">-- выберите блок --</option>
                              {allBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          </div>
                        )}
                        {(buttonForm.type === 'url' || buttonForm.type === 'webapp') && (
                          <input type="text" value={buttonForm.url} onChange={e => setButtonForm(p => ({ ...p, url: e.target.value }))}
                                 placeholder="https://..." className="w-full px-2 py-1.5 rounded text-[12px]"
                                 style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        )}
                        {buttonForm.type === 'copy_text' && (
                          <input type="text" value={buttonForm.copyText} onChange={e => setButtonForm(p => ({ ...p, copyText: e.target.value }))}
                                 placeholder="Текст для копирования" className="w-full px-2 py-1.5 rounded text-[12px]"
                                 style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Ряд</label>
                            <input type="number" value={buttonForm.row} onChange={e => setButtonForm(p => ({ ...p, row: +e.target.value }))}
                                   className="w-full px-2 py-1 rounded text-[11px]"
                                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Колонка</label>
                            <input type="number" value={buttonForm.col} onChange={e => setButtonForm(p => ({ ...p, col: +e.target.value }))}
                                   className="w-full px-2 py-1 rounded text-[11px]"
                                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Иконка</label>
                            <input type="text" value={buttonForm.iconEmojiId} onChange={e => setButtonForm(p => ({ ...p, iconEmojiId: e.target.value }))}
                                   className="w-full px-2 py-1 rounded text-[11px]"
                                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={addButton}
                                  className="flex-1 px-2 py-1.5 rounded text-[11px] font-medium text-white"
                                  style={{ background: '#8b5cf6' }}>
                            Создать кнопку
                          </button>
                          <button onClick={() => setShowButtonForm(false)}
                                  className="px-3 py-1.5 rounded text-[11px]"
                                  style={{ color: 'var(--text-tertiary)' }}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Поля типа УСЛОВИЕ ───────────────────────── */}
              {editForm.type === 'CONDITION' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Условия</label>
                      <button onClick={() => setConditionRows(prev => [...prev, { type: 'has_sub', value: '' }])}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                              style={{ background: '#f59e0b22', color: '#f59e0b' }}>
                        <Plus className="w-3 h-3" /> Добавить
                      </button>
                    </div>
                    <HintText>Проверяет условие и направляет в одну из двух веток</HintText>
                    {conditionRows.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2 mb-2 mt-2">
                        <select value={cond.type}
                                onChange={e => {
                                  const n = [...conditionRows]; n[idx] = { ...n[idx], type: e.target.value }
                                  setConditionRows(n); setEditDirty(true)
                                }}
                                className="flex-1 px-2 py-1.5 rounded text-[11px]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                          {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <input type="text" value={cond.value} placeholder="значение"
                               onChange={e => {
                                 const n = [...conditionRows]; n[idx] = { ...n[idx], value: e.target.value }
                                 setConditionRows(n); setEditDirty(true)
                               }}
                               className="w-24 px-2 py-1.5 rounded text-[11px]"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        <button onClick={() => { setConditionRows(prev => prev.filter((_, i) => i !== idx)); setEditDirty(true) }}
                                className="p-1 rounded hover:bg-red-500/20">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Переключатель логики */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Логика:</label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                      {['AND', 'OR'].map(m => (
                        <button key={m}
                                onClick={() => updateField('conditionLogic', m)}
                                className="px-3 py-1 text-[11px]"
                                style={{
                                  background: editForm.conditionLogic === m ? '#f59e0b22' : 'transparent',
                                  color: editForm.conditionLogic === m ? '#f59e0b' : 'var(--text-tertiary)',
                                }}>
                          {m === 'AND' ? 'И (AND)' : 'ИЛИ (OR)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <BlockSelector value={editForm.nextBlockTrue} onChange={v => updateField('nextBlockTrue', v || null)} label="Следующий блок (Да / TRUE)" />
                  <BlockSelector value={editForm.nextBlockFalse} onChange={v => updateField('nextBlockFalse', v || null)} label="Следующий блок (Нет / FALSE)" />
                </>
              )}

              {/* ── Поля типа ДЕЙСТВИЕ ──────────────────────── */}
              {editForm.type === 'ACTION' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тип действия</label>
                    <select value={editForm.actionType || ''} onChange={e => updateField('actionType', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-[12px]"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                      <option value="">-- выберите --</option>
                      {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Значение</label>
                    <input type="text" value={editForm.actionValue || ''} onChange={e => updateField('actionValue', e.target.value)}
                           className="w-full px-3 py-2 rounded-lg text-[12px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="Значение действия" />
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ── Поля типа ВВОД ДАННЫХ ───────────────────── */}
              {editForm.type === 'INPUT' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текст запроса</label>
                    <textarea value={editForm.promptText || ''} onChange={e => updateField('promptText', e.target.value)}
                              rows={3} className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                              placeholder="Введите ваш email..." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Имя переменной</label>
                      <input type="text" value={editForm.varName || ''} onChange={e => updateField('varName', e.target.value)}
                             className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder="email" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Валидация</label>
                      <select value={editForm.validation || ''} onChange={e => updateField('validation', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        <option value="">нет</option>
                        {VALIDATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ── Поля типа ЗАДЕРЖКА ──────────────────────── */}
              {editForm.type === 'DELAY' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Длительность</label>
                      <input type="number" value={editForm.delayMinutes || ''} onChange={e => updateField('delayMinutes', +e.target.value)}
                             className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder="5" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Единица</label>
                      <select value={editForm.delayUnit || 'minutes'} onChange={e => updateField('delayUnit', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        <option value="minutes">Минуты</option>
                        <option value="hours">Часы</option>
                        <option value="days">Дни</option>
                      </select>
                    </div>
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ── Поля типа ОПЛАТА ────────────────────────── */}
              {editForm.type === 'PAYMENT' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Заголовок платежа</label>
                    <input type="text" value={editForm.paymentTitle || ''} onChange={e => updateField('paymentTitle', e.target.value)}
                           className="w-full px-3 py-2 rounded-lg text-[12px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="Оплата подписки" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Описание</label>
                    <textarea value={editForm.paymentDescription || ''} onChange={e => updateField('paymentDescription', e.target.value)}
                              rows={2} className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                              placeholder="Описание платежа..." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Сумма (Stars)</label>
                      <input type="number" value={editForm.paymentAmount || ''} onChange={e => updateField('paymentAmount', +e.target.value)}
                             className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder="100" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Payload</label>
                      <input type="text" value={editForm.paymentPayload || ''} onChange={e => updateField('paymentPayload', e.target.value)}
                             className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder="sub_monthly" />
                    </div>
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок (после оплаты)" />
                </>
              )}

              {/* ── ПЕРЕХОД / A/B ТЕСТ / ВОРОНКА / другие ───── */}
              {(editForm.type === 'REDIRECT' || editForm.type === 'SPLIT' || editForm.type === 'FUNNEL'
                || editForm.type === 'EFFECT' || editForm.type === 'REACTION' || editForm.type === 'GIFT'
                || editForm.type === 'ASSIGN') && (
                <>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                  {editForm.type === 'REDIRECT' && (
                    <BlockSelector value={editForm.nextBlockTrue} onChange={v => updateField('nextBlockTrue', v || null)} label="Целевой блок перехода" />
                  )}
                </>
              )}

              {/* ── Поля типа HTTP ЗАПРОС ───────────────────── */}
              {editForm.type === 'HTTP' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>URL запроса</label>
                    <input type="text" value={(editForm.metaJson as any)?.url || ''} onChange={e => updateField('metaJson', { ...((editForm.metaJson as any) || {}), url: e.target.value })}
                           className="w-full px-3 py-2 rounded-lg text-[12px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="https://api.example.com/webhook" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Метод</label>
                    <select value={(editForm.metaJson as any)?.method || 'POST'}
                            onChange={e => updateField('metaJson', { ...((editForm.metaJson as any) || {}), method: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тело запроса (JSON)</label>
                    <textarea value={(editForm.metaJson as any)?.body || ''}
                              onChange={e => updateField('metaJson', { ...((editForm.metaJson as any) || {}), body: e.target.value })}
                              rows={4} className="w-full px-3 py-2 rounded-lg text-[12px] font-mono"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                              placeholder='{"key": "value"}' />
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ── Поля типа EMAIL ──────────────────────────── */}
              {editForm.type === 'EMAIL' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тема письма</label>
                    <input type="text" value={(editForm.metaJson as any)?.subject || ''}
                           onChange={e => updateField('metaJson', { ...((editForm.metaJson as any) || {}), subject: e.target.value })}
                           className="w-full px-3 py-2 rounded-lg text-[12px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="Тема" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текст письма</label>
                    <textarea value={editForm.text || ''} onChange={e => updateField('text', e.target.value)}
                              rows={5} className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                              placeholder="Тело письма..." />
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ── Поля типа УВЕДОМИТЬ АДМИНА ──────────────── */}
              {editForm.type === 'NOTIFY_ADMIN' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текст уведомления</label>
                    <textarea value={editForm.text || ''} onChange={e => updateField('text', e.target.value)}
                              rows={4} className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                              placeholder="Текст уведомления для админа..." />
                  </div>
                  <BlockSelector value={editForm.nextBlockId} onChange={v => updateField('nextBlockId', v || null)} label="Следующий блок" />
                </>
              )}

              {/* ══════════════════════════════════════════════════
                 СЕКЦИЯ ТРИГГЕРОВ (для всех типов блоков)
                 ══════════════════════════════════════════════════ */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Триггеры</label>
                  <button onClick={() => setShowTriggerForm(true)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                          style={{ background: '#06b6d422', color: '#06b6d4' }}>
                    <Plus className="w-3 h-3" /> Добавить
                  </button>
                </div>
                <HintText>Триггер определяет когда запускается этот блок</HintText>

                {/* Существующие триггеры */}
                {selectedBlock.triggers && selectedBlock.triggers.length > 0 && (
                  <div className="space-y-1 mb-2 mt-2">
                    {selectedBlock.triggers.map(tr => (
                      <div key={tr.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: '#06b6d422', color: '#06b6d4' }}>{TRIGGER_TYPE_LABELS[tr.type] || tr.type}</span>
                        <span className="text-[11px] flex-1 truncate font-mono" style={{ color: 'var(--text-primary)' }}>{tr.value}</span>
                        <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>п:{tr.priority}</span>
                        <button onClick={() => removeTrigger(tr.id)} className="p-0.5 rounded hover:bg-red-500/20">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Форма создания триггера */}
                {showTriggerForm && (
                  <div className="p-3 rounded-lg space-y-2 mt-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Тип триггера</label>
                        <select value={triggerForm.type} onChange={e => setTriggerForm(p => ({ ...p, type: e.target.value }))}
                                className="w-full px-2 py-1.5 rounded text-[11px]"
                                style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                          <option value="command">Команда</option>
                          <option value="text">Текст</option>
                          <option value="callback">Callback</option>
                          <option value="event">Событие</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Приоритет</label>
                        <input type="number" value={triggerForm.priority}
                               onChange={e => setTriggerForm(p => ({ ...p, priority: +e.target.value }))}
                               placeholder="0"
                               className="w-full px-2 py-1.5 rounded text-[11px]"
                               style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-tertiary)' }}>Значение</label>
                      <input type="text" value={triggerForm.value} onChange={e => setTriggerForm(p => ({ ...p, value: e.target.value }))}
                             placeholder={triggerForm.type === 'command' ? '/start' : 'Значение триггера'}
                             className="w-full px-2 py-1.5 rounded text-[12px] font-mono"
                             style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addTrigger}
                              className="flex-1 px-2 py-1.5 rounded text-[11px] font-medium text-white"
                              style={{ background: '#06b6d4' }}>
                        Создать триггер
                      </button>
                      <button onClick={() => setShowTriggerForm(false)}
                              className="px-3 py-1.5 rounded text-[11px]"
                              style={{ color: 'var(--text-tertiary)' }}>
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Свернутая правая панель */}
        {(!rightPanelOpen || !selectedBlock) && selectedBlock && (
          <button onClick={() => setRightPanelOpen(true)}
                  className="w-10 flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--glass-bg)', borderLeft: '1px solid var(--glass-border)' }}>
            <ChevronDown className="w-4 h-4 -rotate-90" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        )}
      </div>

      {/* ── Модальное окно создания блока ────────────────────── */}
      {newBlockGroupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNewBlockGroupId(null)} />
          <div className="relative w-[420px] rounded-2xl p-6 shadow-2xl"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <h3 className="text-[15px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Создать блок</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Название</label>
                <input type="text" value={newBlockName} onChange={e => setNewBlockName(e.target.value)}
                       className="w-full px-3 py-2 rounded-lg text-[13px]"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                       placeholder="Приветственное сообщение" autoFocus />
              </div>
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тип блока</label>
                <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
                  {BLOCK_TYPES.map(t => {
                    const Icon = BLOCK_TYPE_ICONS[t]
                    const color = BLOCK_TYPE_COLORS[t]
                    return (
                      <button key={t}
                              onClick={() => setNewBlockType(t)}
                              className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-[11px] transition-colors"
                              style={{
                                background: newBlockType === t ? color + '22' : 'var(--surface-2)',
                                border: newBlockType === t ? `1px solid ${color}44` : '1px solid transparent',
                                color: newBlockType === t ? color : 'var(--text-secondary)',
                              }}>
                        <Icon className="w-3.5 h-3.5" />
                        {BLOCK_TYPE_LABELS[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createBlock}
                      className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white"
                      style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
                Создать блок
              </button>
              <button onClick={() => { setNewBlockGroupId(null); setNewBlockName(''); setNewBlockType('MESSAGE') }}
                      className="px-4 py-2.5 rounded-xl text-[13px]"
                      style={{ color: 'var(--text-tertiary)', border: '1px solid var(--glass-border)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

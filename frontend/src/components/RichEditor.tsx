'use client'

/**
 * Lightweight rich-text editor built on contentEditable.
 * No external deps. Supports bold/italic/underline, headings, lists, links,
 * images (by URL or upload), alignment, quotes, code blocks.
 *
 * Stores HTML in the `value` prop (string). Fires onChange with raw HTML.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, Code,
  RotateCcw, Upload, Strikethrough,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichEditor({ value, onChange, placeholder = 'Начните писать...', minHeight = 240 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // Sync external value changes → DOM (without losing cursor on each keystroke)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    editorRef.current?.focus()
  }

  const applyHeading = (tag: string) => {
    // Tags: h1, h2, h3, p
    exec('formatBlock', tag)
  }

  const insertLink = () => {
    const url = prompt('Введите URL:')
    if (!url) return
    exec('createLink', url)
  }

  const insertImageUrl = () => {
    const url = prompt('Введите URL изображения:')
    if (!url) return
    exec('insertImage', url)
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await adminApi.uploadFile(fd)
      if (res.ok && res.url) {
        exec('insertImage', res.url)
        toast.success('Картинка загружена')
      } else throw new Error('Upload failed')
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  const onInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  // Paste as plain text (strip formatting from external pastes)
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const Btn = ({ icon: Icon, title, onClick, active }: {
    icon: any; title: string; onClick: () => void; active?: boolean
  }) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={title}
            className="p-1.5 rounded-md transition-all"
            style={{
              background: active ? 'rgba(6,182,212,0.15)' : 'transparent',
              color: active ? 'var(--accent-1)' : 'var(--text-primary)',
            }}>
      <Icon className="w-4 h-4" />
    </button>
  )

  const Separator = () => <div className="w-px h-5" style={{ background: 'var(--glass-border)' }} />

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b sticky top-0 z-10"
           style={{ borderColor: 'var(--glass-border)', background: 'var(--surface-2)' }}>
        <Btn icon={Bold}          title="Жирный (Ctrl+B)"     onClick={() => exec('bold')} />
        <Btn icon={Italic}        title="Курсив (Ctrl+I)"     onClick={() => exec('italic')} />
        <Btn icon={Underline}     title="Подчёркнутый"         onClick={() => exec('underline')} />
        <Btn icon={Strikethrough} title="Зачёркнутый"          onClick={() => exec('strikeThrough')} />
        <Separator />

        <Btn icon={Heading1} title="Заголовок 1" onClick={() => applyHeading('h1')} />
        <Btn icon={Heading2} title="Заголовок 2" onClick={() => applyHeading('h2')} />
        <Btn icon={Heading3} title="Заголовок 3" onClick={() => applyHeading('h3')} />
        <Separator />

        <Btn icon={List}        title="Маркированный список"  onClick={() => exec('insertUnorderedList')} />
        <Btn icon={ListOrdered} title="Нумерованный список"    onClick={() => exec('insertOrderedList')} />
        <Btn icon={Quote}       title="Цитата"                 onClick={() => applyHeading('blockquote')} />
        <Btn icon={Code}        title="Код"                    onClick={() => applyHeading('pre')} />
        <Separator />

        <Btn icon={AlignLeft}   title="По левому краю"  onClick={() => exec('justifyLeft')} />
        <Btn icon={AlignCenter} title="По центру"       onClick={() => exec('justifyCenter')} />
        <Btn icon={AlignRight}  title="По правому краю" onClick={() => exec('justifyRight')} />
        <Separator />

        <Btn icon={LinkIcon}  title="Вставить ссылку"          onClick={insertLink} />
        <Btn icon={ImageIcon} title="Вставить картинку по URL" onClick={insertImageUrl} />
        <Btn icon={Upload}    title={uploading ? 'Загрузка...' : 'Загрузить файл'}
             onClick={() => fileInputRef.current?.click()} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
               onChange={e => {
                 const f = e.target.files?.[0]
                 if (f) handleFileUpload(f)
                 e.target.value = ''
               }} />
        <Separator />

        <Btn icon={RotateCcw} title="Очистить форматирование" onClick={() => exec('removeFormat')} />
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={onInput}
        onPaste={onPaste}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="rich-editor-content"
        style={{
          minHeight: minHeight + 'px',
          padding: '16px',
          color: 'var(--text-primary)',
          outline: 'none',
          fontSize: '15px',
          lineHeight: '1.65',
        }}
      />

      {/* Global styles for content */}
      <style jsx global>{`
        .rich-editor-content:empty:before {
          content: attr(data-placeholder);
          color: var(--text-tertiary);
          pointer-events: none;
        }
        .rich-editor-content h1 { font-size: 28px; font-weight: 700; margin: 16px 0 8px; line-height: 1.2; color: var(--text-primary); }
        .rich-editor-content h2 { font-size: 22px; font-weight: 700; margin: 14px 0 6px; line-height: 1.3; color: var(--text-primary); }
        .rich-editor-content h3 { font-size: 18px; font-weight: 600; margin: 12px 0 4px; line-height: 1.4; color: var(--text-primary); }
        .rich-editor-content p  { margin: 8px 0; }
        .rich-editor-content ul, .rich-editor-content ol { padding-left: 24px; margin: 8px 0; }
        .rich-editor-content li { margin: 4px 0; }
        .rich-editor-content a  { color: var(--accent-1); text-decoration: underline; }
        .rich-editor-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; display: block; }
        .rich-editor-content blockquote {
          border-left: 3px solid var(--accent-1);
          padding: 4px 16px; margin: 12px 0;
          color: var(--text-secondary); font-style: italic;
          background: rgba(6,182,212,0.05); border-radius: 0 8px 8px 0;
        }
        .rich-editor-content pre {
          background: var(--surface-2); padding: 12px 16px; border-radius: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px;
          overflow-x: auto; margin: 12px 0; color: var(--text-primary);
        }
        .rich-editor-content strong { font-weight: 700; color: var(--text-primary); }
        .rich-editor-content em { font-style: italic; }
      `}</style>
    </div>
  )
}

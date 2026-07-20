'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'info' | 'warning'

interface Toast {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (t: { title: string; description?: string; variant?: ToastVariant }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
}

const ACCENT = {
  success: 'text-success',
  info: 'text-primary',
  warning: 'text-warning',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'success' }) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, title, description, variant }])
      setTimeout(() => remove(id), 3800)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.variant]
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-popover p-4 shadow-lg animate-in slide-in-from-right-4 fade-in"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', ACCENT[t.variant])} />
              <div className="flex-1">
                <p className="text-sm font-medium text-popover-foreground">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
                ) : null}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

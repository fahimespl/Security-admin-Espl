'use client'

import { DoorOpen, ShieldAlert, Users, Radio } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Card } from '@/components/ui-kit'
import { cn } from '@/lib/utils'

export function SummaryCards() {
  const { staff, logs, storeOpen, settings, now } = useStore()

  const enrolled = staff.filter((s) => s.status === 'Active').length
  const alertsToday = logs.filter((l) => {
    const d = new Date(l.timestamp)
    return l.action === 'Alert Sent' && d.toDateString() === now.toDateString()
  }).length

  const cards = [
    {
      label: 'Staff Enrolled',
      value: `${enrolled}`,
      hint: `${staff.length} total profiles`,
      icon: Users,
      tone: 'primary' as const,
    },
    {
      label: 'Alerts Today',
      value: `${alertsToday}`,
      hint: 'Since midnight',
      icon: ShieldAlert,
      tone: alertsToday > 0 ? ('danger' as const) : ('neutral' as const),
    },
    {
      label: 'Store Status',
      value: storeOpen ? 'Open' : 'Closed',
      hint: 'Based on schedule',
      icon: DoorOpen,
      tone: storeOpen ? ('success' as const) : ('danger' as const),
    },
    {
      label: 'System Mode',
      value: settings.systemMode === 'live' ? 'Live' : 'Test',
      hint: settings.systemMode === 'live' ? 'Alerts armed' : 'Logging only',
      icon: Radio,
      tone: settings.systemMode === 'live' ? ('danger' as const) : ('primary' as const),
    },
  ]

  const iconTone = {
    primary: 'bg-primary/15 text-primary',
    danger: 'bg-danger/15 text-danger',
    success: 'bg-success/15 text-success',
    neutral: 'bg-muted text-muted-foreground',
  }

  const valueTone = {
    primary: 'text-foreground',
    danger: 'text-danger',
    success: 'text-success',
    neutral: 'text-foreground',
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <div className={cn('flex size-9 items-center justify-center rounded-lg', iconTone[c.tone])}>
                <Icon className="size-[18px]" />
              </div>
            </div>
            <p className={cn('mt-3 text-2xl font-semibold', valueTone[c.tone])}>{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </Card>
        )
      })}
    </div>
  )
}

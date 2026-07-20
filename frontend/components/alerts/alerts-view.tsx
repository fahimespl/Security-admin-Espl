'use client'

import { useState } from 'react'
import { Lock, MessageCircle, Plus, Send, Siren, Trash2, UserRound } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { useToast } from '@/components/toast'
import { Card, CardHeader, Field, Switch, inputClass } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'

const CHANNELS = [
  {
    key: 'whatsapp' as const,
    label: 'WhatsApp',
    description: 'Sends a snapshot and alert message to every recipient below.',
    icon: MessageCircle,
  },
  {
    key: 'siren' as const,
    label: 'Siren',
    description: 'Sounds the in-store alarm to deter and scare off the intruder.',
    icon: Siren,
  },
  {
    key: 'autoLock' as const,
    label: 'Auto-Lock Doors',
    description: 'Immediately engages the electronic door locks to contain the threat.',
    icon: Lock,
  },
]

export function AlertsView() {
  const { settings, setSettings, addRecipient, removeRecipient } = useStore()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  function handleAdd() {
    if (!name.trim() || !phone.trim()) {
      toast({ title: 'Missing details', description: 'Enter both name and phone.', variant: 'warning' })
      return
    }
    addRecipient({ name: name.trim(), phone: phone.trim() })
    toast({ title: 'Recipient added', description: `${name.trim()} will receive alerts.` })
    setName('')
    setPhone('')
  }

  async function handleTestAlert() {
    const active = CHANNELS.filter((c) => settings.channels[c.key])
    if (active.length === 0) {
      toast({
        title: 'No channels enabled',
        description: 'Turn on at least one channel to send a test alert.',
        variant: 'warning',
      })
      return
    }
    try {
      const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
      const res = await fetch(`${API}/api/alerts/test`, { method: 'POST' })
      if (!res.ok) throw new Error('API error')
      const names = active.map((c) => c.label).join(', ')
      toast({
        title: 'Test alert sent',
        description: `Sent via ${names} to ${settings.recipients.length} recipient${
          settings.recipients.length === 1 ? '' : 's'
        }.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Test alert failed',
        description: 'Could not reach the backend. Is the server running?',
        variant: 'warning',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Alert Settings"
        description="Choose who gets notified and how the system responds to threats."
      >
        <Button onClick={handleTestAlert}>
          <Send className="size-4" />
          Send Test Alert
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recipients */}
        <Card>
          <CardHeader title="Alert Recipients" description="People notified when an alert fires" />
          <div className="p-5">
            <ul className="space-y-2">
              {settings.recipients.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => {
                      removeRecipient(r.id)
                      toast({ title: 'Recipient removed', variant: 'warning' })
                    }}
                    aria-label={`Remove ${r.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
              {settings.recipients.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No recipients yet. Add one below.
                </li>
              ) : null}
            </ul>

            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
              <Field label="Name" htmlFor="rec-name">
                <input
                  id="rec-name"
                  className={inputClass}
                  placeholder="Contact name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="rec-phone">
                <input
                  id="rec-phone"
                  className={inputClass}
                  placeholder="+91 98XXX XXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Button onClick={handleAdd} className="shrink-0">
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* Channels */}
        <Card>
          <CardHeader title="Alert Channels" description="How the system reacts to an unknown face" />
          <div className="space-y-3 p-5">
            {CHANNELS.map((c) => {
              const Icon = c.icon
              const on = settings.channels[c.key]
              return (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg transition-colors',
                        on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={on}
                    onChange={(v) => {
                      setSettings((p) => ({ ...p, channels: { ...p.channels, [c.key]: v } }))
                      toast({
                        title: `${c.label} ${v ? 'enabled' : 'disabled'}`,
                        variant: v ? 'success' : 'warning',
                      })
                    }}
                    label={c.label}
                  />
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

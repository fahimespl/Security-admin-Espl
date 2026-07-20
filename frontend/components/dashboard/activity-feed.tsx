'use client'

import { ScanFace } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Avatar, Badge, Card, CardHeader } from '@/components/ui-kit'
import { relativeTime } from '@/lib/format'

export function ActivityFeed() {
  const { logs, now } = useStore()
  const recent = logs.slice(0, 7)

  return (
    <Card>
      <CardHeader title="Recent Activity" description="Latest face-recognition events" />
      <ul className="divide-y divide-border">
        {recent.map((e) => (
          <li key={e.id} className="flex items-center gap-3 p-4">
            {e.known && e.staffName ? (
              <Avatar name={e.staffName} size={40} />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger">
                <ScanFace className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {e.known ? e.staffName : 'Unknown Person'}
              </p>
              <p className="text-xs text-muted-foreground">
                {relativeTime(e.timestamp, now)} · {e.storeOpen ? 'Store open' : 'Store closed'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge tone={e.known ? 'success' : 'danger'}>
                {e.known ? 'Known' : 'Unknown'}
              </Badge>
              {e.action === 'Alert Sent' ? (
                <span className="text-xs font-medium text-danger">Alert sent</span>
              ) : (
                <span className="text-xs text-muted-foreground">Logged</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

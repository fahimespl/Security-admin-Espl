'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Bell, ScanFace, ImageIcon } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { formatDateTime } from '@/lib/format'
import { Avatar } from '@/components/ui-kit'
import { cn } from '@/lib/utils'

export function NotificationPanel() {
  const { logs, unreadAlerts, clearAlerts } = useStore()
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Get the 5 most recent alerts
  const recentAlerts = logs
    .filter((l) => l.action === 'Alert Sent')
    .slice(0, 5)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleOpen() {
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      clearAlerts()
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Notifications, ${unreadAlerts} unread`}
      >
        <Bell className="size-[18px]" />
        {unreadAlerts > 0 ? (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-danger-foreground">
            {unreadAlerts}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Alerts</h3>
            <Link
              href="/logs?action=Alert+Sent"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {recentAlerts.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/40">
                    <div className="mt-1 shrink-0">
                      {alert.known && alert.staffName ? (
                        <Avatar name={alert.staffName} size={36} />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-full bg-danger/15 text-danger">
                          <ScanFace className="size-4" />
                        </div>
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {alert.known ? alert.staffName : 'Unknown Intruder Detected'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(alert.timestamp)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-danger">
                        Confidence: {alert.confidence}%
                      </p>
                    </div>

                    {alert.snapshotPath ? (
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded border border-border">
                        <img 
                          src={alert.snapshotPath.startsWith('http') ? alert.snapshotPath : `${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'}${alert.snapshotPath}`}
                          alt="Snapshot" 
                          className="h-full w-full object-cover" 
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No recent alerts found.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

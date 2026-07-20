'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Bell,
  CalendarClock,
  Gem,
  LayoutDashboard,
  ScrollText,
  Siren,
  Users,
  Video,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/components/store-provider'
import { Dot } from '@/components/ui-kit'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/live-view', label: 'Live View', icon: Video },
  { href: '/staff', label: 'Staff Management', icon: Users },
  { href: '/hours-rules', label: 'Store Hours & Rules', icon: CalendarClock },
  { href: '/alerts', label: 'Alert Settings', icon: Siren },
  { href: '/logs', label: 'Logs & History', icon: ScrollText },
]

function Clock() {
  const { now } = useStore()
  const time = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  return <span className="font-mono text-sm tabular-nums text-muted-foreground">{time}</span>
}

function ModeToggle() {
  const { settings, setSettings } = useStore()
  const isLive = settings.systemMode === 'live'
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
      {(['test', 'live'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => setSettings((p) => ({ ...p, systemMode: mode }))}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
            settings.systemMode === mode
              ? mode === 'live'
                ? 'bg-danger text-danger-foreground'
                : 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode} Mode
        </button>
      ))}
      <span className="sr-only">{isLive ? 'Live mode active' : 'Test mode active'}</span>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Gem className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">Esamyak</p>
          <p className="text-xs text-muted-foreground">Security Console</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
              {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg bg-sidebar-accent/60 p-3">
          <p className="text-xs font-medium text-sidebar-foreground">Esamyak Jewels</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Bandra West, Mumbai</p>
        </div>
      </div>
    </div>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { storeOpen, overrideActive, unreadAlerts, clearAlerts, todayHours, settings } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="sticky top-0 h-svh">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          <button
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <Clock />
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <ModeToggle />

            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
                overrideActive
                  ? 'border-warning/30 bg-warning/15 text-warning'
                  : storeOpen
                    ? 'border-success/30 bg-success/15 text-success'
                    : 'border-danger/30 bg-danger/15 text-danger',
              )}
            >
              <Dot tone={overrideActive ? 'warning' : storeOpen ? 'success' : 'danger'} />
              {overrideActive ? 'OVERRIDE ACTIVE' : storeOpen ? 'OPEN' : 'CLOSED'}
              <span className="hidden font-mono font-normal text-muted-foreground sm:inline">
                {overrideActive
                  ? `until ${settings.rules.maintenanceEnd}`
                  : todayHours.closed
                    ? 'Closed today'
                    : `${todayHours.open}–${todayHours.close}`}
              </span>
            </div>

            <button
              onClick={clearAlerts}
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
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

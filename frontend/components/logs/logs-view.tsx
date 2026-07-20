'use client'

import { useMemo, useState } from 'react'
import { ImageIcon, ScanFace } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Avatar, Badge, Card, Modal, inputClass } from '@/components/ui-kit'
import { PageHeader } from '@/components/page-header'
import { formatDateTime } from '@/lib/format'
import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

type KnownFilter = 'all' | 'known' | 'unknown'
type StatusFilter = 'all' | 'open' | 'closed'

export function LogsView() {
  const { logs } = useStore()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [knownFilter, setKnownFilter] = useState<KnownFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<LogEntry | null>(null)

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const d = new Date(l.timestamp)
      if (from && d < new Date(from + 'T00:00:00')) return false
      if (to && d > new Date(to + 'T23:59:59')) return false
      if (knownFilter === 'known' && !l.known) return false
      if (knownFilter === 'unknown' && l.known) return false
      if (statusFilter === 'open' && !l.storeOpen) return false
      if (statusFilter === 'closed' && l.storeOpen) return false
      return true
    })
  }, [logs, from, to, knownFilter, statusFilter])

  return (
    <div>
      <PageHeader
        title="Logs & History"
        description="Full record of detection events captured by the system."
      />

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Recognition</label>
            <select
              className={inputClass}
              value={knownFilter}
              onChange={(e) => setKnownFilter(e.target.value as KnownFilter)}
            >
              <option value="all">All faces</option>
              <option value="known">Known only</option>
              <option value="unknown">Unknown only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Store status</label>
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Open & Closed</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of {logs.length} events
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Timestamp</th>
                <th className="px-5 py-3 font-medium">Recognition</th>
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {l.known && l.staffName ? (
                        <Avatar name={l.staffName} size={32} />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-danger/15 text-danger">
                          <ScanFace className="size-4" />
                        </div>
                      )}
                      <span className="font-medium text-foreground">
                        {l.known ? l.staffName : 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-muted-foreground">
                    {formatDateTime(l.timestamp)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={l.known ? 'success' : 'danger'}>
                      {l.known ? 'Known' : 'Unknown'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={l.storeOpen ? 'success' : 'neutral'}>
                      {l.storeOpen ? 'Open' : 'Closed'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        l.action === 'Alert Sent' ? 'text-danger' : 'text-muted-foreground',
                      )}
                    >
                      {l.action}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'font-mono',
                        l.confidence >= 75
                          ? 'text-success'
                          : l.confidence >= 50
                            ? 'text-warning'
                            : 'text-danger',
                      )}
                    >
                      {l.confidence}%
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No events match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detection Detail"
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-muted/40">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="size-8" />
                <span className="text-sm">Snapshot placeholder</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Detail label="Identity" value={selected.known ? (selected.staffName ?? 'Known') : 'Unknown Person'} />
              <Detail label="Timestamp" value={formatDateTime(selected.timestamp)} mono />
              <Detail label="Store status" value={selected.storeOpen ? 'Open' : 'Closed'} />
              <Detail label="Action taken" value={selected.action} />
              <Detail label="Confidence" value={`${selected.confidence}%`} mono />
              <Detail label="Event ID" value={selected.id} mono />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Badge tone={selected.known ? 'success' : 'danger'}>
                {selected.known ? 'Known face' : 'Unknown face'}
              </Badge>
              {selected.action === 'Alert Sent' ? (
                <Badge tone="danger">Alert dispatched</Badge>
              ) : (
                <Badge tone="neutral">Logged only</Badge>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-medium text-foreground', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

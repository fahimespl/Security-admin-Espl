'use client'

import { useEffect, useState } from 'react'
import { ScanFace, ImageIcon } from 'lucide-react'
import { Avatar, Badge, Button, Card, Modal, inputClass } from '@/components/ui-kit'
import { PageHeader } from '@/components/page-header'
import { formatDateTime } from '@/lib/format'
import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

type KnownFilter = 'all' | 'known' | 'unknown'
type StatusFilter = 'all' | 'open' | 'closed'

export function LogsView() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [knownFilter, setKnownFilter] = useState<KnownFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<LogEntry | null>(null)

  const [page, setPage] = useState(1)
  const [data, setData] = useState<{items: LogEntry[], total: number, pages: number}>({items: [], total: 0, pages: 1})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [from, to, knownFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', page.toString())
    params.set('limit', '50')
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (knownFilter === 'known') params.set('known', 'true')
    if (knownFilter === 'unknown') params.set('known', 'false')
    if (statusFilter === 'open') params.set('store_open', 'true')
    if (statusFilter === 'closed') params.set('store_open', 'false')

    const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
    fetch(`${API}/api/logs?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [page, from, to, knownFilter, statusFilter])

  function handleExport() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (knownFilter === 'known') params.set('known', 'true')
    if (knownFilter === 'unknown') params.set('known', 'false')
    if (statusFilter === 'open') params.set('store_open', 'true')
    if (statusFilter === 'closed') params.set('store_open', 'false')

    const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
    window.open(`${API}/api/logs/export?${params.toString()}`, '_blank')
  }

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
            {loading ? 'Loading...' : (
              <>Showing <span className="font-medium text-foreground">{data.items.length}</span> of {data.total} events</>
            )}
          </p>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || data.total === 0}>
            Export CSV
          </Button>
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
              {data.items.map((l) => (
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
              {data.items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No events match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        
        {/* Pagination controls */}
        {data.pages > 1 ? (
          <div className="flex items-center justify-center gap-4 border-t border-border px-5 py-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="text-sm font-medium text-muted-foreground disabled:opacity-50"
            >
              &larr; Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.pages}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(p => p + 1)}
              className="text-sm font-medium text-muted-foreground disabled:opacity-50"
            >
              Next &rarr;
            </button>
          </div>
        ) : null}
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
            <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
              {selected.snapshotPath ? (
                <img
                  src={selected.snapshotPath.startsWith('http') ? selected.snapshotPath : `${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'}${selected.snapshotPath}`}
                  alt="Snapshot"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="size-8" />
                  <span className="text-sm">No snapshot available</span>
                </div>
              )}
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

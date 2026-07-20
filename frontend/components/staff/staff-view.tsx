'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { useToast } from '@/components/toast'
import { Avatar, Badge, Card } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { StaffForm, type StaffDraft } from '@/components/staff/staff-form'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { inputClass } from '@/components/ui-kit'
import { formatDate } from '@/lib/format'
import type { StaffMember, StaffRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const ROLE_FILTERS: (StaffRole | 'All')[] = ['All', 'Manager', 'Sales', 'Security', 'Cleaner']

const ROLE_TONE: Record<StaffRole, 'primary' | 'success' | 'warning' | 'neutral'> = {
  Manager: 'primary',
  Sales: 'success',
  Security: 'warning',
  Cleaner: 'neutral',
}

export function StaffView() {
  const { staff, addStaff, updateStaff, deleteStaff } = useStore()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'All'>('All')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StaffMember | undefined>(undefined)
  const [deleting, setDeleting] = useState<StaffMember | undefined>(undefined)

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      const matchesQuery = s.name.toLowerCase().includes(query.toLowerCase())
      const matchesRole = roleFilter === 'All' || s.role === roleFilter
      return matchesQuery && matchesRole
    })
  }, [staff, query, roleFilter])

  function handleSubmit(draft: StaffDraft) {
    if (editing) {
      updateStaff(editing.id, draft)
      toast({ title: 'Staff updated', description: `${draft.name}'s profile was saved.` })
    } else {
      addStaff(draft)
      toast({ title: 'Staff added', description: `${draft.name} is now enrolled.` })
    }
    setEditing(undefined)
  }

  return (
    <div>
      <PageHeader
        title="Staff Management"
        description="Enrolled face profiles used for recognition."
      >
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" />
          Add Staff
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder="Search by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                roleFilter === r
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserPlus className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No staff found</p>
            <p className="text-sm text-muted-foreground">
              Try a different search or add a new member.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={s.name} photo={s.photo} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{s.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={ROLE_TONE[s.role]}>{s.role}</Badge>
                    <Badge tone={s.status === 'Active' ? 'success' : 'neutral'}>
                      {s.status}
                    </Badge>
                    {s.photo && !s.hasEmbedding ? (
                      <Badge tone="warning">Needs Re-enrollment</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Enrolled {formatDate(s.enrolledOn)}
              </p>
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setEditing(s)
                    setFormOpen(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleting(s)}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <StaffForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        initial={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) {
            deleteStaff(deleting.id)
            toast({
              title: 'Staff removed',
              description: `${deleting.name} was deleted.`,
              variant: 'warning',
            })
          }
        }}
        title="Delete staff member?"
        message={`This will remove ${deleting?.name}'s face profile from the system. This cannot be undone.`}
      />
    </div>
  )
}

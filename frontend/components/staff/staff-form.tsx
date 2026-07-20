'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Avatar, Field, Modal, Switch, inputClass } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import type { StaffMember, StaffRole } from '@/lib/types'

const ROLES: StaffRole[] = ['Manager', 'Sales', 'Cleaner', 'Security']

export interface StaffDraft {
  name: string
  role: StaffRole
  status: 'Active' | 'Inactive'
  photo?: string          // data URL — for preview only
  photoFile?: File        // raw File object — sent to backend
  enrolledOn: string
}

export function StaffForm({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (draft: StaffDraft) => void
  initial?: StaffMember
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffRole>('Sales')
  const [active, setActive] = useState(true)
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [photoFile, setPhotoFile] = useState<File | undefined>(undefined)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setRole(initial?.role ?? 'Sales')
      setActive(initial ? initial.status === 'Active' : true)
      setPhoto(initial?.photo)
      setPhotoFile(undefined)
      setError('')
    }
  }, [open, initial])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  function submit() {
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    onSubmit({
      name: name.trim(),
      role,
      status: active ? 'Active' : 'Inactive',
      photo,
      photoFile,
      enrolledOn: initial?.enrolledOn ?? new Date().toISOString().slice(0, 10),
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Staff Member' : 'Add Staff Member'}
      description="Enroll a face profile for recognition. Photos stay in your browser."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={name || 'New'} photo={photo} size={64} />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              Upload photo
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">JPG or PNG, preview only.</p>
          </div>
        </div>

        <Field label="Full name" htmlFor="staff-name">
          <input
            id="staff-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aarav Shah"
          />
        </Field>

        <Field label="Role" htmlFor="staff-role">
          <select
            id="staff-role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Active</p>
            <p className="text-xs text-muted-foreground">Include in live recognition</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Active status" />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{initial ? 'Save changes' : 'Add staff'}</Button>
        </div>
      </div>
    </Modal>
  )
}

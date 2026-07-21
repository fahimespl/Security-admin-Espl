'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
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
  const [faceStatus, setFaceStatus] = useState<'idle' | 'checking' | 'detected' | 'not-detected'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setRole(initial?.role ?? 'Sales')
      setActive(initial ? initial.status === 'Active' : true)
      setPhoto(initial?.photo)
      setPhotoFile(undefined)
      setError('')
      setFaceStatus('idle')
    }
  }, [open, initial])

  const abortRef = useRef<AbortController | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Cancel any previous in-flight check
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPhotoFile(file)
    setFaceStatus('idle')

    // Show preview immediately — don't wait for the server
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)

    // Small debounce: skip the spinner flash on fast connections
    await new Promise((r) => setTimeout(r, 200))
    if (controller.signal.aborted) return

    // Server-side face check
    setFaceStatus('checking')
    const form = new FormData()
    form.append('photo', file, file.name)

    try {
      const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
      const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''
      const res = await fetch(`${API}/api/staff/check-face`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
        body: form,
        signal: controller.signal,
      })

      if (res.ok) {
        const data = await res.json()
        setFaceStatus(data.faceDetected ? 'detected' : 'not-detected')
      } else {
        setFaceStatus('idle')
      }
    } catch (err: unknown) {
      // AbortError = user picked a new file, just ignore
      if (err instanceof Error && err.name !== 'AbortError') {
        setFaceStatus('idle')
      }
    }
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
            <p className="mt-1.5 text-xs text-muted-foreground">JPG or PNG</p>
            {faceStatus === 'checking' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Checking for face...
              </p>
            )}
            {faceStatus === 'detected' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="size-3" /> Face detected
              </p>
            )}
            {faceStatus === 'not-detected' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                <AlertCircle className="size-3" /> No face detected
              </p>
            )}
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

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  AlertRecipient,
  LogEntry,
  Settings,
  StaffMember,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'X-API-Key': API_KEY,
  }
  // Only set Content-Type for requests with a body (and not FormData)
  if (init?.body && typeof init.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

// ---------------------------------------------------------------------------
// Simple SWR-like hook (avoids adding an npm dep for a single pattern)
// ---------------------------------------------------------------------------
function useApi<T>(path: string, fallback: T): { data: T; mutate: () => void } {
  const [data, setData] = useState<T>(fallback)
  const [rev, setRev] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiFetch<T>(path).then((d) => {
      if (!cancelled) setData(d)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [path, rev])

  const mutate = useCallback(() => setRev((r) => r + 1), [])
  return { data, mutate }
}

// ---------------------------------------------------------------------------
// Context value shape — unchanged from the original mock version
// ---------------------------------------------------------------------------
interface StoreContextValue {
  staff: StaffMember[]
  logs: LogEntry[]
  settings: Settings
  now: Date
  storeOpen: boolean
  overrideActive: boolean
  storeStatus: 'open' | 'closed' | 'override'
  todayHours: { open: string; close: string; closed: boolean }
  unreadAlerts: number
  clearAlerts: () => void
  addStaff: (s: Omit<StaffMember, 'id'> & { photoFile?: File }) => void
  updateStaff: (id: string, patch: Partial<StaffMember> & { photoFile?: File }) => void
  deleteStaff: (id: string) => void
  setSettings: (updater: (prev: Settings) => Settings) => void
  addRecipient: (r: Omit<AlertRecipient, 'id'>) => void
  removeRecipient: (id: string) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

const DAY_INDEX_TO_NAME = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

// Default settings used before backend responds
const FALLBACK_SETTINGS: Settings = {
  systemMode: 'test',
  hours: {
    perDay: false,
    default: { open: '10:00', close: '20:00' },
    week: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => ({
      day: d,
      open: '10:00',
      close: d === 'Sunday' ? '18:00' : '20:00',
      closed: false,
    })),
  },
  rules: {
    cooldownSeconds: 30,
    confidenceThreshold: 75,
    maintenanceMode: false,
    maintenanceStart: '02:00',
    maintenanceEnd: '05:00',
    alertUnknownOnly: true,
  },
  channels: { whatsapp: true, siren: false, autoLock: false },
  recipients: [],
}

// Fixed "now" so server and client render identically on first paint.
const MOCK_NOW = new Date('2026-07-13T14:32:00')

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // ---- Data from backend ----
  const { data: rawStaff, mutate: mutateStaff } = useApi<StaffMember[]>('/api/staff', [])

  // Rewrite relative photo paths → absolute backend URLs so Next.js img tags work
  const staff = useMemo<StaffMember[]>(
    () =>
      rawStaff.map((s) => ({
        ...s,
        photo: s.photo
          ? s.photo.startsWith('http')
            ? s.photo
            : `${API}${s.photo}`
          : undefined,
      })),
    [rawStaff],
  )

  const { data: logsData, mutate: mutateLogs } = useApi<{items: LogEntry[]}>('/api/logs?limit=50', { items: [] })
  const logs = logsData.items
  const { data: settings, mutate: mutateSettings } = useApi<Settings>('/api/settings', FALLBACK_SETTINGS)

  interface StatusResponse {
    status: 'open' | 'closed' | 'override'
    storeOpen: boolean
    overrideActive: boolean
    todayHours: { open: string; close: string; closed: boolean }
  }

  const { data: statusData, mutate: mutateStatus } = useApi<StatusResponse>('/api/status', {
    status: 'closed',
    storeOpen: false,
    overrideActive: false,
    todayHours: { open: '10:00', close: '20:00', closed: false }
  })

  // ---- Local state ----
  const [now, setNow] = useState<Date>(MOCK_NOW)
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  // Tick clock every second
  useEffect(() => {
    setNow(new Date()) // sync to real time immediately after hydration
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Count new alerts for the bell badge
  useEffect(() => {
    const todayStr = new Date().toDateString()
    const todayAlerts = logs.filter(
      (l) => l.action === 'Alert Sent' && new Date(l.timestamp).toDateString() === todayStr,
    ).length
    setUnreadAlerts(todayAlerts)
  }, [logs])

  // Periodically refresh logs (every 5s) to pick up detection entries
  useEffect(() => {
    const id = setInterval(() => mutateLogs(), 5000)
    return () => clearInterval(id)
  }, [mutateLogs])

  // Periodically refresh status (every 15s) to stay synced with backend
  useEffect(() => {
    const id = setInterval(() => mutateStatus(), 15000)
    return () => clearInterval(id)
  }, [mutateStatus])

  const todayHours = statusData.todayHours
  const storeOpen = statusData.storeOpen
  const overrideActive = statusData.overrideActive
  const storeStatus = statusData.status

  // ---- Mutations ----

  const addStaff = useCallback(
    async (s: Omit<StaffMember, 'id'> & { photoFile?: File }) => {
      const form = new FormData()
      form.append('name', s.name)
      form.append('role', s.role)
      form.append('status', s.status)
      if (s.photoFile) {
        // Use the raw File object directly — no data-URL roundtrip needed
        form.append('photo', s.photoFile, s.photoFile.name)
      }
      await fetch(`${API}/api/staff`, { 
        method: 'POST', 
        headers: { 'X-API-Key': API_KEY },
        body: form 
      })
      mutateStaff()
    },
    [mutateStaff],
  )

  const updateStaff = useCallback(
    async (id: string, patch: Partial<StaffMember> & { photoFile?: File }) => {
      if (patch.photoFile) {
        // Photo is changing — must use multipart FormData
        const form = new FormData()
        if (patch.name !== undefined) form.append('name', patch.name)
        if (patch.role !== undefined) form.append('role', patch.role)
        if (patch.status !== undefined) form.append('status', patch.status)
        form.append('photo', patch.photoFile, patch.photoFile.name)
        await fetch(`${API}/api/staff/${id}`, { 
          method: 'PATCH', 
          headers: { 'X-API-Key': API_KEY },
          body: form 
        })
      } else {
        // No photo change — send compact JSON patch (name/role/status only)
        const { photoFile: _ignored, photo: _photo, ...rest } = patch as typeof patch & { photo?: string; photoFile?: File }
        await apiFetch(`/api/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(rest),
        })
      }
      mutateStaff()
    },
    [mutateStaff],
  )

  const deleteStaff = useCallback(
    async (id: string) => {
      await apiFetch(`/api/staff/${id}`, { method: 'DELETE' })
      mutateStaff()
    },
    [mutateStaff],
  )

  const setSettings = useCallback(
    async (updater: (prev: Settings) => Settings) => {
      // Apply the updater to current settings, then PUT to backend
      const next = updater(settings)
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(next),
      })
      mutateSettings()
      mutateStatus()
    },
    [settings, mutateSettings, mutateStatus],
  )

  const addRecipient = useCallback(
    async (r: Omit<AlertRecipient, 'id'>) => {
      await apiFetch('/api/recipients', {
        method: 'POST',
        body: JSON.stringify(r),
      })
      mutateSettings()
    },
    [mutateSettings],
  )

  const removeRecipient = useCallback(
    async (id: string) => {
      await apiFetch(`/api/recipients/${id}`, { method: 'DELETE' })
      mutateSettings()
    },
    [mutateSettings],
  )

  const clearAlerts = useCallback(() => setUnreadAlerts(0), [])

  const value = useMemo<StoreContextValue>(
    () => ({
      staff,
      logs,
      settings,
      now,
      storeOpen,
      overrideActive,
      storeStatus,
      todayHours,
      unreadAlerts,
      clearAlerts,
      addStaff,
      updateStaff,
      deleteStaff,
      setSettings,
      addRecipient,
      removeRecipient,
    }),
    [
      staff,
      logs,
      settings,
      now,
      storeOpen,
      overrideActive,
      storeStatus,
      todayHours,
      unreadAlerts,
      clearAlerts,
      addStaff,
      updateStaff,
      deleteStaff,
      setSettings,
      addRecipient,
      removeRecipient,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

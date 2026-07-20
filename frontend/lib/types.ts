export type StaffRole = 'Manager' | 'Sales' | 'Cleaner' | 'Security'
export type StaffStatus = 'Active' | 'Inactive'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  enrolledOn: string // ISO date
  status: StaffStatus
  photo?: string // data URL when uploaded, otherwise undefined -> initials avatar
  hasEmbedding?: boolean
}

export type ActionTaken = 'Logged Only' | 'Alert Sent'

export interface LogEntry {
  id: string
  timestamp: string // ISO datetime
  known: boolean
  staffName?: string
  storeOpen: boolean
  action: ActionTaken
  confidence: number // 0-100
}

export interface AlertRecipient {
  id: string
  name: string
  phone: string
}

export interface DayHours {
  day: string
  open: string // HH:mm
  close: string // HH:mm
  closed: boolean
}

export interface Settings {
  systemMode: 'test' | 'live'
  hours: {
    perDay: boolean
    default: { open: string; close: string }
    week: DayHours[]
  }
  rules: {
    cooldownSeconds: number
    confidenceThreshold: number
    maintenanceMode: boolean
    maintenanceStart: string
    maintenanceEnd: string
  }
  channels: {
    whatsapp: boolean
    siren: boolean
    autoLock: boolean
  }
  recipients: AlertRecipient[]
}

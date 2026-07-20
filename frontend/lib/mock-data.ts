import type { LogEntry, Settings, StaffMember } from './types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const INITIAL_STAFF: StaffMember[] = [
  { id: 's1', name: 'Aarav Shah', role: 'Manager', enrolledOn: '2024-11-03', status: 'Active' },
  { id: 's2', name: 'Priya Mehta', role: 'Sales', enrolledOn: '2025-01-14', status: 'Active' },
  { id: 's3', name: 'Rohan Deshmukh', role: 'Security', enrolledOn: '2024-09-22', status: 'Active' },
  { id: 's4', name: 'Ananya Iyer', role: 'Sales', enrolledOn: '2025-02-08', status: 'Active' },
  { id: 's5', name: 'Vikram Nair', role: 'Security', enrolledOn: '2024-12-01', status: 'Inactive' },
  { id: 's6', name: 'Sneha Kulkarni', role: 'Cleaner', enrolledOn: '2025-03-19', status: 'Active' },
  { id: 's7', name: 'Karan Malhotra', role: 'Sales', enrolledOn: '2025-04-02', status: 'Active' },
  { id: 's8', name: 'Divya Reddy', role: 'Manager', enrolledOn: '2024-10-11', status: 'Active' },
]

export const INITIAL_SETTINGS: Settings = {
  systemMode: 'test',
  hours: {
    perDay: false,
    default: { open: '10:00', close: '20:00' },
    week: DAYS.map((day) => ({
      day,
      open: '10:00',
      close: day === 'Sunday' ? '18:00' : '20:00',
      closed: false,
    })),
  },
  rules: {
    cooldownSeconds: 30,
    confidenceThreshold: 75,
    maintenanceMode: false,
    maintenanceStart: '02:00',
    maintenanceEnd: '05:00',
  },
  channels: {
    whatsapp: true,
    siren: false,
    autoLock: false,
  },
  recipients: [
    { id: 'r1', name: 'Aarav Shah', phone: '+91 98200 11223' },
    { id: 'r2', name: 'Control Room', phone: '+91 98200 44556' },
    { id: 'r3', name: 'Rohan Deshmukh', phone: '+91 98200 77889' },
  ],
}

const KNOWN_NAMES = [
  'Aarav Shah',
  'Priya Mehta',
  'Rohan Deshmukh',
  'Ananya Iyer',
  'Sneha Kulkarni',
  'Karan Malhotra',
  'Divya Reddy',
]

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// Deterministic pseudo-random so server and client markup match on hydration.
function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function generateLogs(count = 26): LogEntry[] {
  const rand = seeded(4242)
  const logs: LogEntry[] = []
  const base = new Date('2026-07-13T09:30:00')

  for (let i = 0; i < count; i++) {
    const rnd = rand()
    // Spread events backwards across ~6 days
    const minutesBack = Math.floor(rand() * 60 * 24 * 6)
    const ts = new Date(base.getTime() - minutesBack * 60 * 1000)
    const hour = ts.getHours()
    const storeOpen = hour >= 10 && hour < 20
    const known = rnd > 0.42
    const confidence = known
      ? 82 + Math.floor(rand() * 17)
      : 30 + Math.floor(rand() * 45)
    const action: LogEntry['action'] =
      !known && !storeOpen ? 'Alert Sent' : known ? 'Logged Only' : rand() > 0.5 ? 'Alert Sent' : 'Logged Only'

    logs.push({
      id: `log-${i + 1}`,
      timestamp: ts.toISOString(),
      known,
      staffName: known ? KNOWN_NAMES[Math.floor(rand() * KNOWN_NAMES.length)] : undefined,
      storeOpen,
      action,
      confidence,
    })
  }

  return logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

export function detectionsPerDay(): { day: string; count: number }[] {
  const rand = seeded(99)
  const labels = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']
  return labels.map((day) => ({ day, count: 18 + Math.floor(rand() * 44) }))
}

export const AVATAR_COLORS = [
  'oklch(0.68 0.13 233)',
  'oklch(0.72 0.17 152)',
  'oklch(0.82 0.15 85)',
  'oklch(0.62 0.22 25)',
  'oklch(0.7 0.12 300)',
  'oklch(0.7 0.13 190)',
]

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function colorForName(name: string) {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

export function pad2(n: number) {
  return pad(n)
}

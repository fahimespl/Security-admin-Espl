'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, ScanFace, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Badge, Card, CardHeader } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'
import { CameraTile } from './camera-tile'

interface Box {
  id: string
  name: string
  confidence: number
  x: number
  y: number
  w: number
  h: number
}

interface CameraConfig {
  id: string
  deviceId?: string
  label: string
}

export function LiveView() {
  const { storeOpen, overrideActive, settings } = useStore()
  const threshold = settings.rules.confidenceThreshold

  // State for available hardware devices
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  
  // State for configured camera tiles
  const [cameras, setCameras] = useState<CameraConfig[]>([
    { id: '01', label: 'Default Camera' }
  ])

  // Aggregated boxes from all cameras
  const [allBoxes, setAllBoxes] = useState<Record<string, Box[]>>({})

  useEffect(() => {
    // Fetch available media devices
    async function getDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return
      try {
        await navigator.mediaDevices.getUserMedia({ video: true }) // prompt for permission first
        const devs = await navigator.mediaDevices.enumerateDevices()
        setDevices(devs.filter(d => d.kind === 'videoinput'))
      } catch (err) {
        console.error('Failed to get media devices', err)
      }
    }
    getDevices()
  }, [])

  const handleBoxesUpdate = useCallback((camId: string, boxes: Box[]) => {
    setAllBoxes(prev => ({ ...prev, [camId]: boxes }))
  }, [])

  const addCamera = (deviceId?: string, label?: string) => {
    const nextId = (cameras.length + 1).toString().padStart(2, '0')
    setCameras(prev => [
      ...prev,
      {
        id: nextId,
        deviceId,
        label: label || `Camera ${nextId}`
      }
    ])
  }

  const removeCamera = (camId: string) => {
    setCameras(prev => prev.filter(c => c.id !== camId))
    setAllBoxes(prev => {
      const copy = { ...prev }
      delete copy[camId]
      return copy
    })
  }

  // Aggregate boxes for the status panel
  const totalBoxes = useMemo(() => {
    return Object.values(allBoxes).flat()
  }, [allBoxes])

  const knownCount = totalBoxes.filter((b) => b.confidence >= threshold).length
  const unknownCount = totalBoxes.length - knownCount
  const alertTriggered = unknownCount > 0 && !storeOpen && !overrideActive

  const decision = overrideActive
    ? 'Override Active — Logged Only, No Alert'
    : alertTriggered
      ? 'Shop Closed — ALERT TRIGGERED'
      : storeOpen
        ? 'Shop Open — Logging Only'
        : unknownCount > 0
          ? 'Shop Closed — Monitoring'
          : 'Shop Closed — All Clear'

  return (
    <div>
      <PageHeader
        title="Live View"
        description="Real-time multi-camera feed with face-recognition overlays."
      >
        <div className="flex items-center gap-2">
          {devices.length > 0 && (
            <select
              className="bg-card border border-border rounded-md px-3 py-2 text-sm"
              onChange={(e) => {
                if (e.target.value) {
                  const dev = devices.find(d => d.deviceId === e.target.value)
                  addCamera(e.target.value, dev?.label)
                  e.target.value = "" // reset select
                }
              }}
            >
              <option value="">+ Add hardware camera...</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Video Input ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => addCamera()} variant="outline">
            <Plus className="size-4 mr-2" />
            Add virtual camera
          </Button>
        </div>
      </PageHeader>

      {settings.systemMode === 'test' ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Test Mode active — no hardware connected. Detections shown are simulated.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Multi-Camera Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cameras.map((cam) => (
              <div key={cam.id} className="relative group">
                <CameraTile
                  camId={cam.id}
                  title={cam.label}
                  deviceId={cam.deviceId}
                  onBoxesUpdate={handleBoxesUpdate}
                />
                {cameras.length > 1 && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeCamera(cam.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detection panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Detection Status (All Cameras)" />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Faces detected</span>
                <span className="text-2xl font-semibold text-foreground">{totalBoxes.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                  <div className="flex items-center gap-1.5 text-success">
                    <ShieldCheck className="size-4" />
                    <span className="text-xs font-medium">Known</span>
                  </div>
                  <p className="mt-1 text-xl font-semibold text-success">{knownCount}</p>
                </div>
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
                  <div className="flex items-center gap-1.5 text-danger">
                    <ScanFace className="size-4" />
                    <span className="text-xs font-medium">Unknown</span>
                  </div>
                  <p className="mt-1 text-xl font-semibold text-danger">{unknownCount}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rule Engine Decision" />
            <div className="p-5">
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-4',
                  alertTriggered
                    ? 'border-danger/40 bg-danger/10'
                    : overrideActive
                      ? 'border-warning/40 bg-warning/10'
                      : 'border-success/30 bg-success/10',
                )}
              >
                {alertTriggered ? (
                  <ShieldAlert className="size-6 shrink-0 text-danger" />
                ) : overrideActive ? (
                  <ShieldAlert className="size-6 shrink-0 text-warning" />
                ) : (
                  <ShieldCheck className="size-6 shrink-0 text-success" />
                )}
                <div>
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      alertTriggered
                        ? 'text-danger'
                        : overrideActive
                          ? 'text-warning'
                          : 'text-success',
                    )}
                  >
                    {decision}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Store is {storeOpen ? 'open' : 'closed'} · Mode:{' '}
                    {settings.systemMode === 'live' ? 'Live' : 'Test'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {overrideActive ? (
                  <Badge tone="warning">Override Active</Badge>
                ) : (
                  <Badge tone={storeOpen ? 'success' : 'danger'}>
                    {storeOpen ? 'Store Open' : 'Store Closed'}
                  </Badge>
                )}
                <Badge tone={settings.systemMode === 'live' ? 'danger' : 'primary'}>
                  {settings.systemMode === 'live' ? 'Live Mode' : 'Test Mode'}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Threshold</dt>
                  <dd className="font-mono text-foreground">{threshold}%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Cooldown</dt>
                  <dd className="font-mono text-foreground">{settings.rules.cooldownSeconds}s</dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

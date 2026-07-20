'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CameraOff, RefreshCw, ScanFace, ShieldAlert, ShieldCheck, Video, AlertTriangle } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Badge, Card, CardHeader } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'

interface Box {
  id: string
  name: string
  // match score 0-100 from the recognition engine
  confidence: number
  // relative coordinates 0-1
  x: number
  y: number
  w: number
  h: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

// How often we grab a frame and send it to the backend (ms)
const FRAME_INTERVAL_MS = 300

export function LiveView() {
  const { storeOpen, overrideActive, settings } = useStore()
  const threshold = settings.rules.confidenceThreshold

  const videoRef = useRef<HTMLVideoElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)  // hidden, used for frame capture
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)  // visible overlay for boxes
  const containerRef = useRef<HTMLDivElement>(null)

  const [camState, setCamState] = useState<'idle' | 'starting' | 'on' | 'denied' | 'error'>('idle')
  const [boxes, setBoxes] = useState<Box[]>([])

  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Draw bounding boxes on overlay canvas ──────────────────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const draw = () => {
      const { width, height } = container.getBoundingClientRect()
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      for (const b of boxes) {
        const known = b.confidence >= threshold
        const label = known
          ? `Known: ${b.name} (${b.confidence}%)`
          : `Unknown (${b.confidence}%)`
        const x = b.x * width
        const y = b.y * height
        const w = b.w * width
        const h = b.h * height
        const color = known ? '#4ade80' : '#f87171'

        ctx.lineWidth = 2.5
        ctx.strokeStyle = color
        ctx.strokeRect(x, y, w, h)

        // Label background
        ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
        const textW = ctx.measureText(label).width
        ctx.fillStyle = color
        ctx.fillRect(x, y - 22, textW + 16, 22)
        ctx.fillStyle = '#0b0f16'
        ctx.fillText(label, x + 8, y - 6)
      }
    }

    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [boxes, threshold])

  // ── Frame capture loop: grab video frame → POST to backend ─────────────────
  const startFrameLoop = useCallback(() => {
    if (intervalRef.current) return

    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      const canvas = captureCanvasRef.current
      if (!video || !canvas || video.readyState < 2) return

      // Draw the current video frame onto the hidden capture canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to JPEG blob
      canvas.toBlob(async (blob) => {
        if (!blob) return
        const form = new FormData()
        form.append('frame', blob, 'frame.jpg')

        try {
          const res = await fetch(`${API_BASE}/api/stream/process-frame`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) return
          const data = await res.json()
          if (data && Array.isArray(data.boxes)) {
            setBoxes(data.boxes)
          }
        } catch {
          // Network error — silently skip this frame
        }
      }, 'image/jpeg', 0.8)
    }, FRAME_INTERVAL_MS)
  }, [])

  // ── Stop everything ────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setBoxes([])
    setCamState('idle')
  }, [])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ── Start camera (getUserMedia) ────────────────────────────────────────────
  async function startCamera() {
    if (camState === 'starting' || camState === 'on') return
    setCamState('starting')
    setBoxes([])

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      setCamState('on')
      startFrameLoop()
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCamState('denied')
      } else {
        setCamState('error')
      }
    }
  }

  const isStreaming = camState === 'on'

  const knownCount = boxes.filter((b) => b.confidence >= threshold).length
  const unknownCount = boxes.length - knownCount
  // Override suppresses alerts entirely, even outside opening hours.
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
        description="Real-time camera feed with face-recognition overlays."
      >
        {isStreaming ? (
          <Button variant="outline" onClick={stopCamera}>
            <CameraOff className="size-4" />
            Stop camera
          </Button>
        ) : camState === 'starting' ? (
          <Button disabled>
            <RefreshCw className="size-4 animate-spin" />
            Starting…
          </Button>
        ) : (
          <Button onClick={startCamera}>
            <Camera className="size-4" />
            Start camera
          </Button>
        )}
      </PageHeader>

      {settings.systemMode === 'test' ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Test Mode active — no hardware connected. Detections shown are simulated.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Video panel — browser getUserMedia stream */}
        <Card className="overflow-hidden lg:col-span-2">
          <div
            ref={containerRef}
            className="relative aspect-video w-full bg-black"
          >
            {/* Live video from browser camera */}
            <video
              ref={videoRef}
              muted
              playsInline
              className={cn('size-full object-cover', !isStreaming && 'hidden')}
            />

            {/* Hidden canvas used only for frame capture — never shown */}
            <canvas ref={captureCanvasRef} className="hidden" />

            {/* Bounding-box overlay canvas */}
            <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />

            {/* Placeholder when camera is off / starting / error */}
            {!isStreaming ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-card to-black text-muted-foreground">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                  {camState === 'denied' ? (
                    <AlertTriangle className="size-7 text-warning" />
                  ) : camState === 'error' ? (
                    <CameraOff className="size-7" />
                  ) : camState === 'starting' ? (
                    <RefreshCw className="size-7 animate-spin" />
                  ) : (
                    <Video className="size-7" />
                  )}
                </div>
                <div className="text-center px-6">
                  <p className="text-sm font-medium text-foreground">
                    {camState === 'denied'
                      ? 'Camera access denied'
                      : camState === 'error'
                        ? 'Camera unavailable'
                        : camState === 'starting'
                          ? 'Requesting camera access…'
                          : 'Camera feed offline'}
                  </p>
                  <p className="text-sm mt-1">
                    {camState === 'denied'
                      ? 'Please allow camera access in your browser settings and try again.'
                      : camState === 'error'
                        ? 'Could not access the camera. Make sure no other app is using it.'
                        : camState === 'starting'
                          ? 'Please accept the browser camera permission prompt.'
                          : 'Click "Start camera" to enable the live feed.'}
                  </p>
                  {(camState === 'denied' || camState === 'error') ? (
                    <button
                      onClick={startCamera}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <RefreshCw className="size-3" />
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Live badges */}
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur">
                <span className={cn('size-1.5 rounded-full', isStreaming ? 'animate-pulse bg-danger' : 'bg-muted-foreground')} />
                {camState === 'on' ? 'LIVE' : 'OFFLINE'}
              </span>
              <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur">
                CAM 01 · Entrance
              </span>
            </div>
          </div>
        </Card>

        {/* Detection panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Detection Status" />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Faces detected</span>
                <span className="text-2xl font-semibold text-foreground">{boxes.length}</span>
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

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CameraOff, RefreshCw, AlertTriangle, Video } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { Card } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Box {
  id: string
  name: string
  confidence: number
  x: number
  y: number
  w: number
  h: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
const FRAME_INTERVAL_MS = 300

export function CameraTile({
  camId,
  title,
  deviceId,
  onBoxesUpdate,
}: {
  camId: string
  title: string
  deviceId?: string
  onBoxesUpdate: (camId: string, boxes: Box[]) => void
}) {
  const { settings } = useStore()
  const threshold = settings.rules.confidenceThreshold

  const videoRef = useRef<HTMLVideoElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [camState, setCamState] = useState<'idle' | 'starting' | 'on' | 'denied' | 'error'>('idle')
  const [boxes, setBoxes] = useState<Box[]>([])

  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Draw bounding boxes on overlay canvas
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

  // ── Frame capture loop
  const startFrameLoop = useCallback(() => {
    if (intervalRef.current) return

    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      const canvas = captureCanvasRef.current
      if (!video || !canvas || video.readyState < 2) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(async (blob) => {
        if (!blob) return
        const form = new FormData()
        form.append('frame', blob, 'frame.jpg')
        form.append('cam', camId)

        try {
          const res = await fetch(`${API_BASE}/api/stream/process-frame`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) return
          const data = await res.json()
          if (data && Array.isArray(data.boxes)) {
            setBoxes(data.boxes)
            onBoxesUpdate(camId, data.boxes)
          }
        } catch {
          // Silent failure
        }
      }, 'image/jpeg', 0.8)
    }, FRAME_INTERVAL_MS)
  }, [camId, onBoxesUpdate])

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
    onBoxesUpdate(camId, [])
    setCamState('idle')
  }, [camId, onBoxesUpdate])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function startCamera() {
    if (camState === 'starting' || camState === 'on') return
    setCamState('starting')
    setBoxes([])
    onBoxesUpdate(camId, [])

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
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

  return (
    <Card className="overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between bg-card p-3 border-b border-border">
        <div className="font-semibold">{title}</div>
        <div>
          {isStreaming ? (
            <Button variant="outline" size="sm" onClick={stopCamera}>
              <CameraOff className="size-4 mr-2" />
              Stop
            </Button>
          ) : camState === 'starting' ? (
            <Button disabled size="sm">
              <RefreshCw className="size-4 mr-2 animate-spin" />
              Starting…
            </Button>
          ) : (
            <Button onClick={startCamera} size="sm">
              <Camera className="size-4 mr-2" />
              Start
            </Button>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-black flex-1"
      >
        <video
          ref={videoRef}
          muted
          playsInline
          className={cn('size-full object-cover', !isStreaming && 'hidden')}
        />

        <canvas ref={captureCanvasRef} className="hidden" />
        <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />

        {!isStreaming ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-card to-black text-muted-foreground p-6 text-center">
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
            <div className="px-6">
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
                      : 'Click "Start" to enable the live feed.'}
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
            CAM {camId}
          </span>
        </div>
      </div>
    </Card>
  )
}

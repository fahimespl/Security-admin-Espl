'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '@/components/ui-kit'

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

export function DetectionsChart() {
  const [data, setData] = useState<{ day: string; count: number }[]>([])

  useEffect(() => {
    fetch(`${API}/api/dashboard/detections`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
  }, [])

  const max = Math.max(1, ...data.map((d) => d.count))
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <Card>
      <CardHeader
        title="Detections per Day"
        description="Last 7 days"
        action={
          <div className="text-right">
            <p className="text-lg font-semibold text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">total</p>
          </div>
        }
      />
      <div className="p-5">
        <div className="flex h-48 items-end justify-between gap-3">
          {data.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {d.count}
              </span>
              <div className="flex w-full items-end justify-center">
                <div
                  className="w-full max-w-10 rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                  style={{ height: `${(d.count / max) * 150}px` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{d.day}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

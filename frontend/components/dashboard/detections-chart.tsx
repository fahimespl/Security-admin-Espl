'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader } from '@/components/ui-kit'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

interface HourlyStat {
  time: string
  known: number
  unknown: number
}

export function DetectionsChart() {
  const [data, setData] = useState<HourlyStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''
    fetch(`${API}/api/dashboard/hourly-stats`, {
      headers: { 'X-API-Key': API_KEY }
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const total = data.reduce((sum, d) => sum + d.known + d.unknown, 0)

  return (
    <Card>
      <CardHeader
        title="Detections by Hour"
        description="Last 12 hours"
        action={
          <div className="text-right">
            <p className="text-lg font-semibold text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">total</p>
          </div>
        }
      />
      <div className="p-5">
        <div className="h-64 w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading chart...
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} 
                />
                <Tooltip 
                  cursor={{ fill: 'var(--color-muted)', opacity: 0.2 }}
                  contentStyle={{ 
                    backgroundColor: 'var(--color-background)',
                    borderColor: 'var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Bar 
                  dataKey="known" 
                  name="Known Staff" 
                  stackId="a" 
                  fill="var(--color-primary)" 
                  radius={[0, 0, 4, 4]} 
                />
                <Bar 
                  dataKey="unknown" 
                  name="Unknown / Intruder" 
                  stackId="a" 
                  fill="var(--color-danger)" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  )
}

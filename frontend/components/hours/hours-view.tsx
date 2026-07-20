'use client'

import { Clock, ShieldQuestion, UserCheck } from 'lucide-react'
import { useStore } from '@/components/store-provider'
import { useToast } from '@/components/toast'
import { Badge, Card, CardHeader, Field, Slider, Switch, inputClass } from '@/components/ui-kit'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'

export function HoursView() {
  const { settings, setSettings, todayHours, storeOpen, overrideActive } = useStore()
  const { toast } = useToast()
  const { hours, rules } = settings

  return (
    <div>
      <PageHeader
        title="Store Hours & Rules"
        description="Define when the store is open and how the recognition engine behaves. Changes save automatically."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Hours */}
        <Card>
          <CardHeader
            title="Opening Hours"
            description="Used to decide OPEN / CLOSED status"
            action={
              <Badge tone={overrideActive ? 'warning' : storeOpen ? 'success' : 'danger'}>
                {overrideActive ? 'Override active' : storeOpen ? 'Open now' : 'Closed now'}
              </Badge>
            }
          />
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Different hours per day</p>
                <p className="text-xs text-muted-foreground">
                  Set individual times for each weekday
                </p>
              </div>
              <Switch
                checked={hours.perDay}
                onChange={(v) => setSettings((p) => ({ ...p, hours: { ...p.hours, perDay: v } }))}
                label="Per-day hours"
              />
            </div>

            {!hours.perDay ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opening time" htmlFor="open-time">
                  <input
                    id="open-time"
                    type="time"
                    className={inputClass}
                    value={hours.default.open}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        hours: { ...p.hours, default: { ...p.hours.default, open: e.target.value } },
                      }))
                    }
                  />
                </Field>
                <Field label="Closing time" htmlFor="close-time">
                  <input
                    id="close-time"
                    type="time"
                    className={inputClass}
                    value={hours.default.close}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        hours: { ...p.hours, default: { ...p.hours.default, close: e.target.value } },
                      }))
                    }
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                {hours.week.map((d, i) => (
                  <div
                    key={d.day}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <span className="w-24 text-sm font-medium text-foreground">{d.day}</span>
                    <Switch
                      checked={!d.closed}
                      onChange={(v) =>
                        setSettings((p) => {
                          const week = [...p.hours.week]
                          week[i] = { ...week[i], closed: !v }
                          return { ...p, hours: { ...p.hours, week } }
                        })
                      }
                      label={`${d.day} open`}
                    />
                    {d.closed ? (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          className={cn(inputClass, 'w-28')}
                          value={d.open}
                          onChange={(e) =>
                            setSettings((p) => {
                              const week = [...p.hours.week]
                              week[i] = { ...week[i], open: e.target.value }
                              return { ...p, hours: { ...p.hours, week } }
                            })
                          }
                        />
                        <span className="text-muted-foreground">–</span>
                        <input
                          type="time"
                          className={cn(inputClass, 'w-28')}
                          value={d.close}
                          onChange={(e) =>
                            setSettings((p) => {
                              const week = [...p.hours.week]
                              week[i] = { ...week[i], close: e.target.value }
                              return { ...p, hours: { ...p.hours, week } }
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Weekly preview */}
        <Card>
          <CardHeader title="Weekly Schedule" description="Preview of the current configuration" />
          <div className="p-5">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {hours.week.map((d) => {
                    const open = hours.perDay ? d.open : hours.default.open
                    const close = hours.perDay ? d.close : hours.default.close
                    const closed = hours.perDay && d.closed
                    const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
                    const isToday = d.day === todayName
                    return (
                      <tr key={d.day} className={cn(isToday && 'bg-primary/5')}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{d.day}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                          {closed ? (
                            <span className="text-danger">Closed</span>
                          ) : (
                            `${open} – ${close}`
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              Status in the top bar updates automatically from these hours.
            </p>
          </div>
        </Card>

        {/* Rules */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Rule Engine"
            description="Tune how strictly and how often the system reacts"
          />
          <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Cooldown period</p>
                <span className="font-mono text-sm text-primary">{rules.cooldownSeconds}s</span>
              </div>
              <Slider
                value={rules.cooldownSeconds}
                min={5}
                max={300}
                step={5}
                onChange={(v) =>
                  setSettings((p) => ({ ...p, rules: { ...p.rules, cooldownSeconds: v } }))
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Don&apos;t re-alert the same person within this window.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Confidence threshold</p>
                <span className="font-mono text-sm text-primary">{rules.confidenceThreshold}%</span>
              </div>
              <Slider
                value={rules.confidenceThreshold}
                min={0}
                max={100}
                step={1}
                onChange={(v) =>
                  setSettings((p) => ({ ...p, rules: { ...p.rules, confidenceThreshold: v } }))
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Minimum match score before a face counts as &quot;known&quot;.
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <UserCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Alert on unknown faces only
                    </p>
                    <p className="text-xs text-muted-foreground">
                      When enabled, recognized staff won't trigger alerts during closed hours.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={rules.alertUnknownOnly ?? true}
                  onChange={(v) =>
                    setSettings((p) => ({ ...p, rules: { ...p.rules, alertUnknownOnly: v } }))
                  }
                  label="Alert unknown only"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
                    <ShieldQuestion className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Maintenance / Manual Override
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Suppress all alerts during a scheduled window
                    </p>
                  </div>
                </div>
                <Switch
                  checked={rules.maintenanceMode}
                  onChange={(v) =>
                    setSettings((p) => ({ ...p, rules: { ...p.rules, maintenanceMode: v } }))
                  }
                  label="Maintenance mode"
                />
              </div>
              {rules.maintenanceMode ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Suppress from" htmlFor="maint-start">
                    <input
                      id="maint-start"
                      type="time"
                      className={inputClass}
                      value={rules.maintenanceStart}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          rules: { ...p.rules, maintenanceStart: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Suppress until" htmlFor="maint-end">
                    <input
                      id="maint-end"
                      type="time"
                      className={inputClass}
                      value={rules.maintenanceEnd}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          rules: { ...p.rules, maintenanceEnd: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <p className="col-span-2 flex items-center gap-2 text-xs">
                    <Badge tone={overrideActive ? 'warning' : 'neutral'}>
                      {overrideActive ? 'Currently active' : 'Scheduled'}
                    </Badge>
                    <span className="text-muted-foreground">
                      {overrideActive
                        ? 'Alerts are suppressed right now — detections are logged only.'
                        : 'Alerts will be suppressed during this window, even while closed.'}
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

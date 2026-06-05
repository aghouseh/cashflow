// Data-driven projection chart for the onboarding flow.
// Uses the production projection engine (projectOne) so the line a user sees
// in onboarding is identical to what they land on in Balance.

import { useEffect, useRef, useMemo, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { projectOne } from '#/lib/projection'
import type { Entry } from '#/lib/db/schema'

export type ObDraftEntry = {
  id: string
  kind: 'IN' | 'OUT'
  name: string
  amount: number
  cadenceKey: 'weekly' | 'bi-weekly' | 'monthly'
}

const OB_RRULE: Record<ObDraftEntry['cadenceKey'], string> = {
  monthly:    'FREQ=MONTHLY',
  'bi-weekly':'FREQ=WEEKLY;INTERVAL=2',
  weekly:     'FREQ=WEEKLY',
}

function smoothPath(coords: [number, number][]): string {
  if (coords.length < 2) return ''
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

export function fmtMoneyOb(n: number): string {
  return (n < 0 ? '-$' : '$') +
    Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

type Props = {
  w: number
  h: number
  startBalance: number
  entries: ObDraftEntry[]
  run?: number
  endLabel?: string
  showArea?: boolean
  showTags?: boolean
  grid?: boolean
  padY?: number
  padX?: number
}

export default function OnboardingChart({
  w, h, startBalance, entries, run = 0,
  endLabel = '~6 MONTHS',
  showArea = true, showTags = true, grid = true,
  padY = 24, padX = 8,
}: Props) {
  const lineRef = useRef<SVGPathElement>(null)
  const [pathLen, setPathLen] = useState(800)

  const today = useMemo(() => Temporal.Now.plainDateISO().toString(), [])

  const fakeEntries = useMemo((): Entry[] =>
    entries
      .filter(e => e.amount > 0)
      .map(e => ({
        id: e.id,
        kind: e.kind,
        name: e.name,
        amount: e.amount,
        currency: 'USD',
        startDate: today,
        endDate: null,
        rrule: OB_RRULE[e.cadenceKey],
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    [entries, today],
  )

  const fakeSnapshot = useMemo(() => ({
    id: 'ob-preview',
    balance: startBalance || 0,
    asOf: today,
  }), [startBalance, today])

  const series = useMemo(() => {
    const proj = projectOne(fakeSnapshot, fakeEntries, 182)
    return proj.series
  }, [fakeSnapshot, fakeEntries])

  // Sample every 2 days for a smooth curve with reasonable point count
  const sampled = useMemo(() => {
    const pts: number[] = []
    for (let i = 0; i <= 182; i += 2) {
      pts.push(series[Math.min(i, series.length - 1)])
    }
    return pts
  }, [series])

  const { minV, maxV, coords, d, area } = useMemo(() => {
    let minV = Math.min(...sampled)
    let maxV = Math.max(...sampled)
    if (minV === maxV) { minV -= 1; maxV += 1 }
    const x0 = padX, x1 = w - padX
    const yTop = padY, yBot = h - padY
    const X = (i: number) => x0 + (x1 - x0) * i / (sampled.length - 1)
    const Y = (v: number) => yBot - (yBot - yTop) * ((v - minV) / (maxV - minV))
    const coords: [number, number][] = sampled.map((v, i) => [X(i), Y(v)])
    const d = smoothPath(coords)
    const first = coords[0]
    const last = coords[coords.length - 1]
    const area = `${d} L ${last[0].toFixed(1)} ${h - padY} L ${first[0].toFixed(1)} ${h - padY} Z`
    return { minV, maxV, coords, d, area }
  }, [sampled, w, h, padX, padY])

  useEffect(() => {
    if (lineRef.current) setPathLen(Math.ceil(lineRef.current.getTotalLength()))
  }, [d, run])

  const first = coords[0]
  const last = coords[coords.length - 1]
  const endBal = series[series.length - 1]
  const showZero = minV < 0 && maxV > 0
  const zeroY = padY + (h - 2 * padY) * (1 - (0 - minV) / (maxV - minV))
  const rows = 3

  return (
    <div className="ob-chart">
      <svg viewBox={`0 0 ${w} ${h}`} key={run}>
        {grid && Array.from({ length: rows }).map((_, i) => {
          const y = padY + ((h - 2 * padY) / (rows - 1)) * i
          return <line key={i} className="ob-gl" x1={padX} y1={y} x2={w - padX} y2={y} />
        })}
        {showZero && (
          <line className="ob-zero-line" x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} />
        )}
        {showArea && <path className="ob-area ob-area-fade" d={area} />}
        <path
          ref={lineRef}
          className="ob-line ob-line-draw"
          d={d}
          style={{ '--len': pathLen } as React.CSSProperties}
        />

        <g className="ob-end-group" style={{ transformOrigin: `${last[0]}px ${last[1]}px` }}>
          <circle className="ob-enddot" cx={last[0]} cy={last[1]} r={3.5} />
          {showTags && (
            <text className="ob-tag" x={last[0] - 4} y={last[1] - 10} textAnchor="end">
              {fmtMoneyOb(endBal)}
            </text>
          )}
          {showTags && (
            <text className="ob-tag ob-tag-muted" x={last[0] - 4} y={last[1] + 16} textAnchor="end">
              {endLabel}
            </text>
          )}
        </g>

        <g className="ob-nowdot">
          <circle className="ob-ring" cx={first[0]} cy={first[1]} r={5} />
          <circle className="ob-core" cx={first[0]} cy={first[1]} r={2} />
        </g>
        {showTags && (
          <text className="ob-tag ob-tag-muted" x={first[0] + 2} y={first[1] - 12} textAnchor="start">
            TODAY
          </text>
        )}
      </svg>
    </div>
  )
}

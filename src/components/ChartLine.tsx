// Scrub-driven projection chart. Pure-SVG, no chart library.
//
// Drag anywhere on the chart to scrub. The amber marker (line + ring + bottom
// diamond) tracks the scrub day. A dashed NOW line marks day 0. Event dots
// (sage = IN, terracotta = OUT) sit on the curve at each event day.
//
// Coordinate model: SVG `viewBox` is fixed (`VBW`×`VBH`); the rendered size is
// scaled by the container. Pointer events compute the day index from the
// element's bounding rect, not the viewBox, so drag works at any rendered size.

import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import type { ProjectionEvent } from '#/lib/projection'

const VBW = 1180
const VBH = 320
const PAD_L = 56
const PAD_R = 16
const PAD_T = 24
const PAD_B = 40
const INNER_W = VBW - PAD_L - PAD_R
const INNER_H = VBH - PAD_T - PAD_B

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

type Props = {
  series: number[]
  events: ProjectionEvent[]
  asOf: string // ISO YYYY-MM-DD — anchor date (day 0 in absolute terms)
  // First-day offset of the displayed series from `asOf`. Page 0 = 0.
  // Used so event filtering, date labels, and the NOW marker know where this
  // window sits in the full timeline.
  dayOffset?: number
  scrubOffset: number // 0..series.length-1, within the displayed window
  onScrubChange: (offset: number) => void
}

export default function ChartLine({
  series,
  events,
  asOf,
  dayOffset = 0,
  scrubOffset,
  onScrubChange,
}: Props) {
  const [active, setActive] = useState(false)
  const lastIdx = series.length - 1
  const xOf = (day: number) => PAD_L + (INNER_W * day) / lastIdx

  const seriesMin = Math.min(...series)
  const seriesMax = Math.max(...series)
  // Pad y range so the line isn't flush against the top/bottom; round to $500.
  const yMin = Math.floor((seriesMin - 500) / 500) * 500
  const yMax = Math.ceil((seriesMax + 500) / 500) * 500
  const yRange = yMax - yMin || 1
  const yOf = (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H

  const linePath = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ')
  const areaPath = `${linePath} L${xOf(lastIdx)},${PAD_T + INNER_H} L${xOf(0)},${PAD_T + INNER_H} Z`

  // Y gridlines — ~5 lines across the range, rounded to $1k.
  const gridStep = Math.max(1000, Math.ceil(yRange / 5 / 1000) * 1000)
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v < yMax; v += gridStep) gridLines.push(v)

  // Month ticks — label at start of window and each month boundary across it.
  const start = Temporal.PlainDate.from(asOf)
  const monthTicks: { day: number; label: string }[] = []
  let lastMonth = -1
  for (let d = 0; d <= lastIdx; d++) {
    const date = start.add({ days: dayOffset + d })
    if (date.month !== lastMonth) {
      lastMonth = date.month
      monthTicks.push({ day: d, label: MONTHS[date.month - 1] })
    }
  }

  // NOW marker shows only when the anchor day (absolute day 0) falls inside
  // the displayed window. For pages > 0, it's hidden.
  const nowInWindow = dayOffset === 0
  const nowX = xOf(0)

  const scrubX = xOf(scrubOffset)
  const scrubY = yOf(series[scrubOffset])
  const scrubDate = start.add({ days: dayOffset + scrubOffset })
  const scrubLabel = `${MONTHS[scrubDate.month - 1]} ${scrubDate.day} · ${USD.format(series[scrubOffset])}`

  // Filter events to the visible window + re-base their dayIndex to series-local.
  const windowEvents = events
    .filter((e) => e.dayIndex >= dayOffset && e.dayIndex <= dayOffset + lastIdx)
    .map((e) => ({ ...e, localDay: e.dayIndex - dayOffset }))

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    // Only respond while a button is pressed (drag), not on bare hover.
    if (e.buttons !== 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Convert client x to viewBox x first, then to day index, so scrub is
    // accurate regardless of how the SVG is scaled into its container.
    const xInView = ((e.clientX - rect.left) / rect.width) * VBW
    const innerX = xInView - PAD_L
    const ratio = innerX / INNER_W
    const day = Math.round(ratio * lastIdx)
    const clamped = Math.max(0, Math.min(lastIdx, day))
    if (clamped !== scrubOffset) onScrubChange(clamped)
  }

  return (
    <div className="relative">
      {/* Invisible HTML anchor that tracks the scrub dot. The tooltip below
          uses CSS anchor positioning (`position-anchor: --chart-scrub`) to
          latch onto it. Both live in the same DOM subtree so anchor scope
          resolves without needing the (not-yet-shipped) `anchor` attribute. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: `${(scrubX / VBW) * 100}%`,
          top: `${(scrubY / VBH) * 100}%`,
          width: 0,
          height: 0,
          anchorName: '--chart-scrub',
        }}
      />

      {active && (
        <div className="chart-tooltip" role="status" aria-live="polite">
          {scrubLabel}
        </div>
      )}

      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="block w-full cursor-ew-resize select-none"
        // Lock the rendered container to the viewBox aspect so circles stay
        // round — `preserveAspectRatio="none"` was stretching them to ovals.
        style={{ aspectRatio: `${VBW} / ${VBH}`, touchAction: 'none' }}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setActive(true)
          handlePointer(e)
        }}
        onPointerMove={handlePointer}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        onPointerCancel={() => setActive(false)}
      >
      <defs>
        <linearGradient id="chartline-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y gridlines + dollar labels */}
      {gridLines.map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            y1={yOf(v)}
            x2={VBW - PAD_R}
            y2={yOf(v)}
            stroke="var(--color-line)"
            strokeDasharray="2 5"
          />
          <text
            x={PAD_L - 8}
            y={yOf(v) + 3.5}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--color-ink-3)"
          >
            ${(v / 1000).toFixed(0)}k
          </text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill="url(#chartline-area)" />
      <path d={linePath} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />

      {/* Event dots — rings on the curve, sage for IN, terracotta for OUT. */}
      {windowEvents.map((ev) => (
        <circle
          key={`${ev.entryId}-${ev.date}`}
          cx={xOf(ev.localDay)}
          cy={yOf(series[ev.localDay])}
          r="2.4"
          fill="var(--color-card)"
          stroke={ev.kind === 'IN' ? 'var(--color-in)' : 'var(--color-out)'}
          strokeWidth="1.4"
        />
      ))}

      {/* NOW marker — only when the anchor day falls inside this window. */}
      {nowInWindow && (
        <>
          <line
            x1={nowX}
            y1={PAD_T - 2}
            x2={nowX}
            y2={PAD_T + INNER_H + 4}
            stroke="var(--color-ink-3)"
            strokeDasharray="3 3"
          />
          <text
            x={nowX + 6}
            y={PAD_T + 10}
            fontFamily="var(--font-mono)"
            fontSize="10"
            fontWeight="500"
            fill="var(--color-ink-2)"
            letterSpacing="0.09em"
          >
            NOW
          </text>
        </>
      )}

      {/* Month tick labels */}
      {monthTicks.map((t) => (
        <text
          key={t.day}
          x={xOf(t.day)}
          y={PAD_T + INNER_H + 18}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          fill="var(--color-ink-3)"
        >
          {t.label}
        </text>
      ))}

      {/* Scrub: full-height amber line, ring + dot on the curve, diamond on axis */}
      <line
        x1={scrubX}
        y1={PAD_T - 8}
        x2={scrubX}
        y2={PAD_T + INNER_H + 18}
        stroke="var(--color-amber)"
        strokeWidth="1.6"
      />
      <circle
        cx={scrubX}
        cy={scrubY}
        r="8"
        fill="var(--color-card)"
        stroke="var(--color-amber)"
        strokeWidth="2.2"
      />
      <circle cx={scrubX} cy={scrubY} r="3" fill="var(--color-amber)" />
      <rect
        x={scrubX - 5}
        y={PAD_T + INNER_H + 12}
        width="10"
        height="10"
        transform={`rotate(45 ${scrubX} ${PAD_T + INNER_H + 17})`}
        fill="var(--color-amber)"
      />

      </svg>
    </div>
  )
}

// Scrub-driven projection chart. Pure-SVG, pure renderer — no gestures.
//
// Gesture handling (tap-to-scrub, swipe-to-slide pages) lives in ChartStrip
// so it can coordinate across multiple windows sliding in formation. This
// file is a stateless visualization of one window slice.
//
// The amber marker (line + ring + bottom diamond) tracks the scrub day when
// `scrubOffset` is provided. A dashed NOW line marks day 0 when it falls
// inside the window. Event dots (sage = IN, terracotta = OUT) sit on the
// curve at each event day.

import { Temporal } from '@js-temporal/polyfill'
import type { ProjectionEvent } from '#/lib/projection'

const VBW = 1180
const VBH = 320
// PAD_L_DEFAULT reserves space for the in-SVG y-axis labels. When ChartLine
// is tiled inside ChartStrip we override to 0 so windows tile seamlessly,
// and the labels live in a static gutter outside the sliding viewport.
const PAD_L_DEFAULT = 56
const PAD_R_DEFAULT = 16
const PAD_T = 24
const PAD_B = 40
const INNER_H = VBH - PAD_T - PAD_B

// Exported so the static y-axis gutter and gridline overlay use the same
// vertical mapping as the data charts.
export const CHART_GEOMETRY = { VBW, VBH, PAD_T, PAD_B, PAD_L_DEFAULT, INNER_H } as const

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
  dayOffset?: number
  // 0..series.length-1 within the displayed window. Undefined = no scrub.
  scrubOffset?: number
  // Optional y-axis overrides — used by ChartStrip to share a common scale
  // across the prev/current/next windows so the line is continuous across
  // window seams during a slide.
  yMin?: number
  yMax?: number
  // When true, render the tooltip pill at the scrub position.
  tooltipActive?: boolean
  // When false, skip rendering the y-axis gridlines + dollar labels — the
  // ChartStrip lifts them into a static overlay so they don't slide with the
  // strip during paging.
  showYAxis?: boolean
  // Override horizontal padding. ChartStrip passes 0 for both so the inner
  // charts tile seamlessly across window seams.
  padL?: number
  padR?: number
}

function yGridValues(yMin: number, yMax: number): number[] {
  const yRange = yMax - yMin || 1
  const gridStep = Math.max(1000, Math.ceil(yRange / 5 / 1000) * 1000)
  const lines: number[] = []
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v < yMax; v += gridStep) lines.push(v)
  return lines
}

function makeYOf(yMin: number, yMax: number): (v: number) => number {
  const yRange = yMax - yMin || 1
  return (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H
}

// Dollar labels in a static gutter to the LEFT of the chart-strip viewport.
// HTML-positioned so they sit outside the sliding viewport entirely — they
// never translate, never re-render per page.
export function YAxisLabels({
  yMin,
  yMax,
  width = PAD_L_DEFAULT,
}: {
  yMin: number
  yMax: number
  width?: number
}) {
  const yOf = makeYOf(yMin, yMax)
  const lines = yGridValues(yMin, yMax)
  return (
    <div className="relative shrink-0" style={{ width }} aria-hidden>
      {lines.map((v) => (
        <span
          key={v}
          className="mono absolute right-2 text-[10px] text-ink-3"
          style={{
            top: `${(yOf(v) / VBH) * 100}%`,
            transform: 'translateY(-50%)',
          }}
        >
          ${(v / 1000).toFixed(0)}k
        </span>
      ))}
    </div>
  )
}

// Horizontal gridlines, positioned absolutely inside the chart-strip viewport
// so they stay static while the data slides past underneath.
export function YAxisGridlines({ yMin, yMax }: { yMin: number; yMax: number }) {
  const yOf = makeYOf(yMin, yMax)
  const lines = yGridValues(yMin, yMax)
  return (
    <svg
      viewBox={`0 0 ${VBW} ${VBH}`}
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 block h-full w-full"
    >
      {lines.map((v) => (
        <line
          key={v}
          x1={0}
          y1={yOf(v)}
          x2={VBW}
          y2={yOf(v)}
          stroke="var(--cf-line)"
          strokeDasharray="2 5"
        />
      ))}
    </svg>
  )
}

// Exposed for ChartStrip + parent to compute a shared y-scale across windows.
export function seriesYBounds(series: number[]): { yMin: number; yMax: number } {
  const seriesMin = Math.min(...series)
  const seriesMax = Math.max(...series)
  return {
    yMin: Math.floor((seriesMin - 500) / 500) * 500,
    yMax: Math.ceil((seriesMax + 500) / 500) * 500,
  }
}

export default function ChartLine({
  series,
  events,
  asOf,
  dayOffset = 0,
  scrubOffset,
  yMin: yMinOverride,
  yMax: yMaxOverride,
  tooltipActive = false,
  showYAxis = true,
  padL = PAD_L_DEFAULT,
  padR = PAD_R_DEFAULT,
}: Props) {
  const lastIdx = series.length - 1
  const innerW = VBW - padL - padR
  const xOf = (day: number) => padL + (innerW * day) / lastIdx

  const auto = seriesYBounds(series)
  const yMin = yMinOverride ?? auto.yMin
  const yMax = yMaxOverride ?? auto.yMax
  const yRange = yMax - yMin || 1
  const yOf = (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H

  const linePath = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ')
  const areaPath = `${linePath} L${xOf(lastIdx)},${PAD_T + INNER_H} L${xOf(0)},${PAD_T + INNER_H} Z`

  // Y gridlines — ~5 lines across the range, rounded to $1k.
  const gridStep = Math.max(1000, Math.ceil(yRange / 5 / 1000) * 1000)
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v < yMax; v += gridStep) gridLines.push(v)

  // Month ticks — label the first-of-each-month only. Labeling day 0 of the
  // window too created duplicate labels at every page seam (prev's right
  // edge and current's left edge both fell within the same calendar month).
  const start = Temporal.PlainDate.from(asOf)
  const monthTicks: { day: number; label: string }[] = []
  for (let d = 0; d <= lastIdx; d++) {
    const date = start.add({ days: dayOffset + d })
    if (date.day === 1) {
      monthTicks.push({ day: d, label: MONTHS[date.month - 1] })
    }
  }

  // NOW marker shows only when the anchor day (absolute day 0) falls inside
  // the displayed window. For pages > 0 or windows in the past, it's hidden.
  const nowInWindow = dayOffset === 0
  const nowX = xOf(0)

  const hasScrub = scrubOffset !== undefined
  const scrubX = hasScrub ? xOf(scrubOffset!) : 0
  const scrubY = hasScrub ? yOf(series[scrubOffset!]) : 0
  const scrubDate = hasScrub ? start.add({ days: dayOffset + scrubOffset! }) : null
  const scrubLabel =
    scrubDate !== null
      ? `${MONTHS[scrubDate.month - 1]} ${scrubDate.day} · ${USD.format(series[scrubOffset!])}`
      : ''

  // Filter events to the visible window + re-base their dayIndex to series-local.
  const windowEvents = events
    .filter((e) => e.dayIndex >= dayOffset && e.dayIndex <= dayOffset + lastIdx)
    .map((e) => ({ ...e, localDay: e.dayIndex - dayOffset }))

  return (
    <div className="relative w-full">
      {hasScrub && (
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
      )}

      {tooltipActive && hasScrub && (
        <div className="chart-tooltip" role="status" aria-live="polite">
          {scrubLabel}
        </div>
      )}

      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="block w-full select-none"
        style={{ aspectRatio: `${VBW} / ${VBH}` }}
      >
        <defs>
          <linearGradient id="chartline-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--cf-ink)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--cf-ink)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {showYAxis &&
          gridLines.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                y1={yOf(v)}
                x2={VBW - padR}
                y2={yOf(v)}
                stroke="var(--cf-line)"
                strokeDasharray="2 5"
              />
              <text
                x={padL - 8}
                y={yOf(v) + 3.5}
                textAnchor="end"
                fontFamily="var(--cf-font-mono)"
                fontSize="10"
                fill="var(--cf-ink-3)"
              >
                ${(v / 1000).toFixed(0)}k
              </text>
            </g>
          ))}

        <path d={areaPath} fill="url(#chartline-area)" />
        <path d={linePath} fill="none" stroke="var(--cf-ink)" strokeWidth="1.5" />

        {windowEvents.map((ev) => (
          <circle
            key={`${ev.entryId}-${ev.date}`}
            cx={xOf(ev.localDay)}
            cy={yOf(series[ev.localDay])}
            r="2.4"
            fill="var(--cf-surface)"
            stroke={ev.kind === 'IN' ? 'var(--cf-in)' : 'var(--cf-out)'}
            strokeWidth="1.4"
          />
        ))}

        {nowInWindow && (
          <>
            <line
              x1={nowX}
              y1={PAD_T - 2}
              x2={nowX}
              y2={PAD_T + INNER_H + 4}
              stroke="var(--cf-ink-3)"
              strokeDasharray="3 3"
            />
            <text
              x={nowX + 6}
              y={PAD_T + 10}
              fontFamily="var(--cf-font-mono)"
              fontSize="10"
              fontWeight="500"
              fill="var(--cf-ink-2)"
              letterSpacing="0.09em"
            >
              NOW
            </text>
          </>
        )}

        {monthTicks.map((t) => (
          <text
            key={t.day}
            x={xOf(t.day)}
            y={PAD_T + INNER_H + 18}
            textAnchor="middle"
            fontFamily="var(--cf-font-mono)"
            fontSize="10"
            fill="var(--cf-ink-3)"
          >
            {t.label}
          </text>
        ))}

        {hasScrub && (
          <>
            <line
              x1={scrubX}
              y1={PAD_T - 8}
              x2={scrubX}
              y2={PAD_T + INNER_H + 18}
              stroke="var(--cf-accent)"
              strokeWidth="1.6"
            />
            <circle
              cx={scrubX}
              cy={scrubY}
              r="8"
              fill="var(--cf-surface)"
              stroke="var(--cf-accent)"
              strokeWidth="2.2"
            />
            <circle cx={scrubX} cy={scrubY} r="3" fill="var(--cf-accent)" />
            <rect
              x={scrubX - 5}
              y={PAD_T + INNER_H + 12}
              width="10"
              height="10"
              transform={`rotate(45 ${scrubX} ${PAD_T + INNER_H + 17})`}
              fill="var(--cf-accent)"
            />
          </>
        )}
      </svg>
    </div>
  )
}

// Expose chart geometry so ChartStrip can convert a client x in the visible
// viewport back to a day index within a particular window's series. Pass
// padL / padR to match whatever the rendering chart used.
export function clientXToDay(
  clientX: number,
  rect: DOMRect,
  seriesLength: number,
  padL = PAD_L_DEFAULT,
  padR = PAD_R_DEFAULT,
): number {
  const innerW = VBW - padL - padR
  const xInView = ((clientX - rect.left) / rect.width) * VBW
  const innerX = xInView - padL
  const ratio = innerX / innerW
  const day = Math.round(ratio * (seriesLength - 1))
  return Math.max(0, Math.min(seriesLength - 1, day))
}

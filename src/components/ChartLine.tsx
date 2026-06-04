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
import type { ProjectionEvent, ReconcileMark } from '#/lib/projection'

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
  dayOffset?: number
  scrubOffset?: number
  yMin?: number
  yMax?: number
  tooltipActive?: boolean
  showYAxis?: boolean
  padL?: number
  padR?: number
  // Past window + reconcile seams (only rendered on page 0).
  // pastSeries[0] = origin date balance, pastSeries[last] = today's before-correction value.
  pastSeries?: number[]
  marks?: ReconcileMark[]
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
  pastSeries,
  marks = [],
}: Props) {
  const forwardDays = series.length - 1      // windowDays
  const innerW = VBW - padL - padR

  // Past window is active only on page 0 when pastSeries has content.
  const hasPast = dayOffset === 0 && !!pastSeries && pastSeries.length > 1 && marks.length > 0
  const pastDays = hasPast ? pastSeries!.length - 1 : 0
  const totalDomainDays = pastDays + forwardDays  // total days across x axis

  // xOf maps a "today-relative" day index to SVG x coordinate.
  // In forward-only mode: day 0 = left edge (= first element of series window).
  // In extended mode: day 0 = today = somewhere in the middle.
  const xOf = hasPast
    ? (day: number) => padL + (innerW * (day + pastDays)) / totalDomainDays
    : (day: number) => padL + (innerW * day) / forwardDays

  // Value at a today-relative day index.
  const valueAt = (day: number): number => {
    if (hasPast && day <= 0) {
      const idx = pastDays + day
      return pastSeries![Math.max(0, Math.min(pastSeries!.length - 1, idx))]
    }
    return series[Math.max(0, Math.min(forwardDays, day))]
  }

  const allValues = hasPast ? [...pastSeries!, ...series] : series
  const autoAll = { yMin: Math.min(...allValues), yMax: Math.max(...allValues) }
  const yMin = yMinOverride ?? Math.floor((autoAll.yMin - 500) / 500) * 500
  const yMax = yMaxOverride ?? Math.ceil((autoAll.yMax + 500) / 500) * 500
  const yRange = yMax - yMin || 1
  const yOf = (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H

  // ── build path segments, breaking at each seam mark ─────────────────────
  // Each mark splits the line: current segment ends at mark.before (projected),
  // a dashed vertical jump renders the correction, new segment starts at mark.after.
  const marksByDay = new Map(marks.map((m) => [m.dayIndex, m]))
  const domainStart = hasPast ? -pastDays : 0
  const domainEnd = forwardDays

  type Point = [number, number]
  const segs: Point[][] = []
  let cur: Point[] = []
  for (let d = domainStart; d <= domainEnd; d++) {
    const mark = marksByDay.get(d)
    if (mark) {
      cur.push([xOf(d), yOf(mark.before)])
      segs.push(cur)
      cur = [[xOf(d), yOf(mark.after)]]
    } else {
      cur.push([xOf(d), yOf(valueAt(d))])
    }
  }
  if (cur.length) segs.push(cur)

  const toSvgPath = (pts: Point[]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')

  const lastSeg = segs[segs.length - 1]
  const firstSeg = segs[0]
  const areaD =
    segs.map(toSvgPath).join(' ') +
    ` L${lastSeg[lastSeg.length - 1][0]},${PAD_T + INNER_H}` +
    ` L${firstSeg[0][0]},${PAD_T + INNER_H} Z`

  // ── Y axis grid ──────────────────────────────────────────────────────────
  const gridStep = Math.max(1000, Math.ceil(yRange / 5 / 1000) * 1000)
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v < yMax; v += gridStep) gridLines.push(v)

  // ── month ticks ───────────────────────────────────────────────────────────
  const today = Temporal.PlainDate.from(asOf)
  const monthTicks: { day: number; label: string }[] = []
  // In forward-only mode, iterate window-relative (0..forwardDays) adjusted by dayOffset.
  // In extended mode, iterate today-relative (-pastDays..forwardDays).
  if (hasPast) {
    for (let d = -pastDays; d <= forwardDays; d++) {
      const date = today.add({ days: d })
      if (date.day === 1) monthTicks.push({ day: d, label: MONTHS[date.month - 1] })
    }
  } else {
    for (let d = 0; d <= forwardDays; d++) {
      const date = today.add({ days: dayOffset + d })
      if (date.day === 1) monthTicks.push({ day: d, label: MONTHS[date.month - 1] })
    }
  }

  // ── NOW marker ────────────────────────────────────────────────────────────
  // In forward-only mode: show when dayOffset === 0 (day 0 of window = today).
  // In extended mode: always at xOf(0) (= middle of chart).
  const nowInWindow = hasPast || dayOffset === 0
  const nowX = hasPast ? xOf(0) : xOf(0)

  // ── past shade ────────────────────────────────────────────────────────────
  const pastShadeW = hasPast ? nowX - padL : 0

  // ── scrub ─────────────────────────────────────────────────────────────────
  // Scrub stays in the forward window only (0..forwardDays).
  // In extended mode, scrubOffset=0 = today = xOf(0).
  const hasScrub = scrubOffset !== undefined
  const scrubDayRel = hasScrub ? scrubOffset! : 0 // today-relative
  const scrubX = hasScrub ? xOf(hasPast ? scrubDayRel : scrubDayRel) : 0
  const scrubVal = hasScrub ? series[scrubOffset!] : 0
  const scrubY = hasScrub ? yOf(scrubVal) : 0
  const scrubDate = hasScrub ? today.add({ days: dayOffset + scrubOffset! }) : null
  const scrubLabel =
    scrubDate !== null
      ? `${MONTHS[scrubDate.month - 1]} ${scrubDate.day} · ${USD.format(scrubVal)}`
      : ''

  // ── visible events ────────────────────────────────────────────────────────
  // In extended mode: include past events (dayIndex ≤ 0) + future events.
  // In forward-only mode: only events inside the current window.
  const visibleEvents = hasPast
    ? events.filter((e) => e.dayIndex >= -pastDays && e.dayIndex <= forwardDays)
    : events
        .filter((e) => e.dayIndex >= dayOffset && e.dayIndex <= dayOffset + forwardDays)
        .map((e) => ({ ...e, dayIndex: e.dayIndex - dayOffset }))

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
              <line x1={padL} y1={yOf(v)} x2={VBW - padR} y2={yOf(v)} stroke="var(--cf-line)" strokeDasharray="2 5" />
              <text x={padL - 8} y={yOf(v) + 3.5} textAnchor="end" fontFamily="var(--cf-font-mono)" fontSize="10" fill="var(--cf-ink-3)">
                ${(v / 1000).toFixed(0)}k
              </text>
            </g>
          ))}

        {/* past shade */}
        {hasPast && pastShadeW > 0 && (
          <rect x={padL} y={PAD_T} width={pastShadeW} height={INNER_H} fill="var(--cf-ink)" opacity="0.025" />
        )}

        <path d={areaD} fill="url(#chartline-area)" />

        {/* line segments (may be multiple when seams present) */}
        {segs.map((seg, i) => (
          <path key={i} d={toSvgPath(seg)} fill="none" stroke="var(--cf-ink)" strokeWidth="1.5" strokeLinecap="round" />
        ))}

        {/* event dots */}
        {visibleEvents.map((ev) => {
          const cx = hasPast ? xOf(ev.dayIndex) : xOf(ev.dayIndex)
          const val = hasPast ? valueAt(ev.dayIndex) : series[ev.dayIndex] ?? series[0]
          return (
            <circle
              key={`${ev.entryId}-${ev.date}`}
              cx={cx}
              cy={yOf(val)}
              r="2.4"
              fill="var(--cf-surface)"
              stroke={ev.kind === 'IN' ? 'var(--cf-in)' : 'var(--cf-out)'}
              strokeWidth="1.4"
            />
          )
        })}

        {/* reconcile seam markers */}
        {marks.map((m) => {
          const x = xOf(m.dayIndex)
          const yB = yOf(m.before)
          const yA = yOf(m.after)
          return (
            <g key={m.snapshotId}>
              {/* dashed vertical jump: from projected to asserted */}
              <line x1={x} y1={yB} x2={x} y2={yA} stroke="var(--cf-accent)" strokeWidth="1.6" strokeDasharray="3 3" />
              {/* hollow circle at the projected (before) point */}
              <circle cx={x} cy={yB} r="2.4" fill="var(--cf-surface)" stroke="var(--cf-line-2)" strokeWidth="1.3" />
              {/* hollow diamond at the asserted (after) point */}
              <rect
                x={x - 4.6} y={yA - 4.6} width="9.2" height="9.2"
                transform={`rotate(45 ${x} ${yA})`}
                fill="var(--cf-surface)" stroke="var(--cf-accent)" strokeWidth="1.8"
              />
            </g>
          )
        })}

        {/* NOW marker */}
        {nowInWindow && (
          <>
            <line x1={nowX} y1={PAD_T - 2} x2={nowX} y2={PAD_T + INNER_H + 4} stroke="var(--cf-ink-3)" strokeDasharray="3 3" />
            <text x={nowX + 6} y={PAD_T + 10} fontFamily="var(--cf-font-mono)" fontSize="10" fontWeight="500" fill="var(--cf-ink-2)" letterSpacing="0.09em">
              NOW
            </text>
          </>
        )}

        {/* month ticks */}
        {monthTicks.map((t) => (
          <text key={t.day} x={xOf(t.day)} y={PAD_T + INNER_H + 18} textAnchor="middle" fontFamily="var(--cf-font-mono)" fontSize="10" fill="var(--cf-ink-3)">
            {t.label}
          </text>
        ))}

        {/* scrub marker */}
        {hasScrub && (
          <>
            <line x1={scrubX} y1={PAD_T - 8} x2={scrubX} y2={PAD_T + INNER_H + 18} stroke="var(--cf-accent)" strokeWidth="1.6" />
            <circle cx={scrubX} cy={scrubY} r="8" fill="var(--cf-surface)" stroke="var(--cf-accent)" strokeWidth="2.2" />
            <circle cx={scrubX} cy={scrubY} r="3" fill="var(--cf-accent)" />
            <rect x={scrubX - 5} y={PAD_T + INNER_H + 12} width="10" height="10" transform={`rotate(45 ${scrubX} ${PAD_T + INNER_H + 17})`} fill="var(--cf-accent)" />
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

// Projection chart with paged windows, driven by native CSS scroll-snap.
//
// The viewport is a horizontal scroll container with `scroll-snap-type: x
// mandatory`; each window is a 100%-wide snap target. The browser's own
// compositor-driven scroll provides momentum, velocity-fling, and snap — no
// gesture math, no library. We render at most three windows (prev / current /
// next) and, after the scroll settles on a neighbor, commit the page change
// and recenter scrollLeft on the new current window in the next frame (an
// atomic swap, so there's no visible jump).
//
// Tap-to-scrub falls out for free: the browser suppresses `click` after a
// scroll-drag, so a plain onClick on the current window is an unambiguous tap.

import { useRef, useState } from 'react'
import ChartLine, {
  CHART_GEOMETRY,
  clientXToDay,
  seriesYBounds,
  YAxisGridlines,
  YAxisLabels,
} from './ChartLine'
import type { ProjectionEvent } from '#/lib/projection'

const GUTTER_PX = CHART_GEOMETRY.PAD_L_DEFAULT
// Debounce window for treating scrolling as "settled" (fallback for browsers
// without the `scrollend` event; also smooths rapid scroll bursts).
const SCROLL_SETTLE_MS = 120

export type ChartWindow = {
  series: number[]
  events: ProjectionEvent[]
  dayOffset: number
}

type Props = {
  asOf: string
  current: ChartWindow
  prev?: ChartWindow // undefined at page 0
  next?: ChartWindow // undefined at maxPage
  scrubOffset: number
  onScrubChange: (offset: number) => void
  onPageChange: (delta: 1 | -1) => void
  // Shared with the parent so the header's arrow controls can drive the same
  // scroll container (they scrollBy one window; the settle handler commits).
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export default function ChartStrip({
  asOf,
  current,
  prev,
  next,
  scrubOffset,
  onScrubChange,
  onPageChange,
  scrollRef,
}: Props) {
  const [tooltipActive, setTooltipActive] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build the visible window list + the index of the current window within it.
  const slides: { key: string; window: ChartWindow; isCurrent: boolean }[] = []
  if (prev) slides.push({ key: 'prev', window: prev, isCurrent: false })
  const currentIdx = slides.length
  slides.push({ key: 'current', window: current, isCurrent: true })
  if (next) slides.push({ key: 'next', window: next, isCurrent: false })

  // Keep current index reachable from ResizeObserver / rAF closures without
  // re-creating them every render.
  const currentIdxRef = useRef(currentIdx)
  currentIdxRef.current = currentIdx

  // Shared y-scale across the visible windows so the line is continuous.
  const allSeries = slides.map((s) => s.window.series)
  const sharedYMin = Math.min(...allSeries.map((s) => seriesYBounds(s).yMin))
  const sharedYMax = Math.max(...allSeries.map((s) => seriesYBounds(s).yMax))

  function viewportRef(el: HTMLDivElement | null) {
    if (!el) return
    scrollRef.current = el
    const w = el.clientWidth
    setContainerWidth(w)
    // Position the current window on mount (instant — scroll-behavior is auto).
    el.scrollLeft = currentIdxRef.current * w
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth
      setContainerWidth(nw)
      el.scrollLeft = currentIdxRef.current * nw
    })
    ro.observe(el)
    return () => ro.disconnect()
  }

  function settle() {
    const el = scrollRef.current
    if (!el || containerWidth === 0) return
    const landed = Math.round(el.scrollLeft / containerWidth)
    const delta = landed - currentIdx
    if (delta === 0) return
    onPageChange(delta > 0 ? 1 : -1)
    // After the page commit re-renders the windows, recenter on the new
    // current window in the next frame so there's no visual hop.
    requestAnimationFrame(() => {
      const e2 = scrollRef.current
      if (e2) e2.scrollLeft = currentIdxRef.current * containerWidth
    })
  }

  function onScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(settle, SCROLL_SETTLE_MS)
  }

  function onScrollEnd() {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settle()
  }

  function onCurrentClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    // Inner charts render with padL=padR=0 so they tile seamlessly — match.
    const day = clientXToDay(e.clientX, rect, current.series.length, 0, 0)
    if (day !== scrubOffset) onScrubChange(day)
  }

  return (
    <div className="flex w-full items-stretch">
      <YAxisLabels yMin={sharedYMin} yMax={sharedYMax} width={GUTTER_PX} />

      <div className="relative flex-1">
        <YAxisGridlines yMin={sharedYMin} yMax={sharedYMax} />

        <div
          ref={viewportRef}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          onScroll={onScroll}
          onScrollEnd={onScrollEnd}
          onPointerEnter={() => setTooltipActive(true)}
          onPointerLeave={() => setTooltipActive(false)}
        >
          {slides.map((slide) => (
            <div
              key={slide.key}
              className="w-full shrink-0 snap-center"
              data-current-chart={slide.isCurrent || undefined}
              onClick={slide.isCurrent ? onCurrentClick : undefined}
            >
              <ChartLine
                series={slide.window.series}
                events={slide.window.events}
                asOf={asOf}
                dayOffset={slide.window.dayOffset}
                scrubOffset={slide.isCurrent ? scrubOffset : undefined}
                yMin={sharedYMin}
                yMax={sharedYMax}
                tooltipActive={slide.isCurrent && tooltipActive}
                showYAxis={false}
                padL={0}
                padR={0}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

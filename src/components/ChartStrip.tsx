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

import { useLayoutEffect, useRef, useState } from 'react'
import ChartLine, {
  CHART_GEOMETRY,
  clientXToDay,
  seriesYBounds,
  YAxisGridlines,
  YAxisLabels,
} from './ChartLine'
import type { ProjectionEvent, ReconcileMark } from '#/lib/projection'

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
  prev?: ChartWindow
  next?: ChartWindow
  scrubOffset: number
  onScrubChange: (offset: number) => void
  onPageChange: (delta: 1 | -1) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  // Past window + seam marks, shown only on page 0.
  pastSeries?: number[]
  marks?: ReconcileMark[]
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
  pastSeries,
  marks,
}: Props) {
  const [tooltipActive, setTooltipActive] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while a scroll/scroll-snap gesture is in flight. Hover-scrub is
  // suppressed during this window — otherwise a trackpad/touch swipe (cursor
  // stationary, chart translating underneath) fires pointermove against a
  // moving slide and the scrub flickers wildly.
  const scrollingRef = useRef(false)
  // True while we programmatically recenter scrollLeft after a page commit.
  // The resulting scroll event must NOT re-enter the settle path, or the
  // correction loops against itself.
  const correctingRef = useRef(false)

  // Build the visible window list + the index of the current window within it.
  const slides: { key: string; window: ChartWindow; isCurrent: boolean }[] = []
  if (prev) {
    slides.push({ key: 'prev', window: prev, isCurrent: false })
  }
  const currentIdx = slides.length
  slides.push({ key: 'current', window: current, isCurrent: true })
  if (next) {
    slides.push({ key: 'next', window: next, isCurrent: false })
  }

  // Target y-scale across the visible windows so the line is continuous.
  const allSeries = slides.map((s) => s.window.series)
  const targetYMin = Math.min(...allSeries.map((s) => seriesYBounds(s).yMin))
  const targetYMax = Math.max(...allSeries.map((s) => seriesYBounds(s).yMax))

  // Animated y-bounds. When the target scale changes on a page commit, tween
  // toward it so the vertical remap eases instead of snapping. Initialized to
  // the first target (no animation on mount).
  const [yBounds, setYBounds] = useState({ min: targetYMin, max: targetYMax })
  const yBoundsRef = useRef(yBounds)
  yBoundsRef.current = yBounds

  // rAF tween: a justified animation effect (driving requestAnimationFrame is
  // an imperative loop with no event-handler equivalent). Re-targets whenever
  // the computed bounds change.
  useLayoutEffect(() => {
    const from = yBoundsRef.current
    if (from.min === targetYMin && from.max === targetYMax) {
      return
    }
    const start = performance.now()
    const duration = 280
    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = easeOutCubic(t)
      setYBounds({
        min: from.min + (targetYMin - from.min) * e,
        max: from.max + (targetYMax - from.max) * e,
      })
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetYMin, targetYMax])

  const sharedYMin = yBounds.min
  const sharedYMax = yBounds.max

  function viewportRef(el: HTMLDivElement | null) {
    if (!el) {
      return
    }
    scrollRef.current = el
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }

  // Keep scrollLeft centered on the current window. Runs AFTER React commits
  // the new windows (post page change) and before paint, so there's no race
  // with the async state update and no flicker. Keyed on the current window's
  // dayOffset (changes on every page commit) + width (resize). useLayoutEffect
  // is the right tool here: synchronizing an imperative DOM scroll position to
  // committed React state — the documented exception to "no effects".
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || containerWidth === 0) {
      return
    }
    const target = currentIdx * containerWidth
    if (Math.abs(el.scrollLeft - target) < 1) {
      return
    }
    correctingRef.current = true
    el.scrollLeft = target
    requestAnimationFrame(() => {
      correctingRef.current = false
    })
  }, [current.dayOffset, containerWidth, currentIdx])

  function settle() {
    scrollingRef.current = false
    const el = scrollRef.current
    if (!el || containerWidth === 0) {
      return
    }
    const landed = Math.round(el.scrollLeft / containerWidth)
    const delta = landed - currentIdx
    if (delta === 0) {
      return
    }
    // Commit the page change; the layout effect recenters scrollLeft on the
    // new current window after the re-render commits.
    onPageChange(delta > 0 ? 1 : -1)
  }

  function onScroll() {
    // Ignore the scroll events our own recenter produces.
    if (correctingRef.current) {
      return
    }
    scrollingRef.current = true
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
    }
    settleTimer.current = setTimeout(settle, SCROLL_SETTLE_MS)
  }

  function onScrollEnd() {
    if (correctingRef.current) {
      return
    }
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
    }
    settle()
    scrollingRef.current = false
  }

  function scrubToClientX(clientX: number, rect: DOMRect) {
    // Inner charts render with padL=padR=0 so they tile seamlessly — match.
    const day = clientXToDay(clientX, rect, current.series.length, 0, 0)
    if (day !== scrubOffset) {
      onScrubChange(day)
    }
  }

  function onCurrentClick(e: React.MouseEvent<HTMLDivElement>) {
    scrubToClientX(e.clientX, e.currentTarget.getBoundingClientRect())
  }

  function onCurrentPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Live-scrub on mouse hover only: pointer over the chart with no button
    // pressed. Touch/pen drags (buttons !== 0) are scroll-snap paging and
    // must not move the scrub; touch users scrub via tap (onClick).
    if (e.pointerType !== 'mouse' || e.buttons !== 0 || scrollingRef.current) {
      return
    }
    scrubToClientX(e.clientX, e.currentTarget.getBoundingClientRect())
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
              onPointerMove={slide.isCurrent ? onCurrentPointerMove : undefined}
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
                pastSeries={slide.isCurrent && slide.window.dayOffset === 0 ? pastSeries : undefined}
                marks={slide.isCurrent && slide.window.dayOffset === 0 ? marks : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

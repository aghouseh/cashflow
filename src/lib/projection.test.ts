import { describe, expect, it } from 'vitest'
import { project } from './projection'
import type { Entry } from './db/schema'

const anchor = { balance: 1000, asOf: '2026-01-01' }

const baseEntry = (overrides: Partial<Entry>): Entry => ({
  id: 'e1',
  kind: 'IN',
  name: 'test',
  amount: 100,
  currency: 'USD',
  startDate: '2026-01-01',
  endDate: null,
  rrule: null,
  paused: false,
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
  ...overrides,
})

describe('project', () => {
  it('empty entries → series is flat anchor balance', () => {
    const { events, series } = project(anchor, [], 7)
    expect(events).toEqual([])
    expect(series).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000])
  })

  it('horizonDays=0 → series length 1, no events', () => {
    const { events, series } = project(anchor, [baseEntry({ startDate: '2026-01-02' })], 0)
    expect(events).toEqual([])
    expect(series).toEqual([1000])
  })

  it('one-time IN entry inside window', () => {
    const e = baseEntry({ startDate: '2026-01-03', amount: 50, kind: 'IN' })
    const { events, series } = project(anchor, [e], 7)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ dayIndex: 2, amount: 50, kind: 'IN' })
    expect(series).toEqual([1000, 1000, 1050, 1050, 1050, 1050, 1050, 1050])
  })

  it('one-time OUT entry — amount stored positive, sign applied', () => {
    const e = baseEntry({ startDate: '2026-01-02', amount: 30, kind: 'OUT' })
    const { events, series } = project(anchor, [e], 3)
    expect(events[0]).toMatchObject({ amount: -30, kind: 'OUT' })
    expect(series).toEqual([1000, 970, 970, 970])
  })

  it('asOf-day events excluded (anchor includes today)', () => {
    const e = baseEntry({ startDate: '2026-01-01', amount: 999 })
    const { events, series } = project(anchor, [e], 3)
    expect(events).toEqual([])
    expect(series).toEqual([1000, 1000, 1000, 1000])
  })

  it('paused entries skip', () => {
    const e = baseEntry({ startDate: '2026-01-02', paused: true })
    const { events } = project(anchor, [e], 7)
    expect(events).toEqual([])
  })

  it('weekly recurrence', () => {
    const e = baseEntry({
      id: 'sal',
      startDate: '2026-01-02',
      amount: 100,
      rrule: 'FREQ=WEEKLY',
    })
    const { events, series } = project(anchor, [e], 21)
    // expected: 01-02, 01-09, 01-16 — three within 21 days
    expect(events.map((x) => x.date)).toEqual(['2026-01-02', '2026-01-09', '2026-01-16'])
    expect(series[1]).toBe(1100)
    expect(series[7]).toBe(1100)
    expect(series[8]).toBe(1200)
    expect(series[21]).toBe(1300)
  })

  it('bi-weekly recurrence', () => {
    const e = baseEntry({
      startDate: '2026-01-02',
      amount: 200,
      rrule: 'FREQ=WEEKLY;INTERVAL=2',
    })
    const { events } = project(anchor, [e], 30)
    expect(events.map((x) => x.date)).toEqual(['2026-01-02', '2026-01-16', '2026-01-30'])
  })

  it('1st & 15th recurrence', () => {
    const e = baseEntry({
      startDate: '2026-01-01',
      amount: 50,
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15',
    })
    const { events } = project(anchor, [e], 90)
    expect(events.map((x) => x.date)).toEqual([
      '2026-01-15',
      '2026-02-01',
      '2026-02-15',
      '2026-03-01',
      '2026-03-15',
      '2026-04-01',
    ])
  })

  it('monthly recurrence', () => {
    const e = baseEntry({
      startDate: '2026-01-15',
      amount: 1000,
      rrule: 'FREQ=MONTHLY',
    })
    const { events } = project(anchor, [e], 120)
    expect(events.map((x) => x.date)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ])
  })

  it('endDate clips occurrences', () => {
    const e = baseEntry({
      startDate: '2026-01-02',
      endDate: '2026-01-10',
      amount: 10,
      rrule: 'FREQ=WEEKLY',
    })
    const { events } = project(anchor, [e], 30)
    expect(events.map((x) => x.date)).toEqual(['2026-01-02', '2026-01-09'])
  })

  it('mixed IN/OUT same day — IN sorted first', () => {
    const inE = baseEntry({ id: 'a-in', kind: 'IN', startDate: '2026-01-03', amount: 100 })
    const outE = baseEntry({ id: 'b-out', kind: 'OUT', startDate: '2026-01-03', amount: 40 })
    const { events, series } = project(anchor, [outE, inE], 5)
    expect(events.map((x) => x.kind)).toEqual(['IN', 'OUT'])
    expect(series[2]).toBe(1060) // 1000 + 100 - 40
  })

  it('series accumulates across multiple recurring entries', () => {
    const salary = baseEntry({
      id: 'sal',
      kind: 'IN',
      startDate: '2026-01-02',
      amount: 500,
      rrule: 'FREQ=WEEKLY',
    })
    const rent = baseEntry({
      id: 'rent',
      kind: 'OUT',
      startDate: '2026-01-05',
      amount: 200,
      rrule: 'FREQ=MONTHLY',
    })
    const { series } = project(anchor, [salary, rent], 14)
    // day 1 (01-02): +500 → 1500
    // day 4 (01-05): -200 → 1300
    // day 8 (01-09): +500 → 1800
    expect(series[1]).toBe(1500)
    expect(series[4]).toBe(1300)
    expect(series[8]).toBe(1800)
    expect(series[14]).toBe(1800)
  })

  it('throws on negative horizon', () => {
    expect(() => project(anchor, [], -1)).toThrow()
  })
})

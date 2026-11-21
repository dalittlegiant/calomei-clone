// Log-day helpers — the original app lets the user set when a day starts
// （一日開始時間， default 00:00). All "today" math (week strip, streaks,
// daily totals, chart grouping) goes through these, never raw calendar days.

import { getSetting, setSetting } from './db'

export const DEFAULT_DAY_START = '00:00'

export async function getDayStart(): Promise<string> {
  return getSetting<string>('dayStart', DEFAULT_DAY_START)
}

export async function setDayStart(value: string): Promise<void> {
  await setSetting('dayStart', value)
}

export function dayStartMinutes(dayStart: string): number {
  const [h, m] = dayStart.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Start (epoch ms) of the log-day containing `ms`. */
export function logDayStartMs(ms: number, startMin: number): number {
  const d = new Date(ms)
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0,
  ).getTime()
  const withStart = midnight + startMin * 60_000
  return ms >= withStart ? withStart : withStart - 86_400_000
}

/** 'YYYY-MM-DD' log-day key for an epoch ms. */
export function logDayKey(ms: number, startMin: number): string {
  const s = new Date(logDayStartMs(ms, startMin))
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
}

/** Start of the current log day. */
export function todayLogStartMs(startMin: number): number {
  return logDayStartMs(Date.now(), startMin)
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

/** The last 7 log days, oldest first. */
export function last7LogDays(startMin: number): Array<{
  key: string
  date: Date
  weekday: string
}> {
  const todayStart = todayLogStartMs(startMin)
  const days = []
  for (let i = 6; i >= 0; i--) {
    const ms = todayStart - i * 86_400_000
    const d = new Date(ms)
    days.push({
      key: logDayKey(ms, startMin),
      date: d,
      weekday: WEEKDAY_NAMES[d.getDay()],
    })
  }
  return days
}

export interface StreakStats {
  /** Consecutive log days ending today (or yesterday if today is empty). */
  current: number
  longest: number
  /** Total distinct log days with at least one entry. */
  logDays: number
  totalEntries: number
}

function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Streaks from food-entry dates. Log-day keys make consecutive days
 * comparable regardless of the day-start setting. */
export function computeStreaks(
  entries: Array<{ date: number }>,
  startMin: number,
): StreakStats {
  const keys = new Set(entries.map((e) => logDayKey(e.date, startMin)))
  if (keys.size === 0) {
    return { current: 0, longest: 0, logDays: 0, totalEntries: 0 }
  }
  const todayKey = logDayKey(Date.now(), startMin)
  let cursor = keys.has(todayKey)
    ? todayKey
    : addDaysToKey(todayKey, -1)
  let current = 0
  while (keys.has(cursor)) {
    current++
    cursor = addDaysToKey(cursor, -1)
  }
  const sorted = [...keys].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const k of sorted) {
    run = prev !== null && addDaysToKey(prev, 1) === k ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }
  return {
    current,
    longest,
    logDays: keys.size,
    totalEntries: entries.length,
  }
}

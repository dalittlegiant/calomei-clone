// Home — 今日總覽，照原 app（iOS v2.0.1，Duo 打開佈局）
// - Week strip：sticky 喺頂，唔會碌走
// - Scorecard：橫向滑動 carousel，得兩頁
//   第 1 頁：卡路里卡（仲剩 + BMR/TDEE + 火焰圈）+ 三大營養素
//   第 2 頁：飲水卡（樽制）+ 糖 / 纖維 / 鈉
// - 下面兩粒大掣 + 案底 feed 都係 static，唔跟 carousel 碌走

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type UserProfile } from '../lib/db'
import {
  activityFactor,
  BOTTLE_ML,
  effectiveTarget,
  mifflinBmr,
  WATER_TARGET_ML,
} from '../lib/nutrition'
import {
  dayStartMinutes,
  getDayStart,
  last7LogDays,
  logDayKey,
  todayLogStartMs,
} from '../lib/day'
import { MEAL_LABELS, type MealType } from '../lib/image'

interface Props {
  profile: UserProfile
  onOpen: (entryId: string) => void
  /** Open the add sheet （又食嘢？揀個方法認罪）. */
  onAdd: () => void
  /** Open the add sheet straight at the exercise form. */
  onAddExercise: () => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export default function HomePage({
  profile,
  onOpen,
  onAdd,
  onAddExercise,
}: Props) {
  const [dayStart, setDayStart] = useState('00:00')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [activePage, setActivePage] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getDayStart().then(setDayStart)
  }, [])

  const startMin = dayStartMinutes(dayStart)
  const entries = useLiveQuery(
    () => db.food_entries.orderBy('date').reverse().toArray(),
    [],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const target = effectiveTarget(profile, override ?? null)
  const bmr = Math.round(mifflinBmr(profile))
  const tdee = Math.round(mifflinBmr(profile) * activityFactor(profile.activityLevel))

  const todayStart = todayLogStartMs(startMin)
  const todayFood = useMemo(
    () => (entries ?? []).filter((e) => e.date >= todayStart),
    [entries, todayStart],
  )
  const totals = useMemo(() => {
    const t = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    }
    for (const e of todayFood) {
      t.calories += e.calories
      t.proteinG += e.proteinG
      t.carbsG += e.carbsG
      t.fatG += e.fatG
      t.sugarG += e.sugarG ?? 0
      t.fiberG += e.fiberG ?? 0
      t.sodiumMg += e.sodiumMg ?? 0
    }
    return t
  }, [todayFood])

  const waterToday = useLiveQuery(
    () => db.water_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [todayStart],
  )
  const waterTotal = (waterToday ?? []).reduce((a, w) => a + w.amountML, 0)

  const exerciseToday = useLiveQuery(
    () => db.exercise_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [todayStart],
  )
  const exerciseKcal = (exerciseToday ?? []).reduce(
    (a, e) => a + e.caloriesBurned,
    0,
  )

  const remaining = target.calories - totals.calories + exerciseKcal
  const weekDays = last7LogDays(startMin)
  const todayKey = logDayKey(Date.now(), startMin)
  const dayKeysWithEntries = useMemo(
    () => new Set((entries ?? []).map((e) => logDayKey(e.date, startMin))),
    [entries, startMin],
  )

  const feedGroups = useMemo(() => {
    const list = (entries ?? []).filter(
      (e) => !selectedDay || logDayKey(e.date, startMin) === selectedDay,
    )
    const map = new Map<string, typeof list>()
    for (const e of list) {
      const key = logDayKey(e.date, startMin)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [entries, selectedDay, startMin])

  function dayLabel(key: string): string {
    if (key === todayKey) return '今日'
    const yesterday = logDayKey(Date.now() - 86_400_000, startMin)
    if (key === yesterday) return '尋日'
    const d = new Date(`${key}T00:00:00`)
    return d.toLocaleDateString('zh-HK', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
  }

  function onCarouselScroll() {
    const el = carouselRef.current
    if (!el) return
    setActivePage(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goToPage(page: number) {
    const el = carouselRef.current
    if (!el) return
    el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' })
  }

  async function addBottle() {
    const now = Date.now()
    await db.water_entries.add({
      id: crypto.randomUUID(),
      amountML: BOTTLE_ML,
      date: now,
      createdAt: now,
    })
  }

  const bottles = Math.floor(waterTotal / BOTTLE_ML)
  const targetBottles = Math.round(WATER_TARGET_ML / BOTTLE_ML)
  const ringFrac = Math.max(0, Math.min(1, remaining / target.calories))
  const ringC = 2 * Math.PI * 30

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8 md:max-w-2xl">
      {/* Week strip — static, sticks under the header. */}
      <div className="sticky top-14 z-10 -mx-4 bg-[#FFF8F0] px-4 pb-2 pt-3 dark:bg-[#12100e]">
        <div className="flex items-center justify-between rounded-2xl bg-white px-2 py-2 shadow-sm dark:bg-stone-900">
          {weekDays.map((d) => {
            const isToday = d.key === todayKey
            const isSelected = selectedDay === d.key
            const hasEntries = dayKeysWithEntries.has(d.key)
            return (
              <button
                key={d.key}
                type="button"
                onClick={() =>
                  setSelectedDay(isSelected ? null : d.key)
                }
                className={`flex min-w-0 flex-1 flex-col items-center rounded-xl py-1 ${
                  isToday
                    ? 'bg-amber-500 text-white'
                    : isSelected
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                      : 'text-stone-600 dark:text-stone-300'
                }`}
              >
                <span className="text-xs">{d.weekday}</span>
                <span className="text-base font-bold leading-tight">
                  {d.date.getDate()}
                </span>
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    hasEntries
                      ? isToday
                        ? 'bg-white'
                        : 'bg-amber-500'
                      : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Scorecard carousel — exactly 2 pages. */}
      <div
        ref={carouselRef}
        onScroll={onCarouselScroll}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto px-4"
      >
        {/* Page 1: calories + macros. */}
        <section className="w-full shrink-0 snap-center px-0.5">
          <div className="mt-2 rounded-3xl bg-white p-4 shadow-sm dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  活動量 ·{' '}
                  {profile.activityLevel === '久坐'
                    ? '坐定定'
                    : profile.activityLevel}
                </p>
                <p className="mt-1 text-3xl font-bold">
                  {remaining >= 0 ? (
                    <>
                      {remaining}{' '}
                      <span className="text-lg font-normal text-stone-500 dark:text-stone-400">
                        仲剩
                      </span>
                    </>
                  ) : (
                    <>
                      {-remaining}{' '}
                      <span className="text-lg font-normal text-red-500">
                        超咗
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                  {totals.calories} / {target.calories} kcal
                  {exerciseKcal > 0 && ` · 運動燒咗 ${exerciseKcal} kcal`}
                </p>
                <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
                  BMR {bmr} kcal · TDEE {tdee} kcal
                </p>
              </div>
              {/* Flame ring: remaining proportion. */}
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    strokeWidth="6"
                    className="stroke-stone-200 dark:stroke-stone-700"
                  />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringC * (1 - ringFrac)}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xl">
                  🔥
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { label: '蛋白質', value: totals.proteinG, goal: target.proteinG, unit: 'g' },
              { label: '碳水', value: totals.carbsG, goal: target.carbsG, unit: 'g' },
              { label: '脂肪', value: totals.fatG, goal: target.fatG, unit: 'g' },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-stone-900"
              >
                <p className="text-xs text-stone-500 dark:text-stone-400">{m.label}</p>
                <p className="mt-0.5 font-bold">
                  {round1(m.value)}
                  <span className="text-xs font-normal text-stone-400 dark:text-stone-500">
                    /{m.goal}
                    {m.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Page 2: water + sugar / fiber / sodium. */}
        <section className="w-full shrink-0 snap-center px-0.5">
          <div className="mt-2 rounded-3xl bg-white p-4 shadow-sm dark:bg-stone-900">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold">💧 飲水</h3>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                目標 {targetBottles} 樽 · {WATER_TARGET_ML.toLocaleString()} ml
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div className="flex items-end gap-1.5">
                {Array.from({ length: targetBottles }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-10 w-5 items-end justify-center overflow-hidden rounded-b-md rounded-t-sm border-2 ${
                      i < bottles
                        ? 'border-sky-500 bg-sky-400'
                        : 'border-stone-300 bg-transparent dark:border-stone-600'
                    }`}
                    aria-label={i < bottles ? '已飲一樽' : '未飲'}
                  >
                    {i < bottles && (
                      <span className="block h-full w-full bg-sky-300/60" />
                    )}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={addBottle}
                className="rounded-2xl bg-sky-500 px-4 py-2.5 font-bold text-white active:bg-sky-600"
              >
                +1 樽
              </button>
            </div>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              {bottles} / {targetBottles} 樽 · {waterTotal.toLocaleString()} /{' '}
              {WATER_TARGET_ML.toLocaleString()} ml
              {waterTotal === 0
                ? ' · 仲差 2,000 · 仙人掌？'
                : ` · 仲差 ${Math.max(0, WATER_TARGET_ML - waterTotal).toLocaleString()} ml`}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { label: '糖', value: round1(totals.sugarG), goal: target.sugarCeilingG, unit: 'g', ceiling: true },
              { label: '纖維', value: round1(totals.fiberG), goal: target.fiberFloorG, unit: 'g', ceiling: false },
              { label: '鈉', value: Math.round(totals.sodiumMg), goal: target.sodiumCeilingMg, unit: 'mg', ceiling: true },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-stone-900"
              >
                <p className="text-xs text-stone-500 dark:text-stone-400">{m.label}</p>
                <p className="mt-0.5 font-bold">
                  {m.value}
                  <span className="text-xs font-normal text-stone-400 dark:text-stone-500">
                    /{m.goal}
                    {m.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Dots — 2 pages. */}
      <div className="mt-2 flex justify-center gap-1.5">
        {[0, 1].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => goToPage(p)}
            aria-label={`第 ${p + 1} 頁`}
            className={`h-2 rounded-full transition-all ${
              activePage === p ? 'w-5 bg-amber-500' : 'w-2 bg-stone-300 dark:bg-stone-600'
            }`}
          />
        ))}
      </div>

      {/* Two big buttons — static, below the carousel. */}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 rounded-2xl bg-amber-500 py-3.5 text-lg font-bold text-white shadow-sm active:bg-amber-600"
        >
          📷 又食嘢？加啦
        </button>
        <button
          type="button"
          onClick={onAddExercise}
          className="flex-1 rounded-2xl bg-teal-500 py-3.5 text-lg font-bold text-white shadow-sm active:bg-teal-600"
        >
          🏃 做咗運動？
        </button>
      </div>

      {/* 案底 feed — static, below the buttons. */}
      <h2 className="mt-6 text-lg font-bold">
        📜 案底{selectedDay ? ` · ${dayLabel(selectedDay)}` : ''}
        {selectedDay && (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400"
          >
            睇返全部
          </button>
        )}
      </h2>

      {feedGroups.length === 0 && (
        <p className="mt-4 rounded-3xl bg-white p-6 text-center text-stone-400 shadow-sm dark:bg-stone-900 dark:text-stone-500">
          仲未有案底 — 撳「又食嘢？加啦」認第一餐啦 🍽️
        </p>
      )}

      {feedGroups.map(([key, list]) => (
        <div key={key} className="mt-4">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="font-bold">{dayLabel(key)}</h3>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              {list.reduce((a, e) => a + e.calories, 0)} kcal
            </span>
          </div>
          <div className="mt-2 space-y-3">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpen(e.id)}
                className="block w-full overflow-hidden rounded-3xl bg-white text-left shadow-sm active:bg-amber-50 dark:bg-stone-900 dark:active:bg-stone-800"
              >
                {e.roastComment && (
                  <p className="bg-amber-100 px-4 py-2 text-sm leading-relaxed dark:bg-amber-900/60">
                    {e.roastEmoji ?? '😊'} {e.roastComment}
                  </p>
                )}
                <span className="flex items-center gap-3 p-3">
                  {e.imageDataUrl ? (
                    <img
                      src={e.imageDataUrl}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-3xl dark:bg-amber-900">
                      🍽️
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.name}</span>
                    <span className="block text-sm text-stone-500 dark:text-stone-400">
                      {MEAL_LABELS[e.mealType as MealType] ?? e.mealType} ·{' '}
                      {new Date(e.date).toLocaleTimeString('zh-HK', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {e.scanStatus === 'scanning' ? ' · 分析緊…' : ''}
                    </span>
                    <span className="mt-0.5 block text-sm text-stone-500 dark:text-stone-400">
                      蛋白質 {round1(e.proteinG)}g · 碳水 {round1(e.carbsG)}g ·
                      脂肪 {round1(e.fatG)}g
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold">🔥 {e.calories}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-500">kcal</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

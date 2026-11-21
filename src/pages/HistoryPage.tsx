import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getHealthShortcutName, type UserProfile } from '../lib/db'
import { MEAL_LABELS, type MealType } from '../lib/image'
import { isoDate, openHealthShortcut } from '../lib/health'
import {
  BOTTLE_ML,
  effectiveTarget,
  WATER_TARGET_ML,
} from '../lib/nutrition'
import { GlassCard } from '../components/ui'
import {
  dayStartMinutes,
  getDayStart,
  logDayKey,
  todayLogStartMs,
} from '../lib/day'

interface Props {
  profile: UserProfile
  onOpen: (entryId: string) => void
}

type Filter = 'all' | MealType

export default function HistoryPage({ profile, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [dayStart, setDayStart] = useState('00:00')

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

  const todayStart = todayLogStartMs(startMin)
  const todayFood = (entries ?? []).filter((e) => e.date >= todayStart)
  const todayTotals = todayFood.reduce(
    (a, e) => ({
      calories: a.calories + e.calories,
      sugarG: a.sugarG + (e.sugarG ?? 0),
      fiberG: a.fiberG + (e.fiberG ?? 0),
      sodiumMg: a.sodiumMg + (e.sodiumMg ?? 0),
    }),
    { calories: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 },
  )

  const waterToday = useLiveQuery(
    () => db.water_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [],
  )
  const waterTotal = (waterToday ?? []).reduce((a, w) => a + w.amountML, 0)
  const [customWater, setCustomWater] = useState('')
  const [waterMsg, setWaterMsg] = useState<string | null>(null)

  const exerciseToday = useLiveQuery(
    () => db.exercise_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [],
  )
  const exerciseKcal = (exerciseToday ?? []).reduce(
    (a, e) => a + e.caloriesBurned,
    0,
  )
  const [exName, setExName] = useState('')
  const [exMinutes, setExMinutes] = useState('')
  const [exKcal, setExKcal] = useState('')

  const latestWeight = useLiveQuery(
    () => db.weight_entries.orderBy('date').reverse().limit(1).toArray(),
    [],
  )
  const latestBodyFat = useLiveQuery(
    () => db.body_fat_entries.orderBy('date').reverse().limit(1).toArray(),
    [],
  )
  const [weightKg, setWeightKg] = useState('')
  const [bodyFatPct, setBodyFatPct] = useState('')
  const [logMsg, setLogMsg] = useState<string | null>(null)

  const groups = useMemo(() => {
    const list = (entries ?? []).filter(
      (e) => filter === 'all' || e.mealType === filter,
    )
    const map = new Map<string, typeof list>()
    for (const e of list) {
      const key = logDayKey(e.date, startMin)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [entries, filter, startMin])

  function dayLabel(key: string): string {
    const todayKey = logDayKey(Date.now(), startMin)
    if (key === todayKey) return '今日'
    const yesterday = logDayKey(Date.now() - 86_400_000, startMin)
    if (key === yesterday) return '尋日'
    const d = new Date(`${key}T00:00:00`)
    return d.toLocaleDateString('zh-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
  }

  function flash(setter: (m: string | null) => void, msg: string) {
    setter(msg)
    window.setTimeout(() => setter(null), 2500)
  }

  async function addWater(ml: number) {
    if (!ml || ml <= 0) return
    const now = Date.now()
    await db.water_entries.add({
      id: crypto.randomUUID(),
      amountML: Math.round(ml),
      date: now,
      createdAt: now,
    })
  }

  async function undoWater() {
    const last = (waterToday ?? []).sort((a, b) => b.createdAt - a.createdAt)[0]
    if (!last) return
    await db.water_entries.delete(last.id)
  }

  async function addCustomWater() {
    const ml = Number(customWater)
    if (!ml || ml <= 0) return
    await addWater(ml)
    setCustomWater('')
  }

  async function exportWater() {
    if (waterTotal <= 0) return
    const name = await getHealthShortcutName()
    openHealthShortcut(name, {
      type: 'water',
      date: isoDate(Date.now()),
      amount_ml: waterTotal,
    })
    flash(setWaterMsg, `今日飲水 ${waterTotal} ml 已交去捷徑「${name}」`)
  }

  async function addExercise() {
    const minutes = Number(exMinutes)
    const kcal = Number(exKcal)
    if (!exName.trim() || !minutes || minutes <= 0) return
    const now = Date.now()
    await db.exercise_entries.add({
      id: crypto.randomUUID(),
      name: exName.trim(),
      exerciseType: '手動記錄',
      durationMinutes: minutes,
      caloriesBurned: kcal > 0 ? Math.round(kcal) : 0,
      date: now,
      createdAt: now,
    })
    setExName('')
    setExMinutes('')
    setExKcal('')
  }

  async function addWeight() {
    const kg = Number(weightKg)
    const pct = bodyFatPct.trim() === '' ? null : Number(bodyFatPct)
    if (!kg || kg <= 0) return
    const now = Date.now()
    await db.weight_entries.add({
      id: crypto.randomUUID(),
      weightKG: kg,
      date: now,
      createdAt: now,
    })
    if (pct !== null && pct > 0 && pct < 100) {
      await db.body_fat_entries.add({
        id: crypto.randomUUID(),
        bodyFatPercentage: pct,
        date: now,
        createdAt: now,
      })
    }
    setWeightKg('')
    setBodyFatPct('')
    flash(setLogMsg, '體重已記錄')
  }

  async function exportWeight() {
    const w = (latestWeight ?? [])[0]
    if (!w) return
    const bf = (latestBodyFat ?? [])[0]
    const name = await getHealthShortcutName()
    openHealthShortcut(name, {
      type: 'weight',
      date: isoDate(w.date),
      weight_kg: w.weightKG,
      body_fat_percent: bf ? bf.bodyFatPercentage : null,
    })
    flash(setLogMsg, `體重 ${w.weightKG} kg 已交去捷徑「${name}」`)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8">
      <div className="mt-6 rounded-3xl glass-cta-amber p-4 text-white">
        <p className="text-sm opacity-90">今日案底</p>
        <p className="text-3xl font-bold">
          {todayTotals.calories}{' '}
          <span className="text-base">/ {target.calories} kcal</span>
        </p>
        <p className="mt-1 text-sm opacity-90">
          目標蛋白質 {target.proteinG}g · 碳水 {target.carbsG}g · 脂肪{' '}
          {target.fatG}g
        </p>
        <p className="mt-0.5 text-sm opacity-90">
          糖 {Math.round(todayTotals.sugarG * 10) / 10}g / 上限{' '}
          {target.sugarCeilingG}g · 纖維{' '}
          {Math.round(todayTotals.fiberG * 10) / 10}g / 目標{' '}
          {target.fiberFloorG}g · 鈉 {Math.round(todayTotals.sodiumMg)}mg /
          上限 {target.sodiumCeilingMg}mg
        </p>
      </div>

      <GlassCard className="mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold">💧 今日飲水</h3>
          <span className="text-sm text-white/50">
            <b className="text-lg text-white">
              {Math.floor(waterTotal / BOTTLE_ML)} /{' '}
              {Math.round(WATER_TARGET_ML / BOTTLE_ML)} 樽
            </b>{' '}
            · {waterTotal} ml
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => addWater(BOTTLE_ML)}
            className="rounded-xl glass-cta-teal py-2 font-bold text-white"
          >
            +1 樽
          </button>
          <button
            type="button"
            onClick={() => addWater(250)}
            className="rounded-xl bg-[#14B8A6]/15 py-2 font-bold text-teal-200"
          >
            +250 ml
          </button>
          <button
            type="button"
            onClick={() => addWater(100)}
            className="rounded-xl bg-[#14B8A6]/15 py-2 font-bold text-teal-200"
          >
            +100 ml
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={customWater}
            onChange={(e) => setCustomWater(e.target.value)}
            placeholder="自訂毫升"
            className="min-w-0 flex-1 rounded-xl border border-white/15 px-3 py-2 outline-none focus:border-[#14B8A6]"
          />
          <button
            type="button"
            disabled={!Number(customWater)}
            onClick={addCustomWater}
            className="rounded-xl glass-cta-teal px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            加入
          </button>
          <button
            type="button"
            disabled={(waterToday ?? []).length === 0}
            onClick={undoWater}
            className="rounded-xl glass-subcard px-3 py-2 font-bold text-white/50 disabled:opacity-40"
          >
            撤銷
          </button>
        </div>
        <button
          type="button"
          disabled={waterTotal <= 0}
          onClick={exportWater}
          className="mt-2 w-full rounded-2xl glass-subcard py-2.5 font-bold text-red-400 ring-1 ring-red-500/40 disabled:opacity-40"
        >
          🍎 同步今日飲水去 Apple Health
        </button>
        {waterMsg && (
          <p className="mt-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-300">
            {waterMsg}
          </p>
        )}
      </GlassCard>

      <GlassCard className="mt-4 p-4">
        <h3 className="font-bold">📝 快速記錄</h3>

        <p className="mt-3 text-sm font-bold text-white/60">🏃 運動</p>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={exName}
            onChange={(e) => setExName(e.target.value)}
            placeholder="做咩運動？"
            className="min-w-0 flex-1 glass-input"
          />
          <input
            type="number"
            inputMode="decimal"
            value={exMinutes}
            onChange={(e) => setExMinutes(e.target.value)}
            placeholder="分鐘"
            className="w-20 glass-input"
          />
          <input
            type="number"
            inputMode="decimal"
            value={exKcal}
            onChange={(e) => setExKcal(e.target.value)}
            placeholder="kcal"
            className="w-20 glass-input"
          />
          <button
            type="button"
            disabled={!exName.trim() || !Number(exMinutes)}
            onClick={addExercise}
            className="shrink-0 rounded-xl glass-cta-amber px-3 py-2 font-bold text-white disabled:opacity-40"
          >
            加入
          </button>
        </div>
        {(exerciseToday ?? []).length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {(exerciseToday ?? [])
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-xl bg-[#FF9F0A]/10 px-3 py-1.5"
                >
                  <span>
                    {e.name} · {e.durationMinutes} 分鐘 · {e.caloriesBurned}{' '}
                    kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => db.exercise_entries.delete(e.id)}
                    className="px-2 text-red-400"
                    aria-label="刪除運動記錄"
                  >
                    ✕
                  </button>
                </li>
              ))}
            <li className="px-1 text-xs text-white/50">
              今日運動共燒 {exerciseKcal} kcal
            </li>
          </ul>
        )}

        <p className="mt-4 text-sm font-bold text-white/60">⚖️ 體重／體脂</p>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="體重 kg"
            className="min-w-0 flex-1 glass-input"
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={bodyFatPct}
            onChange={(e) => setBodyFatPct(e.target.value)}
            placeholder="體脂 %（可選）"
            className="min-w-0 flex-1 glass-input"
          />
          <button
            type="button"
            disabled={!Number(weightKg)}
            onClick={addWeight}
            className="shrink-0 rounded-xl glass-cta-amber px-3 py-2 font-bold text-white disabled:opacity-40"
          >
            記錄
          </button>
        </div>
        {(latestWeight ?? [])[0] && (
          <p className="mt-2 text-sm text-white/50">
            最新：
            {(latestWeight ?? [])[0].weightKG} kg
            {(latestBodyFat ?? [])[0]
              ? ` · 體脂 ${(latestBodyFat ?? [])[0].bodyFatPercentage}%`
              : ''}
            {' · '}
            {new Date((latestWeight ?? [])[0].date).toLocaleDateString(
              'zh-HK',
              { month: 'short', day: 'numeric' },
            )}
            <button
              type="button"
              onClick={exportWeight}
              className="ml-2 font-bold text-red-400"
            >
              🍎 同步去 Apple Health
            </button>
          </p>
        )}
        {logMsg && (
          <p className="mt-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-300">
            {logMsg}
          </p>
        )}
      </GlassCard>

      <div className="mt-4 flex gap-2">
        {(['all', 'breakfast', 'lunch', 'dinner'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold ${
              filter === f
                ? 'glass-cta-amber text-white'
                : 'glass-subcard text-white/60 ring-1 ring-white/15'
            }`}
          >
            {f === 'all' ? '全部' : MEAL_LABELS[f]}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="mt-8 text-center text-white/40">
          仲未有案底 — 撳「又食嘢？加啦」認第一餐啦 🍽️
        </p>
      )}

      {groups.map(([dateLabel, list]) => (
        <div key={dateLabel} className="mt-6">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="font-bold">{dayLabel(dateLabel)}</h3>
            <span className="text-sm text-white/50">
              {list.reduce((a, e) => a + e.calories, 0)} kcal
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpen(e.id)}
                className="flex w-full items-center gap-3 glass-subcard p-3 text-left"
              >
                {e.imageDataUrl ? (
                  <img
                    src={e.imageDataUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#FF9F0A]/15 text-2xl">
                    🍽️
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{e.name}</span>
                  <span className="block text-sm text-white/50">
                    {MEAL_LABELS[e.mealType as MealType] ?? e.mealType} ·{' '}
                    {new Date(e.date).toLocaleTimeString('zh-HK', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {e.scanStatus === 'scanning' ? ' · 分析緊…' : ''}
                  </span>
                </span>
                <span className="shrink-0 font-bold">{e.calories} kcal</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

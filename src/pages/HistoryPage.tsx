import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getHealthShortcutName, type UserProfile } from '../lib/db'
import { MEAL_LABELS, type MealType } from '../lib/image'
import { isoDate, openHealthShortcut } from '../lib/health'
import { effectiveTarget } from '../lib/nutrition'

interface Props {
  profile: UserProfile
  onOpen: (entryId: string) => void
}

type Filter = 'all' | MealType

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export default function HistoryPage({ profile, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const entries = useLiveQuery(
    () => db.food_entries.orderBy('date').reverse().toArray(),
    [],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const target = effectiveTarget(profile, override ?? null)

  const todayStart = startOfToday()
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
      const key = new Date(e.date).toLocaleDateString('zh-HK', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      })
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [entries, filter])

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
      <div className="mt-6 rounded-3xl bg-amber-500 p-4 text-white">
        <p className="text-sm opacity-90">今日已食</p>
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

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold">💧 今日飲水</h3>
          <span className="text-sm text-stone-500">
            <b className="text-lg text-stone-800">{waterTotal}</b> ml
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[100, 250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => addWater(ml)}
              className="rounded-xl bg-sky-100 py-2 font-bold text-sky-800 active:bg-sky-200"
            >
              +{ml} ml
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={customWater}
            onChange={(e) => setCustomWater(e.target.value)}
            placeholder="自訂毫升"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-sky-400"
          />
          <button
            type="button"
            disabled={!Number(customWater)}
            onClick={addCustomWater}
            className="rounded-xl bg-sky-500 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            加入
          </button>
          <button
            type="button"
            disabled={(waterToday ?? []).length === 0}
            onClick={undoWater}
            className="rounded-xl bg-white px-3 py-2 font-bold text-stone-500 ring-1 ring-stone-200 disabled:opacity-40"
          >
            撤銷
          </button>
        </div>
        <button
          type="button"
          disabled={waterTotal <= 0}
          onClick={exportWater}
          className="mt-2 w-full rounded-2xl bg-white py-2.5 font-bold text-red-500 ring-1 ring-red-200 disabled:opacity-40 active:bg-red-50"
        >
          🍎 同步今日飲水去 Apple Health
        </button>
        {waterMsg && (
          <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-center text-sm text-green-700">
            {waterMsg}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h3 className="font-bold">📝 快速記錄</h3>

        <p className="mt-3 text-sm font-bold text-stone-600">🏃 運動</p>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={exName}
            onChange={(e) => setExName(e.target.value)}
            placeholder="做咩運動？"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <input
            type="number"
            inputMode="decimal"
            value={exMinutes}
            onChange={(e) => setExMinutes(e.target.value)}
            placeholder="分鐘"
            className="w-20 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <input
            type="number"
            inputMode="decimal"
            value={exKcal}
            onChange={(e) => setExKcal(e.target.value)}
            placeholder="kcal"
            className="w-20 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <button
            type="button"
            disabled={!exName.trim() || !Number(exMinutes)}
            onClick={addExercise}
            className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 font-bold text-white disabled:opacity-40"
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
                  className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5"
                >
                  <span>
                    {e.name} · {e.durationMinutes} 分鐘 · {e.caloriesBurned}{' '}
                    kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => db.exercise_entries.delete(e.id)}
                    className="px-2 text-red-500"
                    aria-label="刪除運動記錄"
                  >
                    ✕
                  </button>
                </li>
              ))}
            <li className="px-1 text-xs text-stone-500">
              今日運動共燒 {exerciseKcal} kcal
            </li>
          </ul>
        )}

        <p className="mt-4 text-sm font-bold text-stone-600">⚖️ 體重／體脂</p>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="體重 kg"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={bodyFatPct}
            onChange={(e) => setBodyFatPct(e.target.value)}
            placeholder="體脂 %（可選）"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <button
            type="button"
            disabled={!Number(weightKg)}
            onClick={addWeight}
            className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 font-bold text-white disabled:opacity-40"
          >
            記錄
          </button>
        </div>
        {(latestWeight ?? [])[0] && (
          <p className="mt-2 text-sm text-stone-500">
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
              className="ml-2 font-bold text-red-500"
            >
              🍎 同步去 Apple Health
            </button>
          </p>
        )}
        {logMsg && (
          <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-center text-sm text-green-700">
            {logMsg}
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {(['all', 'breakfast', 'lunch', 'dinner'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold ${
              filter === f
                ? 'bg-amber-500 text-white'
                : 'bg-white text-stone-600 ring-1 ring-stone-200'
            }`}
          >
            {f === 'all' ? '全部' : MEAL_LABELS[f]}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="mt-8 text-center text-stone-400">
          未有記錄，去「影相」記低第一餐啦 🍽️
        </p>
      )}

      {groups.map(([dateLabel, list]) => (
        <div key={dateLabel} className="mt-6">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="font-bold">{dateLabel}</h3>
            <span className="text-sm text-stone-500">
              {list.reduce((a, e) => a + e.calories, 0)} kcal
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpen(e.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:bg-amber-50"
              >
                {e.imageDataUrl ? (
                  <img
                    src={e.imageDataUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                    🍽️
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{e.name}</span>
                  <span className="block text-sm text-stone-500">
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

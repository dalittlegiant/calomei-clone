import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type UserProfile } from '../lib/db'
import { MEAL_LABELS, type MealType } from '../lib/image'
import { dailyTarget } from '../lib/nutrition'

interface Props {
  profile: UserProfile
  onOpen: (entryId: string) => void
}

type Filter = 'all' | MealType

export default function HistoryPage({ profile, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const entries = useLiveQuery(
    () => db.food_entries.orderBy('date').reverse().toArray(),
    [],
  )
  const target = dailyTarget(profile)

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

  const todayKey = new Date().toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
  const todayTotal = (entries ?? [])
    .filter(
      (e) =>
        new Date(e.date).toLocaleDateString('zh-HK', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          weekday: 'short',
        }) === todayKey,
    )
    .reduce((a, e) => a + e.calories, 0)

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8">
      <div className="mt-6 rounded-3xl bg-amber-500 p-4 text-white">
        <p className="text-sm opacity-90">今日已食</p>
        <p className="text-3xl font-bold">
          {todayTotal} <span className="text-base">/ {target.calories} kcal</span>
        </p>
        <p className="mt-1 text-sm opacity-90">
          目標蛋白質 {target.proteinG}g · 碳水 {target.carbsG}g · 脂肪{' '}
          {target.fatG}g
        </p>
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

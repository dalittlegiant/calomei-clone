import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type FoodComponent,
  type FoodEntry,
  type VisionProviderConfig,
} from '../lib/db'
import { MEAL_LABELS } from '../lib/image'
import { correctFood } from '../lib/vision'
import { macrosForGrams, searchFoods, type LocalFoodItem } from '../lib/foodDb'

interface Props {
  entryId: string
  visionConfig: VisionProviderConfig
  onBack: () => void
  onDeleted: () => void
}

function componentsFromEntry(entry: {
  componentsJson?: string | null
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servingSize: string
}): FoodComponent[] {
  if (entry.componentsJson) {
    try {
      const parsed = JSON.parse(entry.componentsJson) as FoodComponent[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // fall through to single-item fallback
    }
  }
  return [
    {
      nameZH: entry.name,
      nameEN: '',
      portionDescription: entry.servingSize,
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      confidence: 1,
      isExcluded: false,
    },
  ]
}

export default function ResultPage({
  entryId,
  visionConfig,
  onBack,
  onDeleted,
}: Props) {
  const entry = useLiveQuery(() => db.food_entries.get(entryId), [entryId])
  const [items, setItems] = useState<FoodComponent[] | null>(null)
  const [savedTick, setSavedTick] = useState(0)
  const [correctTitles, setCorrectTitles] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [correctError, setCorrectError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LocalFoodItem[]>([])
  const [searching, setSearching] = useState(false)

  // Load components when the entry (or its saved JSON) changes.
  useEffect(() => {
    if (entry) setItems(componentsFromEntry(entry))
  }, [entry, savedTick])

  const totals = useMemo(() => {
    const kept = (items ?? []).filter((i) => !i.isExcluded)
    return {
      calories: kept.reduce((a, i) => a + Math.round(i.calories), 0),
      proteinG: round1(kept.reduce((a, i) => a + i.proteinG, 0)),
      carbsG: round1(kept.reduce((a, i) => a + i.carbsG, 0)),
      fatG: round1(kept.reduce((a, i) => a + i.fatG, 0)),
    }
  }, [items])

  if (!entry) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10 text-center text-stone-500">
        載入緊…
      </div>
    )
  }
  if (entry.scanStatus === 'scanning') {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10 text-center">
        <div className="text-5xl">⏳</div>
        <p className="mt-3 font-bold">分析緊呢餐…</p>
      </div>
    )
  }

  // Narrowed once here so closures below see a non-nullable entry.
  const loadedEntry: FoodEntry = entry

  const current = items ?? componentsFromEntry(loadedEntry)

  function updateItem(index: number, patch: Partial<FoodComponent>) {
    setItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
    })
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.filter((_, i) => i !== index)
    })
  }

  async function onSave() {
    const kept = current.filter((i) => !i.isExcluded)
    await db.food_entries.update(entryId, {
      name: kept[0]?.nameZH ?? loadedEntry.name,
      calories: totals.calories,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      servingSize: kept[0]?.portionDescription ?? '',
      componentsJson: JSON.stringify(current),
    })
    setSavedTick((t) => t + 1)
  }

  async function onCorrect() {
    const titles = correctTitles
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (titles.length === 0 || !loadedEntry.imageDataUrl) return
    setCorrecting(true)
    setCorrectError(null)
    try {
      const base64 = loadedEntry.imageDataUrl.split(',')[1] ?? ''
      const result = await correctFood(
        { image_base64: base64, food_titles: titles, region: 'hk' },
        visionConfig,
      )
      const next: FoodComponent[] = result.food_items.map((item) => ({
        nameZH: item.name_zh,
        nameEN: item.name_en,
        portionDescription: item.portion_description,
        calories: item.estimated_calories,
        proteinG: item.protein_g,
        carbsG: item.carbs_g,
        fatG: item.fat_g,
        confidence: item.confidence,
        isExcluded: false,
      }))
      setItems(next)
      await db.food_entries.update(entryId, {
        componentsJson: JSON.stringify(next),
        calories: result.total_calories,
        aiOriginalName: loadedEntry.aiOriginalName ?? loadedEntry.name,
        aiOriginalComponentsJson:
          loadedEntry.aiOriginalComponentsJson ?? loadedEntry.componentsJson ?? null,
      })
      setCorrectTitles('')
    } catch (e) {
      setCorrectError(e instanceof Error ? e.message : '糾正失敗，請再試一次。')
    } finally {
      setCorrecting(false)
    }
  }

  async function onSearch(q: string) {
    setSearchQuery(q)
    if (q.trim().length < 1) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      setSearchResults(await searchFoods(q, 12))
    } finally {
      setSearching(false)
    }
  }

  function addLocalFood(item: LocalFoodItem, grams: number) {
    const m = macrosForGrams(item, grams)
    const next: FoodComponent = {
      nameZH: item.name,
      nameEN: item.nameEN ?? '',
      portionDescription: `約${grams}克`,
      calories: m.calories,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
      confidence: 1,
      isExcluded: false,
    }
    setItems((prev) => [...(prev ?? componentsFromEntry(loadedEntry)), next])
    setSearchQuery('')
    setSearchResults([])
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await db.food_entries.delete(entryId)
    onDeleted()
  }

  const dateStr = new Date(loadedEntry.date).toLocaleDateString('zh-HK', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="mt-4 font-bold text-amber-700"
      >
        ← 返回記錄
      </button>

      {loadedEntry.imageDataUrl && (
        <img
          src={loadedEntry.imageDataUrl}
          alt="食物相片"
          className="mt-3 w-full rounded-3xl object-cover"
        />
      )}

      {loadedEntry.roastComment && (
        <div className="mt-4 rounded-3xl bg-amber-100 p-4">
          <p className="text-sm font-bold text-amber-800">
            {loadedEntry.roastEmoji ?? '💬'} {MEAL_LABELS[loadedEntry.mealType as keyof typeof MEAL_LABELS] ?? loadedEntry.mealType} · {dateStr}
          </p>
          <p className="mt-1 leading-relaxed">{loadedEntry.roastComment}</p>
        </div>
      )}

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">呢餐有咩</h2>
          <span className="text-sm text-stone-500">
            合計 <b className="text-lg text-stone-800">{totals.calories}</b> kcal
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          蛋白質 {totals.proteinG}g · 碳水 {totals.carbsG}g · 脂肪 {totals.fatG}g
        </p>

        <div className="mt-3 space-y-3">
          {current.map((item, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-3 ${
                item.isExcluded
                  ? 'border-stone-200 bg-stone-50 opacity-50'
                  : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!item.isExcluded}
                  onChange={(e) =>
                    updateItem(i, { isExcluded: !e.target.checked })
                  }
                  className="h-5 w-5 accent-amber-500"
                  aria-label="計入呢樣"
                />
                <input
                  type="text"
                  value={item.nameZH}
                  onChange={(e) => updateItem(i, { nameZH: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 font-bold outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="rounded-lg px-2 py-1 text-red-500 active:bg-red-50"
                  aria-label="刪除呢樣"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
                <label className="col-span-2">
                  <span className="text-xs text-stone-500">份量</span>
                  <input
                    type="text"
                    value={item.portionDescription}
                    onChange={(e) =>
                      updateItem(i, { portionDescription: e.target.value })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">卡路里</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.calories}
                    onChange={(e) =>
                      updateItem(i, {
                        calories: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">蛋白質 g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={item.proteinG}
                    onChange={(e) =>
                      updateItem(i, { proteinG: Number(e.target.value) || 0 })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">碳水 g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={item.carbsG}
                    onChange={(e) =>
                      updateItem(i, { carbsG: Number(e.target.value) || 0 })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">脂肪 g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={item.fatG}
                    onChange={(e) =>
                      updateItem(i, { fatG: Number(e.target.value) || 0 })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <span className="self-end text-xs text-stone-400">
                  可信度 {Math.round(item.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onSave}
          className="mt-4 w-full rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
        >
          💾 儲存呢餐
        </button>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h3 className="font-bold">AI 認錯咗？糾正佢</h3>
        <p className="mt-1 text-sm text-stone-500">
          輸入正確食物名（逗號分隔），AI 會用同一張相重新分析。
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={correctTitles}
            onChange={(e) => setCorrectTitles(e.target.value)}
            placeholder="例如：叉燒飯，凍檸茶"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
          />
          <button
            type="button"
            disabled={correcting || !correctTitles.trim()}
            onClick={onCorrect}
            className="rounded-xl bg-stone-800 px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            {correcting ? '糾正緊…' : '糾正'}
          </button>
        </div>
        {correctError && (
          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {correctError}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h3 className="font-bold">＋ 手動加食物（離線食物庫）</h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜尋食物，例如：鯖魚、米飯…"
          className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
        />
        {searching && <p className="mt-2 text-sm text-stone-400">搵緊…</p>}
        {searchResults.length > 0 && (
          <ul className="mt-2 divide-y divide-stone-100">
            {searchResults.map((food) => (
              <li
                key={food.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {food.name}{' '}
                    <span className="font-normal text-stone-400">
                      {food.nameEN ?? ''}
                    </span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {food.category} · 每100克 {food.caloriesPerHundredG} kcal
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addLocalFood(food, 100)}
                  className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800 active:bg-amber-200"
                >
                  ＋100克
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onDelete}
        className={`mt-4 w-full rounded-2xl py-3 font-bold ${
          confirmDelete
            ? 'bg-red-600 text-white'
            : 'bg-white text-red-600 ring-1 ring-red-200'
        }`}
      >
        {confirmDelete ? '再撳一次確認刪除' : '刪除呢餐'}
      </button>
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

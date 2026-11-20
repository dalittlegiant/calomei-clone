import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getHealthShortcutName,
  type FoodComponent,
  type FoodEntry,
  type VisionProviderConfig,
} from '../lib/db'
import { MEAL_LABELS } from '../lib/image'
import { isoDate, openHealthShortcut } from '../lib/health'
import { correctFood, rebutRoast } from '../lib/vision'
import { macrosForGrams, searchFoods, type LocalFoodItem } from '../lib/foodDb'

interface Props {
  entryId: string
  visionConfig: VisionProviderConfig
  /** Current tone's system prompt (for the rebuttal call). */
  tonePrompt: string
  /** Current tone's API value, e.g. 'normal'. */
  toneApiValue: string
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Old entries lack sugar/fiber/sodium — default to 0.
        return parsed.map((c) => ({
          sugarG: 0,
          fiberG: 0,
          sodiumMg: 0,
          ...c,
        }))
      }
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
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
      isExcluded: false,
    },
  ]
}

export default function ResultPage({
  entryId,
  visionConfig,
  tonePrompt,
  toneApiValue,
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
  const [rebuttal, setRebuttal] = useState('')
  const [rebutting, setRebutting] = useState(false)
  const [rebutError, setRebutError] = useState<string | null>(null)
  const [healthMsg, setHealthMsg] = useState<string | null>(null)

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
      sugarG: round1(kept.reduce((a, i) => a + (i.sugarG ?? 0), 0)),
      fiberG: round1(kept.reduce((a, i) => a + (i.fiberG ?? 0), 0)),
      sodiumMg: Math.round(kept.reduce((a, i) => a + (i.sodiumMg ?? 0), 0)),
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
      sugarG: totals.sugarG,
      fiberG: totals.fiberG,
      sodiumMg: totals.sodiumMg,
      servingSize: kept[0]?.portionDescription ?? '',
      componentsJson: JSON.stringify(current),
    })
    setSavedTick((t) => t + 1)
  }

  async function onRebut() {
    if (
      !rebuttal.trim() ||
      !loadedEntry.imageDataUrl ||
      !loadedEntry.roastComment ||
      rebutting
    )
      return
    setRebutting(true)
    setRebutError(null)
    try {
      const base64 = loadedEntry.imageDataUrl.split(',')[1] ?? ''
      const result = await rebutRoast(
        {
          image_base64: base64,
          original_roast: loadedEntry.roastComment,
          rebuttal: rebuttal.trim(),
          region: 'hk',
          tone_mode: toneApiValue,
        },
        visionConfig,
        tonePrompt,
      )
      // Keep the old roast in history (feeds previous_roasts on later scans).
      const history: string[] = (() => {
        try {
          const parsed = JSON.parse(
            loadedEntry.roastHistoryJson ?? '[]',
          ) as unknown
          return Array.isArray(parsed)
            ? (parsed.filter((x) => typeof x === 'string') as string[])
            : []
        } catch {
          return []
        }
      })()
      history.push(loadedEntry.roastComment)
      await db.food_entries.update(entryId, {
        roastComment: result.roast_comment,
        roastHistoryJson: JSON.stringify(history.slice(-10)),
      })
      setRebuttal('')
    } catch (e) {
      setRebutError(e instanceof Error ? e.message : '駁唔到，請再試一次。')
    } finally {
      setRebutting(false)
    }
  }

  async function onExportHealth() {
    const name = await getHealthShortcutName()
    openHealthShortcut(name, {
      type: 'meal',
      date: isoDate(loadedEntry.date),
      name: loadedEntry.name,
      calories: totals.calories,
      protein_g: totals.proteinG,
      carbs_g: totals.carbsG,
      fat_g: totals.fatG,
      sugar_g: totals.sugarG,
      fiber_g: totals.fiberG,
      sodium_mg: totals.sodiumMg,
    })
    setHealthMsg(`已交去 iOS 捷徑「${name}」（只適用於 iOS）`)
    window.setTimeout(() => setHealthMsg(null), 4000)
  }

  const roastHistory: string[] = (() => {
    try {
      const parsed = JSON.parse(loadedEntry.roastHistoryJson ?? '[]') as unknown
      return Array.isArray(parsed)
        ? (parsed.filter((x) => typeof x === 'string') as string[])
        : []
    } catch {
      return []
    }
  })()

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
        {
          image_base64: base64,
          food_titles: titles,
          region: 'hk',
          tone_mode: toneApiValue,
        },
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
        sugarG: item.sugar_g ?? 0,
        fiberG: item.fiber_g ?? 0,
        sodiumMg: item.sodium_mg ?? 0,
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
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
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
          {roastHistory.length > 0 && (
            <details className="mt-2 text-sm text-amber-800/70">
              <summary className="cursor-pointer font-bold">
                之前嘅評語（{roastHistory.length}）
              </summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {roastHistory.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>
          )}
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
        <p className="mt-0.5 text-sm text-stone-500">
          糖 {totals.sugarG}g · 纖維 {totals.fiberG}g · 鈉 {totals.sodiumMg}mg
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
                <label>
                  <span className="text-xs text-stone-500">糖 g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={item.sugarG ?? 0}
                    onChange={(e) =>
                      updateItem(i, { sugarG: Number(e.target.value) || 0 })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">纖維 g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={item.fiberG ?? 0}
                    onChange={(e) =>
                      updateItem(i, { fiberG: Number(e.target.value) || 0 })
                    }
                    className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 outline-none focus:border-amber-400"
                  />
                </label>
                <label>
                  <span className="text-xs text-stone-500">鈉 mg</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.sodiumMg ?? 0}
                    onChange={(e) =>
                      updateItem(i, { sodiumMg: Number(e.target.value) || 0 })
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

        <button
          type="button"
          onClick={onExportHealth}
          className="mt-2 w-full rounded-2xl bg-white py-3 font-bold text-red-500 ring-1 ring-red-200 active:bg-red-50"
        >
          🍎 同步呢餐去 Apple Health
        </button>
        {healthMsg && (
          <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-center text-sm text-green-700">
            {healthMsg}
          </p>
        )}
        <p className="mt-2 text-center text-xs text-stone-400">
          經 iOS 捷徑寫入 Apple Health（只適用於 iOS；捷徑名喺「設定」改）
        </p>
      </div>

      {(loadedEntry.rebuttable ?? true) && loadedEntry.roastComment && (
        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
          <h3 className="font-bold">😤 唔服？駁佢</h3>
          <p className="mt-1 text-sm text-stone-500">
            寫低你嘅反駁，AI 會用同一語氣回嘴一句。舊評語會留低，之後掃描唔會重複講。
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={rebuttal}
              onChange={(e) => setRebuttal(e.target.value)}
              placeholder="例如：呢碟根本唔油，你睇錯啦"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
            />
            <button
              type="button"
              disabled={rebutting || !rebuttal.trim()}
              onClick={onRebut}
              className="rounded-xl bg-stone-800 px-4 py-2 font-bold text-white disabled:opacity-40"
            >
              {rebutting ? '駁緊…' : '駁佢'}
            </button>
          </div>
          {rebutError && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {rebutError}
            </p>
          )}
        </div>
      )}

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

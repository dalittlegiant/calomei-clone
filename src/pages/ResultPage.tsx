// 結果頁（重構版，見 DESIGN.md §11）：
// 由上至下：食物相＋懸浮返回 → 餐類膠囊＋收藏／Health／刪除 → 標題＋份數藥丸
// → 🔥 總卡路里卡＋2×3 營養格（撳數字改總量，按比例縮放）→ 食材單行列表
// （撳一行開 IngredientSheet，唔再展開大表單）→ Roast 卡＋駁佢 → Sticky
// Bottom Bar（✨ AI 修正／搞掂）。三個彈窗：IngredientSheet、
// AddIngredientModal、AI 修正。
// 份數縮放模型：base（1 份時嘅值）× multiplier = 顯示值；改總量按比例縮放
// 未剔除食材（base 同 multiplier 同步郁）。克數由 portionDescription 解析，
// 舊記錄無克數照樣用得——唔改 Dexie schema、唔郁 src/lib。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getHealthShortcutName,
  type FoodComponent,
  type FoodEntry,
  type VisionProviderConfig,
} from '../lib/db'
import { isoDate, openHealthShortcut } from '../lib/health'
import { correctFood, rebutRoast } from '../lib/vision'
import { GlassModal } from '../components/ui'
import {
  ChevronRightIcon,
  HeartIcon,
  PencilIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from '../components/icons'
import IngredientSheet, { type IngredientPatch } from './IngredientSheet'
import AddIngredientModal from './AddIngredientModal'
import {
  fmtMealTime,
  fmtMultiplier,
  parseGrams,
  pickNutrients,
  round1,
  scaleComponent,
  scaleNutrients,
  type Nutrients,
} from './resultUtils'

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

type TotalField = keyof Nutrients

const TOTAL_FIELDS: Array<{
  field: TotalField
  label: string
  unit: string
  step: string
}> = [
  { field: 'proteinG', label: '蛋白質', unit: 'g', step: '0.1' },
  { field: 'carbsG', label: '碳水', unit: 'g', step: '0.1' },
  { field: 'fatG', label: '脂肪', unit: 'g', step: '0.1' },
  { field: 'sugarG', label: '糖', unit: 'g', step: '0.1' },
  { field: 'fiberG', label: '纖維', unit: 'g', step: '0.1' },
  { field: 'sodiumMg', label: '鈉', unit: 'mg', step: '1' },
]

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
  const [baseItems, setBaseItems] = useState<FoodComponent[] | null>(null)
  const [multiplier, setMultiplier] = useState(1)
  const [savedTick, setSavedTick] = useState(0)
  const [title, setTitle] = useState('')
  const titleEditedRef = useRef(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [correctTitles, setCorrectTitles] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [correctError, setCorrectError] = useState<string | null>(null)
  const [correctOpen, setCorrectOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rebuttal, setRebuttal] = useState('')
  const [rebutting, setRebutting] = useState(false)
  const [rebutError, setRebutError] = useState<string | null>(null)
  const [rebutOpen, setRebutOpen] = useState(false)
  const [healthMsg, setHealthMsg] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [portionOpen, setPortionOpen] = useState(false)
  const [portionCustom, setPortionCustom] = useState('')
  const [totalEdit, setTotalEdit] = useState<{
    field: TotalField
    label: string
    unit: string
    step: string
  } | null>(null)
  const [totalEditValue, setTotalEditValue] = useState('')

  // The componentsJson this page last loaded from. Only reload when the
  // SAVED components actually change — a roast-only write (e.g. 駁佢)
  // must not wipe unsaved edits on screen (the old effect re-ran on any
  // change to the entry row, resetting items / baseItems / multiplier).
  const loadedJsonRef = useRef<string | null | undefined>(undefined)

  // Load components when the saved JSON changes.
  useEffect(() => {
    if (entry) {
      const json = entry.componentsJson ?? null
      if (json === loadedJsonRef.current) return
      loadedJsonRef.current = json
      const loaded = componentsFromEntry(entry)
      setItems(loaded)
      setBaseItems(loaded)
      setMultiplier(1)
      if (!titleEditedRef.current) setTitle(entry.name)
    }
  }, [entry, savedTick])

  // The list on screen: in-memory edits, or the saved components on first
  // load. Defined before `totals` so the totals never flash 0 while the
  // rows already show food.
  const current = items ?? (entry ? componentsFromEntry(entry) : [])
  const baseList = baseItems ?? (entry ? componentsFromEntry(entry) : [])

  const totals = useMemo(() => {
    const kept = current.filter((i) => !i.isExcluded)
    return {
      calories: kept.reduce((a, i) => a + Math.round(i.calories), 0),
      proteinG: round1(kept.reduce((a, i) => a + i.proteinG, 0)),
      carbsG: round1(kept.reduce((a, i) => a + i.carbsG, 0)),
      fatG: round1(kept.reduce((a, i) => a + i.fatG, 0)),
      sugarG: round1(kept.reduce((a, i) => a + (i.sugarG ?? 0), 0)),
      fiberG: round1(kept.reduce((a, i) => a + (i.fiberG ?? 0), 0)),
      sodiumMg: Math.round(kept.reduce((a, i) => a + (i.sodiumMg ?? 0), 0)),
    }
  }, [current])

  if (!entry) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10 text-center text-white/50">
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

  /** 食材窗改完嘅顯示值 → 除返 multiplier 寫入 base，保持 base × 倍數 = 顯示值。 */
  function toBasePatch(patch: IngredientPatch, m: number): IngredientPatch {
    if (m === 1) return patch
    const g = parseGrams(patch.portionDescription)
    return {
      ...patch,
      ...scaleNutrients(pickNutrients(patch), 1 / m),
      portionDescription:
        g !== null ? `約${Math.round(g / m)}克` : patch.portionDescription,
    }
  }

  function applyIngredientPatch(index: number, patch: IngredientPatch) {
    setItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
    })
    setBaseItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.map((item, i) =>
        i === index ? { ...item, ...toBasePatch(patch, multiplier) } : item,
      )
    })
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.filter((_, i) => i !== index)
    })
    setBaseItems((prev) => {
      const list = prev ?? componentsFromEntry(loadedEntry)
      return list.filter((_, i) => i !== index)
    })
  }

  function addComponent(c: FoodComponent) {
    setItems((prev) => [...(prev ?? componentsFromEntry(loadedEntry)), c])
    setBaseItems((prev) => [
      ...(prev ?? componentsFromEntry(loadedEntry)),
      multiplier === 1 ? c : scaleComponent(c, 1 / multiplier),
    ])
  }

  function applyMultiplier(m: number) {
    const clamped = Math.min(10, Math.max(0.1, m))
    setItems(baseList.map((c) => scaleComponent(c, clamped)))
    setMultiplier(clamped)
    setPortionOpen(false)
  }

  function openTotalEdit(
    field: TotalField,
    label: string,
    unit: string,
    step: string,
  ) {
    setTotalEdit({ field, label, unit, step })
    setTotalEditValue(String(totals[field]))
  }

  function applyTotalEdit() {
    if (!totalEdit) return
    const old = totals[totalEdit.field]
    const value = Number(totalEditValue)
    if (!old || old <= 0 || !Number.isFinite(value) || value <= 0) return
    const factor = value / old
    // Keep the multiplier inside its own 0.1–10 clamp (same bounds as
    // applyMultiplier): shrink the factor so m * factor stays in range,
    // otherwise base × multiplier would no longer equal the display.
    const clampedFactor = Math.min(
      10 / multiplier,
      Math.max(0.1 / multiplier, factor),
    )
    const scaleKept = (c: FoodComponent) =>
      c.isExcluded ? c : scaleComponent(c, clampedFactor)
    setItems((prev) => (prev ?? []).map(scaleKept))
    setBaseItems((prev) => (prev ?? []).map(scaleKept))
    setMultiplier(multiplier * clampedFactor)
    setTotalEdit(null)
  }

  async function onSave() {
    const kept = current.filter((i) => !i.isExcluded)
    await db.food_entries.update(entryId, {
      name: titleEditedRef.current
        ? title
        : (kept[0]?.nameZH ?? (title || loadedEntry.name)),
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
    titleEditedRef.current = false
    setSavedTick((t) => t + 1)
  }

  async function onSaveAndBack() {
    await onSave()
    onBack()
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
      setRebutOpen(false)
    } catch (e) {
      setRebutError(e instanceof Error ? e.message : '駁唔到，請再試一次。')
    } finally {
      setRebutting(false)
    }
  }

  async function onSaveFavorite() {
    const kept = current.filter((i) => !i.isExcluded)
    if (kept.length === 0) return
    const now = Date.now()
    // v4 (2026-11-23, Audit M4)：每樣食材存齊 7 項營養素＋
    // componentsJson（單項陣列）。current 已經係畫面顯示緊嘅數值
    // （份數縮放／手動微調後），所以寫入嘅就係顯示值，唔係未縮放嘅 base。
    for (const item of kept) {
      await db.saved_foods.add({
        id: crypto.randomUUID(),
        name: item.nameZH,
        calories: Math.round(item.calories),
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        sugarG: round1(item.sugarG ?? 0),
        fiberG: round1(item.fiberG ?? 0),
        sodiumMg: Math.round(item.sodiumMg ?? 0),
        componentsJson: JSON.stringify([item]),
        servingSize: item.portionDescription,
        createdAt: now,
      })
    }
    setSavedMsg(
      `收藏咗 ${kept.length} 樣，去新增 sheet「收藏」可以直接加入`,
    )
    window.setTimeout(() => setSavedMsg(null), 4000)
  }

  async function onExportHealth() {
    const name = await getHealthShortcutName()
    openHealthShortcut(name, {
      type: 'meal',
      date: isoDate(loadedEntry.date),
      // The title on screen, not the last-saved one — editing the title
      // and exporting before 搞掂 used to send the old name with new numbers.
      name: title.trim() || loadedEntry.name,
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
      setBaseItems(next)
      setMultiplier(1)
      if (!titleEditedRef.current) setTitle(next[0]?.nameZH ?? title)
      // Write the corrected numbers back in full — the home / records /
      // progress pages all sum the TOP-LEVEL fields, so leaving them stale
      // (only componentsJson + calories updated) shows pre-correction
      // numbers everywhere until 搞掂. Same shape as ScanPage's save.
      await db.food_entries.update(entryId, {
        name: next[0]?.nameZH ?? loadedEntry.name,
        calories: result.total_calories,
        proteinG: round1(next.reduce((a, c) => a + c.proteinG, 0)),
        carbsG: round1(next.reduce((a, c) => a + c.carbsG, 0)),
        fatG: round1(next.reduce((a, c) => a + c.fatG, 0)),
        sugarG: round1(next.reduce((a, c) => a + (c.sugarG ?? 0), 0)),
        fiberG: round1(next.reduce((a, c) => a + (c.fiberG ?? 0), 0)),
        sodiumMg: Math.round(next.reduce((a, c) => a + (c.sodiumMg ?? 0), 0)),
        componentsJson: JSON.stringify(next),
        aiOriginalName: loadedEntry.aiOriginalName ?? loadedEntry.name,
        aiOriginalComponentsJson:
          loadedEntry.aiOriginalComponentsJson ?? loadedEntry.componentsJson ?? null,
      })
      setCorrectTitles('')
      setCorrectOpen(false)
    } catch (e) {
      setCorrectError(e instanceof Error ? e.message : '糾正失敗，請再試一次。')
    } finally {
      setCorrecting(false)
    }
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await db.food_entries.delete(entryId)
    onDeleted()
  }

  const mealTime = fmtMealTime(loadedEntry.mealType, loadedEntry.date)
  const displayTitle = title || loadedEntry.name
  const editingItem =
    editingIndex !== null ? current[editingIndex] : undefined

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 md:max-w-2xl">
      {/* 頂部食物相＋懸浮返回 */}
      {loadedEntry.imageDataUrl ? (
        <div className="relative mt-3">
          <img
            src={loadedEntry.imageDataUrl}
            alt="食物相片"
            className="w-full rounded-3xl object-cover"
          />
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className="pressable absolute top-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl ring-1 ring-white/20"
          >
            <XIcon size={18} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="pressable mt-4 font-bold text-[#FF9F0A]"
        >
          ← 返回記錄
        </button>
      )}

      {/* 餐類膠囊＋收藏／Health／刪除 */}
      <div className="mt-3 flex items-start justify-between gap-2">
        <span className="glass-pill mt-1 px-3 py-1.5 text-xs font-bold whitespace-nowrap">
          {mealTime}
        </span>
        <span className="flex items-start gap-3">
          <button
            type="button"
            onClick={onSaveFavorite}
            aria-label="收藏呢餐"
            className="pressable flex w-11 flex-col items-center gap-0.5"
          >
            <span className="glass-subcard flex h-10 w-10 items-center justify-center rounded-full text-[#FF9F0A]">
              <StarIcon size={20} />
            </span>
            <span className="text-[10px] font-bold text-white/50">收藏</span>
          </button>
          <button
            type="button"
            onClick={onExportHealth}
            title="經 iOS 捷徑寫入 Apple Health（只適用於 iOS；捷徑名喺「設定」改）"
            aria-label="同步去 Apple Health"
            className="pressable flex w-11 flex-col items-center gap-0.5"
          >
            <span className="glass-subcard flex h-10 w-10 items-center justify-center rounded-full text-red-400">
              <HeartIcon size={20} />
            </span>
            <span className="text-[10px] font-bold text-white/50">Health</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="刪除呢餐"
            className="pressable flex w-11 flex-col items-center gap-0.5"
          >
            <span
              className={`glass-subcard flex h-10 w-10 items-center justify-center rounded-full text-red-400 ${
                confirmDelete ? 'bg-red-500/30' : ''
              }`}
            >
              <TrashIcon size={20} />
            </span>
            <span className="text-[10px] font-bold text-white/50">刪除</span>
          </button>
        </span>
      </div>
      {confirmDelete && (
        <p className="mt-2 text-center text-sm font-bold text-red-300">
          再撳一次刪除掣確認刪除呢餐
        </p>
      )}
      {(savedMsg ?? healthMsg) && (
        <p className="mt-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-300">
          {savedMsg ?? healthMsg}
        </p>
      )}

      {/* 餐名＋整體份量 */}
      <div className="mt-3 flex items-start justify-between gap-2">
        {editingTitle ? (
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              titleEditedRef.current = true
            }}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditingTitle(false)
            }}
            aria-label="餐名"
            className="glass-input min-w-0 flex-1 text-2xl font-bold"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="pressable min-w-0 flex-1 text-left"
          >
            <h1 className="truncate text-2xl font-bold">{displayTitle}</h1>
            <span className="text-xs text-white/40">撳標題可以改名</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setPortionOpen(true)}
          className="pressable glass-pill mt-1 flex shrink-0 items-center gap-1 px-3 py-1.5 text-sm font-bold whitespace-nowrap"
        >
          {fmtMultiplier(multiplier)} 份 <PencilIcon size={13} />
        </button>
      </div>

      {/* 總卡路里卡（撳嚟改總量） */}
      <button
        type="button"
        onClick={() =>
          openTotalEdit('calories', '總卡路里', 'kcal', '1')
        }
        className="pressable glass-card mt-3 block w-full p-4 text-center"
      >
        <span className="text-4xl font-bold">🔥 {totals.calories}</span>
        <span className="ml-1 text-lg text-white/50">kcal</span>
      </button>

      {/* 2×3 營養總覽格（撳嚟改總量） */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {TOTAL_FIELDS.map((f) => (
          <button
            key={f.field}
            type="button"
            onClick={() => openTotalEdit(f.field, f.label, f.unit, f.step)}
            className="pressable glass-inset rounded-2xl p-3 text-center"
          >
            <p className="text-xs text-white/50">{f.label}</p>
            <p className="mt-0.5 text-lg font-bold">
              {totals[f.field]}
              <span className="text-xs font-normal text-white/40">
                {f.unit}
              </span>
            </p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-white/40">
        撳任何一個數字直接改總量，食材會按比例跟住郁
      </p>

      {/* 食材單行列表 */}
      <div className="mt-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">食材</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="pressable text-sm font-bold text-[#FF9F0A]"
        >
          ＋ 加多樣
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {current.map((item, i) => {
          const grams = parseGrams(item.portionDescription)
          return (
            <button
              key={i}
              type="button"
              onClick={() => setEditingIndex(i)}
              className={`pressable glass-subcard flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-3 text-left ${
                item.isExcluded ? 'opacity-50' : ''
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate font-bold ${
                  item.isExcluded ? 'line-through' : ''
                }`}
              >
                {item.nameZH}{' '}
                <span className="font-normal text-white/50">
                  · {Math.round(item.calories)} kcal
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-sm text-white/50">
                {grams !== null ? `${grams}g` : item.portionDescription}
                <ChevronRightIcon size={16} />
              </span>
            </button>
          )
        })}
        {current.length === 0 && (
          <p className="glass-inset rounded-2xl p-4 text-center text-sm text-white/50">
            未有食材，撳「＋ 加多樣」加返啲啦
          </p>
        )}
      </div>

      {/* Roast 評語卡＋駁佢 */}
      {loadedEntry.roastComment && (
        <div className="glass-roast mt-4 rounded-3xl p-4 ring-1 ring-[#FF9F0A]/25 backdrop-blur-xl">
          <p className="text-sm font-bold text-amber-200">
            {loadedEntry.roastEmoji ?? '💬'} Roast
          </p>
          <p className="mt-1 leading-relaxed">{loadedEntry.roastComment}</p>
          {roastHistory.length > 0 && (
            <details className="mt-2 text-sm text-amber-200/70">
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
          {(loadedEntry.rebuttable ?? true) && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setRebutOpen((v) => !v)}
                className="glass-subcard rounded-full px-3 py-1.5 text-sm font-bold"
              >
                駁佢
              </button>
            </div>
          )}
          {rebutOpen && (loadedEntry.rebuttable ?? true) && (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rebuttal}
                  onChange={(e) => setRebuttal(e.target.value)}
                  placeholder="例如：呢碟根本唔油，你睇錯啦"
                  className="glass-input min-w-0 flex-1"
                />
                <button
                  type="button"
                  disabled={rebutting || !rebuttal.trim()}
                  onClick={onRebut}
                  className="shrink-0 rounded-xl bg-white/10 px-4 py-2 font-bold text-white disabled:opacity-40"
                >
                  {rebutting ? '駁緊…' : '送出'}
                </button>
              </div>
              <p className="mt-1 text-xs text-white/40">
                AI 會用同一語氣回嘴一句，舊評語會留低。
              </p>
              {rebutError && (
                <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                  {rebutError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 底部懸浮固定操作欄 */}
      <div className="sticky bottom-[max(88px,calc(env(safe-area-inset-bottom)+76px))] z-20 mt-6 md:bottom-6">
        <div className="glass-nav flex gap-2 rounded-full p-2">
          <button
            type="button"
            onClick={() => setCorrectOpen(true)}
            className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-3 font-bold text-amber-200 ring-1 ring-[#FF9F0A]/50"
          >
            <SparklesIcon size={18} /> AI 修正
          </button>
          <button
            type="button"
            onClick={onSaveAndBack}
            className="pressable glass-cta-amber flex-[1.3] rounded-full px-3 py-3 font-bold text-white"
          >
            搞掂
          </button>
        </div>
      </div>

      {/* 單一食材編輯窗 */}
      {editingItem && (
        <IngredientSheet
          item={editingItem}
          onSave={(patch) => {
            if (editingIndex !== null) applyIngredientPatch(editingIndex, patch)
            setEditingIndex(null)
          }}
          onDelete={() => {
            if (editingIndex !== null) removeItem(editingIndex)
            setEditingIndex(null)
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

      {/* ＋加多樣 */}
      <AddIngredientModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addComponent}
      />

      {/* ✨ AI 修正 */}
      <GlassModal
        open={correctOpen}
        onClose={() => setCorrectOpen(false)}
        variant="dialog"
      >
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <SparklesIcon size={20} className="text-[#FF9F0A]" /> AI 修正
        </h3>
        <p className="mt-1 text-sm text-white/50">
          輸入正確食物名（逗號分隔），AI 會用同一張相重新分析。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={correctTitles}
            onChange={(e) => setCorrectTitles(e.target.value)}
            placeholder="例如：叉燒飯，凍檸茶"
            className="glass-input min-w-0 flex-1"
          />
          <button
            type="button"
            disabled={correcting || !correctTitles.trim()}
            onClick={onCorrect}
            className="pressable glass-cta-amber shrink-0 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            {correcting ? '糾正緊…' : '糾正'}
          </button>
        </div>
        {correctError && (
          <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {correctError}
          </p>
        )}
      </GlassModal>

      {/* 整體份量 */}
      <GlassModal
        open={portionOpen}
        onClose={() => setPortionOpen(false)}
        variant="dialog"
      >
        <h3 className="text-lg font-bold">整體份量</h3>
        <p className="mt-1 text-sm text-white/50">
          成餐一次過縮放，所有食材會按比例跟住郁。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0.5, 1, 1.5, 2].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => applyMultiplier(m)}
              className={`pressable rounded-full px-4 py-2 text-sm font-bold ${
                multiplier === m
                  ? 'glass-cta-amber text-white'
                  : 'glass-subcard text-white/80'
              }`}
            >
              {fmtMultiplier(m)} 份
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0.1"
            max="10"
            step="0.5"
            value={portionCustom}
            onChange={(e) => setPortionCustom(e.target.value)}
            placeholder="自訂份數，例如 1.25"
            aria-label="自訂份數"
            className="glass-input min-w-0 flex-1"
          />
          <button
            type="button"
            disabled={
              portionCustom.trim() === '' ||
              !Number.isFinite(Number(portionCustom)) ||
              Number(portionCustom) <= 0
            }
            onClick={() => applyMultiplier(Number(portionCustom))}
            className="pressable glass-cta-amber shrink-0 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-40"
          >
            套用
          </button>
        </div>
      </GlassModal>

      {/* 改總量 */}
      <GlassModal
        open={totalEdit !== null}
        onClose={() => setTotalEdit(null)}
        variant="dialog"
      >
        {totalEdit && (
          <>
            <h3 className="text-lg font-bold">改總{totalEdit.label}</h3>
            <p className="mt-1 text-sm text-white/50">
              而家 {totals[totalEdit.field]} {totalEdit.unit}
              ，未剔除嘅食材會按比例跟住郁。
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step={totalEdit.step}
                value={totalEditValue}
                onChange={(e) => setTotalEditValue(e.target.value)}
                aria-label={`總${totalEdit.label}`}
                className="glass-input min-w-0 flex-1"
              />
              <span className="shrink-0 self-center font-bold text-white/60">
                {totalEdit.unit}
              </span>
              <button
                type="button"
                disabled={
                  totalEditValue.trim() === '' ||
                  !Number.isFinite(Number(totalEditValue)) ||
                  Number(totalEditValue) <= 0 ||
                  totals[totalEdit.field] <= 0
                }
                onClick={applyTotalEdit}
                className="pressable glass-cta-amber shrink-0 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-40"
              >
                套用
              </button>
            </div>
            {totals[totalEdit.field] <= 0 && (
              <p className="mt-2 text-sm text-white/50">
                而家總數係 0，改唔到比例——請先加食材。
              </p>
            )}
          </>
        )}
      </GlassModal>
    </div>
  )
}

// Add sheet — 統一新增入口，照原 app「又食嘢？揀個方法認罪」
// 8 格：影相 / 上載 / 搜尋 / 收藏 / 打字 / 運動 / 飲水 / 上磅
// （掃描 barcode 唔做，Kong 2026-11-21 已 skip）
// 影相 / 上載用 <label> 包住隱藏 file input，撳落去直接開相機／相簿。

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { inferMealType } from '../lib/image'
import { BOTTLE_ML } from '../lib/nutrition'
import { GlassModal } from '../components/ui'
import {
  dayStartMinutes,
  getDayStart,
  todayLogStartMs,
} from '../lib/day'
import {
  macrosForGrams,
  searchFoods,
  type LocalFoodItem,
} from '../lib/foodDb'

export type SheetView =
  | 'menu'
  | 'search'
  | 'saved'
  | 'exercise'
  | 'water'
  | 'weigh'

interface Props {
  open: boolean
  initialView: SheetView
  onClose: () => void
  /** A photo file picked from the sheet — App opens ScanPage with it. */
  onScanFile: (file: File) => void
  /** Text-only mode — App opens ScanPage in 打字 mode. */
  onScanText: () => void
  /** Toast message after a successful quick add. */
  onDone: (msg: string) => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export default function AddSheet({
  open,
  initialView,
  onClose,
  onScanFile,
  onScanText,
  onDone,
}: Props) {
  const [view, setView] = useState<SheetView>(initialView)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // Search view
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LocalFoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [selectedFood, setSelectedFood] = useState<LocalFoodItem | null>(null)
  const [grams, setGrams] = useState('100')

  // Exercise view
  const [exName, setExName] = useState('')
  const [exMinutes, setExMinutes] = useState('')
  const [exKcal, setExKcal] = useState('')

  // Water view
  const [dayStart, setDayStart] = useState('00:00')
  const [customWater, setCustomWater] = useState('')
  const waterToday = useLiveQuery(
    () =>
      db.water_entries
        .where('date')
        .aboveOrEqual(todayLogStartMs(dayStartMinutes(dayStart)))
        .toArray(),
    [dayStart],
  )
  const waterTotal = (waterToday ?? []).reduce((a, w) => a + w.amountML, 0)

  // Weigh view
  const [weightKg, setWeightKg] = useState('')
  const [bodyFatPct, setBodyFatPct] = useState('')
  const [musclePct, setMusclePct] = useState('')
  const [visceral, setVisceral] = useState('')
  const [weighMsg, setWeighMsg] = useState<string | null>(null)

  // 收藏清單好細，拎晒返嚟喺 JS 排返新到舊 — saved_foods 只有 id 索引，
  // 用 orderBy('createdAt') 會令 Dexie 擲 SchemaError，成個 app 黑屏。
  const savedFoods = useLiveQuery(async () => {
    const all = await db.saved_foods.toArray()
    return all.sort((a, b) => b.createdAt - a.createdAt)
  }, [])

  useEffect(() => {
    if (open) {
      setView(initialView)
      setSearchQuery('')
      setSearchResults([])
      setSelectedFood(null)
      getDayStart().then(setDayStart)
    }
  }, [open, initialView])

  if (!open) return null

  function onPickFile(f: File | undefined) {
    if (!f) return
    onScanFile(f)
  }

  async function addEntry(e: {
    name: string
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
    servingSize: string
  }) {
    const now = Date.now()
    await db.food_entries.add({
      id: crypto.randomUUID(),
      name: e.name,
      calories: Math.round(e.calories),
      proteinG: round1(e.proteinG),
      carbsG: round1(e.carbsG),
      fatG: round1(e.fatG),
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
      servingSize: e.servingSize,
      mealType: inferMealType(),
      date: now,
      createdAt: now,
      scanStatus: 'done',
      rebuttable: false,
    })
    onDone(`已加入「${e.name}」`)
    onClose()
  }

  async function onSearch(q: string) {
    setSearchQuery(q)
    setSelectedFood(null)
    setSearchError(false)
    if (q.trim().length < 1) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      setSearchResults(await searchFoods(q, 12))
    } catch {
      // Food-DB load failed — say so instead of the misleading "搵唔到";
      // loadFoodDb retries on the next search.
      setSearchError(true)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
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
    onDone(`運動已記錄：${exName.trim()} ${minutes} 分鐘`)
    onClose()
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
    const last = (waterToday ?? []).sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0]
    if (!last) return
    await db.water_entries.delete(last.id)
  }

  async function addWeight() {
    const kg = Number(weightKg)
    const bf = bodyFatPct.trim() === '' ? null : Number(bodyFatPct)
    const muscle = musclePct.trim() === '' ? null : Number(musclePct)
    const visc = visceral.trim() === '' ? null : Number(visceral)
    if (!kg || kg <= 0) return
    if ((muscle !== null || visc !== null) && bf === null) {
      setWeighMsg('要填埋體脂，先存到肌肉率／內臟脂肪')
      return
    }
    const now = Date.now()
    await db.weight_entries.add({
      id: crypto.randomUUID(),
      weightKG: kg,
      date: now,
      createdAt: now,
    })
    if (bf !== null && bf > 0 && bf < 100) {
      await db.body_fat_entries.add({
        id: crypto.randomUUID(),
        bodyFatPercentage: bf,
        date: now,
        createdAt: now,
        muscleRate:
          muscle !== null && muscle > 0 && muscle < 100 ? muscle : null,
        visceralFat: visc !== null && visc > 0 ? visc : null,
      })
    }
    onDone(`體重已記錄：${kg} kg`)
    onClose()
  }

  const titles: Record<SheetView, string> = {
    menu: '又食嘢？揀個方法認罪',
    search: '🔍 搜尋食物（離線食物庫）',
    saved: '⭐ 收藏',
    exercise: '🏃 做咗運動？',
    water: '💧 飲水',
    weigh: '⚖️ 上磅',
  }

  return (
    <GlassModal open={open} onClose={onClose} variant="sheet">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{titles[view]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="pressable rounded-full bg-white/[0.06] px-3 py-1 font-bold text-white/60"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {view !== 'menu' && (
          <button
            type="button"
            onClick={() => setView('menu')}
            className="pressable mt-2 font-bold text-[#FF9F0A]"
          >
            ← 返回
          </button>
        )}

        {view === 'menu' && (
          <>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">📸</span>
                <span className="mt-1 block font-bold">影相</span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">🖼️</span>
                <span className="mt-1 block font-bold">上載</span>
              </button>
              <button
                type="button"
                onClick={() => setView('search')}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">🔍</span>
                <span className="mt-1 block font-bold">搜尋</span>
              </button>
              <button
                type="button"
                onClick={() => setView('saved')}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">⭐</span>
                <span className="mt-1 block font-bold">收藏</span>
              </button>
              <button
                type="button"
                onClick={onScanText}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">⌨️</span>
                <span className="mt-1 block font-bold">打字</span>
              </button>
              <button
                type="button"
                onClick={() => setView('exercise')}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">🏃</span>
                <span className="mt-1 block font-bold">運動</span>
              </button>
              <button
                type="button"
                onClick={() => setView('water')}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">💧</span>
                <span className="mt-1 block font-bold">飲水</span>
              </button>
              <button
                type="button"
                onClick={() => setView('weigh')}
                className="pressable rounded-2xl glass-subcard p-4 text-center"
              >
                <span className="block text-3xl">⚖️</span>
                <span className="mt-1 block font-bold">上磅</span>
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-white/40">
              個人版，冇收費、冇配額，想記幾多次都得。
            </p>
          </>
        )}

        {view === 'search' && (
          <div className="mt-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="搜尋食物，例如：鯖魚、米飯…"
              className="glass-input"
            />
            {searching && (
              <p className="mt-2 text-sm text-white/40">搵緊…</p>
            )}
            {searchError && (
              <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                食物庫載入失敗，請檢查網絡再試過。
              </p>
            )}
            {selectedFood && (
              <div className="mt-3 rounded-2xl bg-[#FF9F0A]/10 p-3">
                <p className="font-bold">{selectedFood.name}</p>
                <p className="text-xs text-white/50">
                  每100克 {selectedFood.caloriesPerHundredG} kcal
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="克數"
                    className="min-w-0 flex-1 glass-input"
                  />
                  <button
                    type="button"
                    disabled={!Number(grams)}
                    onClick={() => {
                      const m = macrosForGrams(selectedFood, Number(grams))
                      addEntry({
                        name: selectedFood.name,
                        calories: m.calories,
                        proteinG: m.proteinG,
                        carbsG: m.carbsG,
                        fatG: m.fatG,
                        servingSize: `約${grams}克`,
                      })
                    }}
                    className="pressable rounded-xl glass-cta-amber px-4 py-2 font-bold text-white disabled:opacity-40"
                  >
                    加入
                  </button>
                </div>
              </div>
            )}
            {searchResults.length > 0 && (
              <ul className="mt-2 divide-y divide-white/10">
                {searchResults.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFood(food)
                        setGrams('100')
                      }}
                      className="pressable flex w-full items-center justify-between gap-2 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold">
                          {food.name}{' '}
                          <span className="font-normal text-white/40">
                            {food.nameEN ?? ''}
                          </span>
                        </span>
                        <span className="block text-xs text-white/50">
                          {food.category} · 每100克 {food.caloriesPerHundredG}{' '}
                          kcal
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-[#FF9F0A]">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searchQuery.trim() &&
              !searching &&
              !searchError &&
              searchResults.length === 0 && (
                <p className="mt-3 text-center text-sm text-white/40">
                  食物庫搵唔到，試下打字叫 AI 估啦。
                </p>
              )}
          </div>
        )}

        {view === 'saved' && (
          <div className="mt-3">
            {(savedFoods ?? []).length === 0 && (
              <p className="py-6 text-center text-white/40">
                未收藏任何食物 — 去結果頁撳「收藏呢餐」就得。
              </p>
            )}
            <ul className="space-y-2">
              {(savedFoods ?? []).map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-2xl glass-subcard p-3"
                >
                  <button
                    type="button"
                    onClick={() =>
                      addEntry({
                        name: f.name,
                        calories: f.calories,
                        proteinG: f.proteinG,
                        carbsG: f.carbsG,
                        fatG: f.fatG,
                        servingSize: f.servingSize,
                      })
                    }
                    className="pressable min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-bold">{f.name}</span>
                    <span className="block text-xs text-white/50">
                      {f.calories} kcal · {f.servingSize || '一份'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => db.saved_foods.delete(f.id)}
                    className="pressable px-2 text-red-400"
                    aria-label="刪除收藏"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === 'exercise' && (
          <div className="mt-3">
            <input
              type="text"
              value={exName}
              onChange={(e) => setExName(e.target.value)}
              placeholder="做咩運動？例如：行路、跑步"
              className="glass-input"
            />
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={exMinutes}
                onChange={(e) => setExMinutes(e.target.value)}
                placeholder="分鐘"
                className="min-w-0 flex-1 glass-input"
              />
              <input
                type="number"
                inputMode="decimal"
                value={exKcal}
                onChange={(e) => setExKcal(e.target.value)}
                placeholder="燒幾多 kcal（可選）"
                className="min-w-0 flex-1 glass-input"
              />
            </div>
            <button
              type="button"
              disabled={!exName.trim() || !Number(exMinutes)}
              onClick={addExercise}
              className="pressable mt-3 w-full rounded-2xl glass-cta-amber py-3 font-bold text-white disabled:opacity-40"
            >
              加入
            </button>
          </div>
        )}

        {view === 'water' && (
          <div className="mt-3">
            <p className="text-center text-lg font-bold">
              今日飲咗 {waterTotal.toLocaleString()} ml ·{' '}
              {Math.floor(waterTotal / BOTTLE_ML)} 樽
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => addWater(BOTTLE_ML)}
                className="pressable rounded-2xl glass-cta-teal py-3 font-bold text-white"
              >
                +1 樽（500ml）
              </button>
              <button
                type="button"
                onClick={() => addWater(250)}
                className="pressable rounded-2xl bg-[#14B8A6]/15 py-3 font-bold text-teal-200"
              >
                +250 ml
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={customWater}
                onChange={(e) => setCustomWater(e.target.value)}
                placeholder="自訂毫升"
                className="min-w-0 flex-1 glass-input"
              />
              <button
                type="button"
                disabled={!Number(customWater)}
                onClick={() => {
                  addWater(Number(customWater))
                  setCustomWater('')
                }}
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
              onClick={onClose}
              className="mt-3 w-full rounded-2xl glass-subcard py-3 font-bold text-white/80"
            >
              完成
            </button>
          </div>
        )}

        {view === 'weigh' && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs font-bold text-white/60">體重 kg *</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="例如 64.0"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">體脂 %</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={bodyFatPct}
                  onChange={(e) => setBodyFatPct(e.target.value)}
                  placeholder="例如 24.0"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">肌肉率 %（可選）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={musclePct}
                  onChange={(e) => setMusclePct(e.target.value)}
                  placeholder="例如 38.5"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">內臟脂肪（可選）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={visceral}
                  onChange={(e) => setVisceral(e.target.value)}
                  placeholder="例如 6"
                  className="mt-0.5 glass-input"
                />
              </label>
            </div>
            {weighMsg && (
              <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                {weighMsg}
              </p>
            )}
            <button
              type="button"
              disabled={!Number(weightKg)}
              onClick={addWeight}
              className="pressable mt-3 w-full rounded-2xl glass-cta-amber py-3 font-bold text-white disabled:opacity-40"
            >
              記錄
            </button>
          </div>
        )}
      </div>
    </GlassModal>
  )
}

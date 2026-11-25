// Add sheet — 統一新增入口，照原 app「又食嘢？揀個方法認罪」
// 9 格：影相 / 搜尋 / 掃描 / 上載 / 收藏 / 打字 / 運動 / 飲水 / 上磅
// （2026-11-24：九宮格用 @phosphor-icons/react weight="fill" 實心圖示，
// 嚴禁 Emoji。運動開兩步記運動頁；飲水開三格轉盤彈窗；上磅開電子磅
// ＋刻度尺彈窗。2026-11-25：掃描唔再經 ScanPage 標籤中間頁，撳落去
// 直接開相機（capture="environment"），相片連 mode 'label' 交去 App，
// ScanPage 收到有相＋label 模式就直接讀營養標籤；影相／上載照舊
// mode 'food'。打字唔再跳去 ScanPage 全頁，喺呢張 sheet 入面開
// 快入彈窗，經共用 runTextScan 行同一條打字估算流程。）
// 影相 / 上載用 <label> 包住隱藏 file input，撳落去直接開相機／相簿。

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BowlFood,
  Bread,
  Cake,
  Carrot,
  Cheese,
  Coffee,
  CookingPot,
  Egg,
  FishSimple,
  Grains,
  Leaf,
  Orange,
  PencilSimple,
} from '@phosphor-icons/react'
import {
  db,
  type FoodComponent,
  type FoodEntry,
  type SavedFood,
  type UserProfile,
  type VisionProviderConfig,
} from '../lib/db'
import { inferMealType, type MealType } from '../lib/image'
import { GlassButton, GlassModal } from '../components/ui'
import {
  BarcodeSilhouetteIcon,
  BookmarkSilhouetteIcon,
  CameraSilhouetteIcon,
  DropletSilhouetteIcon,
  KeyboardSilhouetteIcon,
  PhotoSilhouetteIcon,
  RunnerSilhouetteIcon,
  ScaleSilhouetteIcon,
  SearchSilhouetteIcon,
} from '../components/icons'
import { NutrientIcon, NutrientMini } from '../components/nutrients'
import { macrosForGrams, searchFoods, type LocalFoodItem } from '../lib/foodDb'
import { runTextScan } from './textScan'
import WaterPanel from './WaterPanel'
import WeightPanel from './WeightPanel'

export type SheetView = 'menu' | 'search' | 'saved' | 'water' | 'weigh' | 'text'

interface Props {
  open: boolean
  initialView: SheetView
  onClose: () => void
  /** A photo file picked from the sheet — App opens ScanPage with it,
   *  in the given mode ('food' for 影相／上載， 'label' for 掃描 —
   *  label 模式行營養標籤 OCR prompt，唔係食物相估算）。 */
  onScanFile: (file: File, mode?: 'food' | 'label') => void
  /** Two-step log-exercise page — App opens ExercisePage. */
  onOpenExercise: () => void
  /** Toast message after a successful quick add. */
  onDone: (msg: string) => void
  /** Text-scan needs these (same inputs ScanPage gets from App). */
  profile: UserProfile
  visionConfig: VisionProviderConfig
  tonePrompt: string
  /** 打字快入估算完成 — App 閂 sheet，開 ResultPage 睇結果。 */
  onTextScanned: (entryId: string) => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * 舊格式收藏（v4 之前，無 sugarG／fiberG／sodiumMg／componentsJson）
 * 嘅 fallback：將收藏本身砌成單項食材清單，等 ResultPage 睇得返
 * 一樣食材；糖／纖維／鈉當 0。唔會報錯、唔會留空。
 */
function savedFallbackComponentsJson(f: SavedFood): string {
  const single: FoodComponent = {
    nameZH: f.name,
    nameEN: '',
    portionDescription: f.servingSize,
    calories: f.calories,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    confidence: 1,
    sugarG: 0,
    fiberG: 0,
    sodiumMg: 0,
    isExcluded: false,
  }
  return JSON.stringify([single])
}

/** 離線食物庫分類 → 單色琥珀金食物圖示（關鍵字配對）。 */
function FoodCategoryIcon({ category, size = 22 }: { category: string; size?: number }) {
  const c = category
  let Icon = BowlFood
  if (/魚|蝦|蟹|貝|水產/.test(c)) Icon = FishSimple
  else if (/蔬|瓜|菜|筍/.test(c)) Icon = Carrot
  else if (/菇|菌|豆|腐/.test(c)) Icon = Leaf
  else if (/水果/.test(c)) Icon = Orange
  else if (/蛋/.test(c)) Icon = Egg
  else if (/乳|奶/.test(c)) Icon = Cheese
  else if (/飲料|酒|茶|咖啡/.test(c)) Icon = Coffee
  else if (/麵包/.test(c)) Icon = Bread
  else if (/糕|餅|點心|蛋糕/.test(c)) Icon = Cake
  else if (/穀|澱粉|米|麵|粉/.test(c)) Icon = Grains
  else if (/肉|畜|豬|牛|羊|雞|鴨/.test(c)) Icon = CookingPot
  return <Icon size={size} weight="fill" className="text-[#FF9F0A]" />
}

type SearchTab = 'all' | 'recent' | 'saved' | 'custom' | 'list'

/** 搜尋行統一模型：離線庫項目、已記過嘅食物、收藏食物。 */
type SearchRow =
  | { kind: 'db'; item: LocalFoodItem }
  | { kind: 'logged'; entry: FoodEntry }
  | { kind: 'saved'; food: SavedFood }

export default function AddSheet({
  open,
  initialView,
  onClose,
  onScanFile,
  onOpenExercise,
  onDone,
  profile,
  visionConfig,
  tonePrompt,
  onTextScanned,
}: Props) {
  const [view, setView] = useState<SheetView>(initialView)
  const cameraRef = useRef<HTMLInputElement>(null)
  const labelCameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // 打字快入彈窗（text view）——語氣／地區唔喺度顯示，runTextScan
  // 喺背後照舊用 tonePrompt＋hk。2026-11-25：早／午／晚餐類型取消，
  // 唔再問邊餐。
  const [textDesc, setTextDesc] = useState('')
  const [textScanning, setTextScanning] = useState(false)
  const [textError, setTextError] = useState<string | null>(null)
  const [textProgress, setTextProgress] = useState<string | null>(null)

  // Search view
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTab, setSearchTab] = useState<SearchTab>('all')
  const [searchResults, setSearchResults] = useState<LocalFoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [adjust, setAdjust] = useState<SearchRow | null>(null)
  const [grams, setGrams] = useState('100')
  const [servings, setServings] = useState(1)

  // 收藏清單好細，拎晒返嚟喺 JS 排返新到舊 — saved_foods 只有 id 索引，
  // 用 orderBy('createdAt') 會令 Dexie 擲 SchemaError，成個 app 黑屏。
  const savedFoods = useLiveQuery(async () => {
    const all = await db.saved_foods.toArray()
    return all.sort((a, b) => b.createdAt - a.createdAt)
  }, [])

  // 2026-11-25 收藏 Library：搵名＋排序＋編輯／刪除。搜尋係名嘅
  // substring；「最常食」按 food_entries 記過嘅次數排。
  type SavedSort = 'newest' | 'frequent' | 'calAsc' | 'calDesc'
  const [savedQuery, setSavedQuery] = useState('')
  const [savedSort, setSavedSort] = useState<SavedSort>('newest')
  const [editingSaved, setEditingSaved] = useState<SavedFood | null>(null)
  const [editName, setEditName] = useState('')
  const [editServing, setEditServing] = useState('')
  const [editCalories, setEditCalories] = useState('')
  const [editProtein, setEditProtein] = useState('')
  const [editCarbs, setEditCarbs] = useState('')
  const [editFat, setEditFat] = useState('')
  const [editSugar, setEditSugar] = useState('')
  const [editFiber, setEditFiber] = useState('')
  const [editSodium, setEditSodium] = useState('')
  const [confirmDeleteSaved, setConfirmDeleteSaved] = useState(false)

  function openEditSaved(f: SavedFood) {
    setEditingSaved(f)
    setEditName(f.name)
    setEditServing(f.servingSize)
    setEditCalories(String(f.calories))
    setEditProtein(String(f.proteinG))
    setEditCarbs(String(f.carbsG))
    setEditFat(String(f.fatG))
    setEditSugar(String(f.sugarG ?? 0))
    setEditFiber(String(f.fiberG ?? 0))
    setEditSodium(String(f.sodiumMg ?? 0))
    setConfirmDeleteSaved(false)
  }

  /** 收藏編輯「儲存」：數字欄留空／打錯字 = 沿用舊值，唔會清零。
   * 營養總數有改就按新總數起返單項食材清單（舊嘅多項分解唔再
   * 啱數，留返會令記餐嗰陣總數同成分對唔上）；只改名／份量就
   * 保留原有食材分解。 */
  async function saveEditSaved() {
    if (!editingSaved) return
    const f = editingSaved
    const num = (v: string, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : fallback
    }
    const calories = Math.round(num(editCalories, f.calories))
    const proteinG = round1(num(editProtein, f.proteinG))
    const carbsG = round1(num(editCarbs, f.carbsG))
    const fatG = round1(num(editFat, f.fatG))
    const sugarG = round1(num(editSugar, f.sugarG ?? 0))
    const fiberG = round1(num(editFiber, f.fiberG ?? 0))
    const sodiumMg = Math.round(num(editSodium, f.sodiumMg ?? 0))
    const totalsChanged =
      calories !== f.calories ||
      proteinG !== f.proteinG ||
      carbsG !== f.carbsG ||
      fatG !== f.fatG ||
      sugarG !== (f.sugarG ?? 0) ||
      fiberG !== (f.fiberG ?? 0) ||
      sodiumMg !== (f.sodiumMg ?? 0)
    const edited: SavedFood = {
      ...f,
      name: editName.trim() || f.name,
      servingSize: editServing.trim(),
      calories,
      proteinG,
      carbsG,
      fatG,
      sugarG,
      fiberG,
      sodiumMg,
    }
    await db.saved_foods.update(f.id, {
      name: edited.name,
      servingSize: edited.servingSize,
      calories,
      proteinG,
      carbsG,
      fatG,
      sugarG,
      fiberG,
      sodiumMg,
      componentsJson: totalsChanged
        ? savedFallbackComponentsJson(edited)
        : f.componentsJson,
    })
    setEditingSaved(null)
    onDone(`已更新「${editName.trim() || f.name}」`)
  }

  /** 收藏「刪除」兩撳確認：第一撳變紅字「撳多次確認刪除」，第二撳先
   * 真係刪——唔會一唔小心碌到就冇咗。 */
  async function deleteSaved() {
    if (!editingSaved) return
    if (!confirmDeleteSaved) {
      setConfirmDeleteSaved(true)
      return
    }
    const name = editingSaved.name
    await db.saved_foods.delete(editingSaved.id)
    setEditingSaved(null)
    setConfirmDeleteSaved(false)
    onDone(`已刪除「${name}」`)
  }

  // 搜尋分頁用嘅已記食物 — 同樣拎晒返嚟喺 JS 排（food_entries 只有
  // id 索引，用 orderBy 會黑屏）。
  const allEntries = useLiveQuery(() => db.food_entries.toArray(), [])
  const sortedEntries = useMemo(
    () => [...(allEntries ?? [])].sort((a, b) => b.date - a.date),
    [allEntries],
  )
  /** 最近：按名去重，最新行先。 */
  const recentRows: SearchRow[] = useMemo(() => {
    const seen = new Set<string>()
    const rows: SearchRow[] = []
    for (const e of sortedEntries) {
      if (seen.has(e.name)) continue
      seen.add(e.name)
      rows.push({ kind: 'logged', entry: e })
      if (rows.length >= 12) break
    }
    return rows
  }, [sortedEntries])
  /** 自訂：記過但未入收藏嘅食物（AI／打字估出嚟嗰啲）。 */
  const customRows: SearchRow[] = useMemo(() => {
    const savedNames = new Set((savedFoods ?? []).map((f) => f.name))
    return recentRows.filter(
      (r) => r.kind === 'logged' && !savedNames.has(r.entry.name),
    )
  }, [recentRows, savedFoods])
  /** 清單：常食清單 — 食過最多次嘅 12 樣。 */
  const frequentRows: SearchRow[] = useMemo(() => {
    const byName = new Map<
      string,
      { entry: FoodEntry; count: number; latest: number }
    >()
    for (const e of sortedEntries) {
      const cur = byName.get(e.name)
      if (cur) {
        cur.count += 1
        cur.latest = Math.max(cur.latest, e.date)
      } else {
        byName.set(e.name, { entry: e, count: 1, latest: e.date })
      }
    }
    return [...byName.values()]
      .sort((a, b) => b.count - a.count || b.latest - a.latest)
      .slice(0, 12)
      .map((v) => ({ kind: 'logged', entry: v.entry }) as SearchRow)
  }, [sortedEntries])

  // 收藏 Library 篩選＋排序——放喺 sortedEntries 之後（useMemo 回調
  // 即刻執行，前面引用 sortedEntries 會撞 TDZ）。
  const savedFreq = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of sortedEntries) {
      counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
    }
    return counts
  }, [sortedEntries])

  const filteredSaved = useMemo(() => {
    const q = savedQuery.trim().toLowerCase()
    const list = (savedFoods ?? []).filter(
      (f) => !q || f.name.toLowerCase().includes(q),
    )
    switch (savedSort) {
      case 'frequent':
        return [...list].sort(
          (a, b) =>
            (savedFreq.get(b.name) ?? 0) - (savedFreq.get(a.name) ?? 0) ||
            b.createdAt - a.createdAt,
        )
      case 'calAsc':
        return [...list].sort((a, b) => a.calories - b.calories)
      case 'calDesc':
        return [...list].sort((a, b) => b.calories - a.calories)
      default:
        return list
    }
  }, [savedFoods, savedQuery, savedSort, savedFreq])

  useEffect(() => {
    if (open) {
      setView(initialView)
      setSearchQuery('')
      setSearchTab('all')
      setSearchResults([])
      setAdjust(null)
      setTextDesc('')
      setTextError(null)
      setTextProgress(null)
      setTextScanning(false)
      setSavedQuery('')
      setSavedSort('newest')
      setEditingSaved(null)
      setConfirmDeleteSaved(false)
    }
  }, [open, initialView])

  if (!open) return null

  function onPickFile(f: File | undefined, mode: 'food' | 'label' = 'food') {
    if (!f) return
    onScanFile(f, mode)
  }

  /** 打字快入「用文字估算」：同 ScanPage 打字模式同一條流程
   *  （runTextScan），成功就閂 sheet、App 開 ResultPage；失敗留喺
   *  彈窗顯示錯誤，唔跳頁。 */
  async function submitText() {
    if (textScanning || !textDesc.trim()) return
    setTextScanning(true)
    setTextError(null)
    setTextProgress(null)
    try {
      const id = await runTextScan({
        description: textDesc.trim(),
        profile,
        tonePrompt,
        visionConfig,
        onProgress: setTextProgress,
      })
      onTextScanned(id)
    } catch (e) {
      setTextError(e instanceof Error ? e.message : '估算失敗，請再試一次。')
    } finally {
      setTextScanning(false)
      setTextProgress(null)
    }
  }

  async function addEntry(e: {
    name: string
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
    servingSize: string
    /** v4：完整 7 項＋食材清單。無就 fallback 去 0／null（舊收藏／
     * 搜尋結果行呢條路，行為同以前一樣）。 */
    sugarG?: number
    fiberG?: number
    sodiumMg?: number
    componentsJson?: string | null
    mealType?: MealType
  }) {
    const now = Date.now()
    await db.food_entries.add({
      id: crypto.randomUUID(),
      name: e.name,
      calories: Math.round(e.calories),
      proteinG: round1(e.proteinG),
      carbsG: round1(e.carbsG),
      fatG: round1(e.fatG),
      sugarG: round1(e.sugarG ?? 0),
      fiberG: round1(e.fiberG ?? 0),
      sodiumMg: Math.round(e.sodiumMg ?? 0),
      servingSize: e.servingSize,
      mealType: e.mealType ?? inferMealType(),
      date: now,
      createdAt: now,
      componentsJson: e.componentsJson ?? null,
      scanStatus: 'done',
      rebuttable: false,
    })
    onDone(`已加入「${e.name}」`)
    onClose()
  }

  async function onSearch(q: string) {
    setSearchQuery(q)
    setAdjust(null)
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

  /** 搜尋行快速記入：撳 + 直接按 1 份記入。 */
  function quickAddRow(row: SearchRow) {
    if (row.kind === 'db') {
      const m = macrosForGrams(row.item, 100)
      addEntry({
        name: row.item.name,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        servingSize: '1份（約100克）',
      })
    } else if (row.kind === 'logged') {
      const e = row.entry
      addEntry({
        name: e.name,
        calories: e.calories,
        proteinG: e.proteinG,
        carbsG: e.carbsG,
        fatG: e.fatG,
        sugarG: e.sugarG ?? 0,
        fiberG: e.fiberG ?? 0,
        sodiumMg: e.sodiumMg ?? 0,
        servingSize: e.servingSize,
        componentsJson: e.componentsJson ?? null,
      })
    } else {
      addSaved(row.food)
    }
  }

  function addSaved(f: SavedFood) {
    addEntry({
      name: f.name,
      calories: f.calories,
      proteinG: f.proteinG,
      carbsG: f.carbsG,
      fatG: f.fatG,
      servingSize: f.servingSize,
      // v4：有齊就完整帶入；舊收藏無呢啲欄位就
      // fallback（營養 0、食材清單單項），唔會炒車。
      sugarG: f.sugarG ?? 0,
      fiberG: f.fiberG ?? 0,
      sodiumMg: f.sodiumMg ?? 0,
      componentsJson: f.componentsJson ?? savedFallbackComponentsJson(f),
    })
  }

  function openAdjust(row: SearchRow) {
    setAdjust(row)
    setGrams('100')
    setServings(1)
  }

  /** 調整面板「加入」：離線庫按克數，已記／收藏按份數。 */
  function confirmAdjust() {
    if (!adjust) return
    if (adjust.kind === 'db') {
      const g = Number(grams)
      if (!g) return
      const m = macrosForGrams(adjust.item, g)
      addEntry({
        name: adjust.item.name,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        servingSize: `約${grams}克`,
        mealType: inferMealType(),
      })
      return
    }
    const base =
      adjust.kind === 'logged'
        ? {
            name: adjust.entry.name,
            calories: adjust.entry.calories,
            proteinG: adjust.entry.proteinG,
            carbsG: adjust.entry.carbsG,
            fatG: adjust.entry.fatG,
            sugarG: adjust.entry.sugarG ?? 0,
            fiberG: adjust.entry.fiberG ?? 0,
            sodiumMg: adjust.entry.sodiumMg ?? 0,
            servingSize: adjust.entry.servingSize,
            componentsJson: adjust.entry.componentsJson ?? null,
          }
        : {
            name: adjust.food.name,
            calories: adjust.food.calories,
            proteinG: adjust.food.proteinG,
            carbsG: adjust.food.carbsG,
            fatG: adjust.food.fatG,
            sugarG: adjust.food.sugarG ?? 0,
            fiberG: adjust.food.fiberG ?? 0,
            sodiumMg: adjust.food.sodiumMg ?? 0,
            servingSize: adjust.food.servingSize,
            componentsJson:
              adjust.food.componentsJson ??
              savedFallbackComponentsJson(adjust.food),
          }
    addEntry({
      name: base.name,
      calories: base.calories * servings,
      proteinG: base.proteinG * servings,
      carbsG: base.carbsG * servings,
      fatG: base.fatG * servings,
      sugarG: base.sugarG * servings,
      fiberG: base.fiberG * servings,
      sodiumMg: base.sodiumMg * servings,
      servingSize: `${servings} × ${base.servingSize || '1份'}`,
      componentsJson: base.componentsJson,
      mealType: inferMealType(),
    })
  }

  /** 調整面板即時預覽數值。 */
  function adjustPreview(): {
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
  } | null {
    if (!adjust) return null
    if (adjust.kind === 'db') {
      const g = Number(grams)
      if (!g) return null
      return macrosForGrams(adjust.item, g)
    }
    const base = adjust.kind === 'logged' ? adjust.entry : adjust.food
    return {
      calories: Math.round(base.calories * servings),
      proteinG: round1(base.proteinG * servings),
      carbsG: round1(base.carbsG * servings),
      fatG: round1(base.fatG * servings),
    }
  }

  const titles: Record<SheetView, string> = {
    menu: '又食嘢？揀個方法認罪',
    search: '認罪',
    saved: '收藏食物',
    water: '飲咗邊樽？',
    weigh: '上磅',
    text: '打字記低食咗咩',
  }

  /** 九宮格一格：深色暖黑圓底＋琥珀金剪影＋名。 */
  function GridTile({
    label,
    onClick,
    children,
  }: {
    label: string
    onClick: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="pressable rounded-2xl glass-subcard p-4 text-center"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#17140F] ring-1 ring-white/10">
          {children}
        </span>
        <span className="mt-2 block font-bold">{label}</span>
      </button>
    )
  }

  /** 搜尋行：左圓形食物圖示、中間菜名＋副標、右圓形 + 快速記入。 */
  function SearchRowButton({ row }: { row: SearchRow }) {
    const name =
      row.kind === 'db'
        ? row.item.name
        : row.kind === 'logged'
          ? row.entry.name
          : row.food.name
    const subtitle =
      row.kind === 'db'
        ? `${row.item.caloriesPerHundredG} 卡 · 1份`
        : row.kind === 'logged'
          ? `${row.entry.calories} 卡 · ${row.entry.servingSize || '1份'}`
          : `${row.food.calories} 卡 · 1份`
    return (
      <li className="flex items-center gap-3 py-2.5">
        <button
          type="button"
          onClick={() => openAdjust(row)}
          className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17140F] ring-1 ring-white/10">
            {row.kind === 'db' ? (
              <FoodCategoryIcon category={row.item.category} size={22} />
            ) : (
              <BowlFood size={22} weight="fill" className="text-[#FF9F0A]" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{name}</span>
            <span className="block text-xs text-white/50">{subtitle}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => quickAddRow(row)}
          aria-label={`快速記入 ${name}`}
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xl font-bold text-white/80"
        >
          ＋
        </button>
      </li>
    )
  }

  const q = searchQuery.trim().toLowerCase()
  const filterByQuery = (rows: SearchRow[]) =>
    q ? rows.filter((r) => {
      const n = r.kind === 'db' ? r.item.name : r.kind === 'logged' ? r.entry.name : r.food.name
      return n.toLowerCase().includes(q)
    }) : rows
  const tabRows: SearchRow[] =
    searchTab === 'all'
      ? q
        ? searchResults.map((item) => ({ kind: 'db', item }) as SearchRow)
        : recentRows
      : searchTab === 'recent'
        ? filterByQuery(recentRows)
        : searchTab === 'saved'
          ? filterByQuery(
              (savedFoods ?? []).map((food) => ({ kind: 'saved', food }) as SearchRow),
            )
          : searchTab === 'custom'
            ? filterByQuery(customRows)
            : filterByQuery(frequentRows)

  const preview = adjustPreview()

  return (
    <GlassModal open={open} onClose={onClose} variant="sheet">
      <div>
        {/* 飲水／上磅面板自帶頂欄，唔重複顯示 sheet 標題。 */}
        {view !== 'water' && view !== 'weigh' && (
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
        )}

        {view !== 'menu' && view !== 'water' && view !== 'weigh' && (
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
              onChange={(e) => onPickFile(e.target.files?.[0], 'food')}
            />
            {/* 掃描專用相機 input——同影相一樣直接開相機，但相片
                以 mode 'label' 交去 App，行營養標籤 OCR prompt。 */}
            <input
              ref={labelCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0], 'label')}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0], 'food')}
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <GridTile
                label="影相"
                onClick={() => cameraRef.current?.click()}
              >
                <CameraSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile label="搜尋" onClick={() => setView('search')}>
                <SearchSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile
                label="掃描"
                onClick={() => labelCameraRef.current?.click()}
              >
                <BarcodeSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile
                label="上載"
                onClick={() => galleryRef.current?.click()}
              >
                <PhotoSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile label="收藏" onClick={() => setView('saved')}>
                <BookmarkSilhouetteIcon
                  size={28}
                  className="text-[#FF9F0A]"
                />
              </GridTile>
              <GridTile label="打字" onClick={() => setView('text')}>
                <KeyboardSilhouetteIcon
                  size={28}
                  className="text-[#FF9F0A]"
                />
              </GridTile>
              <GridTile label="運動" onClick={onOpenExercise}>
                <RunnerSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile label="飲水" onClick={() => setView('water')}>
                <DropletSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
              <GridTile label="上磅" onClick={() => setView('weigh')}>
                <ScaleSilhouetteIcon size={28} className="text-[#FF9F0A]" />
              </GridTile>
            </div>
            <p className="mt-4 text-center text-xs text-white/40">
              個人版，冇收費、冇配額，想記幾多次都得。
            </p>
          </>
        )}

        {view === 'text' && (
          <div className="mt-3">
            <label className="block text-sm font-bold text-white/60">
              食咗咩？
            </label>
            <textarea
              value={textDesc}
              onChange={(e) => setTextDesc(e.target.value)}
              placeholder="例如：叉燒飯一碟，加凍檸茶"
              rows={3}
              autoFocus
              className="glass-input mt-1 resize-none"
            />
            <GlassButton
              variant="amber"
              disabled={textScanning || !textDesc.trim()}
              onClick={submitText}
              className="pressable mt-4 w-full rounded-2xl py-3 text-lg"
            >
              {textScanning ? '分析緊…請稍候' : '用文字估算'}
            </GlassButton>
            {textError && (
              <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                {textError}
              </p>
            )}
            {textScanning && textProgress && (
              <p className="mt-3 text-center text-sm text-white/50">
                {textProgress}
              </p>
            )}
          </div>
        )}

        {view === 'search' && (
          <div className="mt-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="又食咗咩..."
              className="glass-input"
            />
            {/* 5 個分頁膠囊，帶琥珀底線指示。 */}
            <div className="mt-3 flex justify-between border-b border-white/10">
              {(
                [
                  { id: 'all', label: '全部' },
                  { id: 'recent', label: '最近' },
                  { id: 'saved', label: '收藏' },
                  { id: 'custom', label: '自訂' },
                  { id: 'list', label: '清單' },
                ] as Array<{ id: SearchTab; label: string }>
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSearchTab(t.id)
                    setAdjust(null)
                  }}
                  className={`pressable -mb-px border-b-2 px-2 pb-2 font-bold ${
                    searchTab === t.id
                      ? 'border-[#FF9F0A] text-[#FF9F0A]'
                      : 'border-transparent text-white/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {searching && (
              <p className="mt-2 text-sm text-white/40">搵緊…</p>
            )}
            {searchError && (
              <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                食物庫載入失敗，請檢查網絡再試過。
              </p>
            )}

            {/* 調整面板：份數／克數＋餐類。 */}
            {adjust && preview && (
              <div className="mt-3 rounded-2xl bg-[#FF9F0A]/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {adjust.kind === 'db'
                        ? adjust.item.name
                        : adjust.kind === 'logged'
                          ? adjust.entry.name
                          : adjust.food.name}
                    </p>
                    <p className="text-xs text-white/50">
                      {adjust.kind === 'db'
                        ? `每100克 ${adjust.item.caloriesPerHundredG} kcal`
                        : `上次：${
                            adjust.kind === 'logged'
                              ? adjust.entry.servingSize || '1份'
                              : adjust.food.servingSize || '1份'
                          } · ${
                            adjust.kind === 'logged'
                              ? adjust.entry.calories
                              : adjust.food.calories
                          } kcal`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdjust(null)}
                    aria-label="取消調整"
                    className="pressable shrink-0 px-1 text-white/50"
                  >
                    ✕
                  </button>
                </div>
                {adjust.kind === 'db' ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={grams}
                      onChange={(e) => setGrams(e.target.value)}
                      placeholder="克數"
                      className="min-w-0 flex-1 glass-input"
                    />
                    <span className="self-center text-sm text-white/50">克</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => setServings((s) => Math.max(0.5, round1(s - 0.5)))}
                      disabled={servings <= 0.5}
                      aria-label="減少份數"
                      className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold tabular-nums">
                      {servings} 份
                    </span>
                    <button
                      type="button"
                      onClick={() => setServings((s) => Math.min(5, round1(s + 0.5)))}
                      disabled={servings >= 5}
                      aria-label="增加份數"
                      className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold disabled:opacity-30"
                    >
                      ＋
                    </button>
                  </div>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <NutrientIcon nutrient="calories" size={15} />
                    {preview.calories} kcal
                  </span>
                  <NutrientMini nutrient="proteinG" value={preview.proteinG} />
                  <NutrientMini nutrient="carbsG" value={preview.carbsG} />
                  <NutrientMini nutrient="fatG" value={preview.fatG} />
                </p>
                <button
                  type="button"
                  disabled={adjust.kind === 'db' && !Number(grams)}
                  onClick={confirmAdjust}
                  className="pressable mt-2 w-full rounded-xl glass-cta-amber py-2.5 font-bold text-white disabled:opacity-40"
                >
                  加入
                </button>
              </div>
            )}

            {searchTab === 'all' && !q && (
              <p className="mt-3 text-xs font-bold text-white/40">
                最近食過
              </p>
            )}
            {tabRows.length > 0 && (
              <ul className="divide-y divide-white/10">
                {tabRows.map((row) => (
                  <SearchRowButton
                    key={
                      row.kind === 'db'
                        ? row.item.id
                        : row.kind === 'logged'
                          ? `log-${row.entry.id}`
                          : `saved-${row.food.id}`
                    }
                    row={row}
                  />
                ))}
              </ul>
            )}
            {searchTab === 'all' && q && !searching && !searchError && tabRows.length === 0 && (
              <p className="mt-3 text-center text-sm text-white/40">
                食物庫搵唔到，試下打字叫 AI 估啦。
              </p>
            )}
            {searchTab !== 'all' && tabRows.length === 0 && (
              <p className="mt-3 text-center text-sm text-white/40">
                {searchTab === 'recent'
                  ? '未有最近食過嘅記錄。'
                  : searchTab === 'saved'
                    ? '未收藏任何食物 — 去結果頁撳「收藏呢餐」就得。'
                    : searchTab === 'custom'
                      ? '未有自訂食物 — 打字叫 AI 估，記低之後就會出現喺呢度。'
                      : '食多幾餐先有常食清單。'}
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
            {(savedFoods ?? []).length > 0 && (
              <>
                <input
                  type="text"
                  value={savedQuery}
                  onChange={(e) => setSavedQuery(e.target.value)}
                  placeholder="搵收藏…"
                  className="glass-input"
                />
                <div className="mt-2 flex gap-1 overflow-x-auto">
                  {(
                    [
                      { id: 'newest', label: '最新' },
                      { id: 'frequent', label: '最常食' },
                      { id: 'calAsc', label: '卡路里 ↑' },
                      { id: 'calDesc', label: '卡路里 ↓' },
                    ] as Array<{ id: SavedSort; label: string }>
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSavedSort(s.id)}
                      className={`pressable shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                        savedSort === s.id
                          ? 'bg-[#FF9F0A]/25 text-[#FF9F0A]'
                          : 'bg-white/[0.06] text-white/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {editingSaved && (
              <div className="mt-3 rounded-2xl bg-[#FF9F0A]/10 p-3 ring-1 ring-[#FF9F0A]/30">
                <div className="flex items-center justify-between">
                  <p className="font-bold">編輯收藏</p>
                  <button
                    type="button"
                    onClick={() => setEditingSaved(null)}
                    aria-label="取消編輯"
                    className="pressable px-1 text-white/50"
                  >
                    ✕
                  </button>
                </div>
                <label className="mt-2 block text-xs font-bold text-white/50">
                  名稱
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="glass-input mt-1"
                />
                <label className="mt-2 block text-xs font-bold text-white/50">
                  份量
                </label>
                <input
                  type="text"
                  value={editServing}
                  onChange={(e) => setEditServing(e.target.value)}
                  placeholder="例如：1份"
                  className="glass-input mt-1"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      { label: '卡路里', unit: 'kcal', value: editCalories, set: setEditCalories },
                      { label: '蛋白質', unit: 'g', value: editProtein, set: setEditProtein },
                      { label: '碳水', unit: 'g', value: editCarbs, set: setEditCarbs },
                      { label: '脂肪', unit: 'g', value: editFat, set: setEditFat },
                      { label: '糖', unit: 'g', value: editSugar, set: setEditSugar },
                      { label: '纖維', unit: 'g', value: editFiber, set: setEditFiber },
                      { label: '鈉', unit: 'mg', value: editSodium, set: setEditSodium },
                    ] as Array<{
                      label: string
                      unit: string
                      value: string
                      set: (v: string) => void
                    }>
                  ).map((f) => (
                    <label key={f.label} className="block">
                      <span className="text-xs font-bold text-white/50">
                        {f.label}（{f.unit}）
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        className="glass-input mt-1"
                      />
                    </label>
                  ))}
                </div>
                <GlassButton
                  variant="amber"
                  onClick={saveEditSaved}
                  className="pressable mt-3 w-full rounded-xl py-2.5 font-bold"
                >
                  儲存
                </GlassButton>
                <button
                  type="button"
                  onClick={deleteSaved}
                  className={`pressable mt-2 w-full rounded-xl py-2.5 text-sm font-bold ${
                    confirmDeleteSaved
                      ? 'bg-red-500/25 text-red-300'
                      : 'bg-white/[0.06] text-red-400/80'
                  }`}
                >
                  {confirmDeleteSaved ? '撳多次確認刪除' : '刪除收藏'}
                </button>
              </div>
            )}
            {(savedFoods ?? []).length > 0 && (
              <p className="mt-3 text-xs text-white/40">
                共 {filteredSaved.length} 樣
                {savedQuery.trim() &&
                  filteredSaved.length === 0 &&
                  ` — 搵唔到「${savedQuery.trim()}」`}
              </p>
            )}
            {filteredSaved.length > 0 && (
              <ul className="mt-2 space-y-2">
                {filteredSaved.map((f) => (
                  <li key={f.id} className="rounded-2xl glass-subcard p-4">
                    <button
                      type="button"
                      onClick={() => addSaved(f)}
                      className="pressable block w-full text-left"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17140F] ring-1 ring-white/10">
                            <BowlFood
                              size={22}
                              weight="fill"
                              className="text-[#FF9F0A]"
                            />
                          </span>
                          <span className="min-w-0 truncate font-bold">
                            {f.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-xs text-white/50">1份</span>
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`編輯收藏 ${f.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditSaved(f)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openEditSaved(f)
                              }
                            }}
                            className="pressable flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-white/10"
                          >
                            <PencilSimple
                              size={14}
                              weight="fill"
                              className="text-[#8FB8D8]"
                            />
                          </span>
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-1.5 text-xl font-bold">
                        <NutrientIcon nutrient="calories" size={20} />
                        {f.calories} 卡路里
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {f.proteinG > 0 && (
                          <NutrientMini nutrient="proteinG" value={round1(f.proteinG)} />
                        )}
                        {f.carbsG > 0 && (
                          <NutrientMini nutrient="carbsG" value={round1(f.carbsG)} />
                        )}
                        {f.fatG > 0 && (
                          <NutrientMini nutrient="fatG" value={round1(f.fatG)} />
                        )}
                        {(f.sugarG ?? 0) > 0 && (
                          <NutrientMini nutrient="sugarG" value={round1(f.sugarG ?? 0)} />
                        )}
                        {(f.fiberG ?? 0) > 0 && (
                          <NutrientMini nutrient="fiberG" value={round1(f.fiberG ?? 0)} />
                        )}
                        {(f.sodiumMg ?? 0) > 0 && (
                          <NutrientMini nutrient="sodiumMg" value={Math.round(f.sodiumMg ?? 0)} />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {view === 'water' && <WaterPanel onDone={onDone} onClose={onClose} />}

        {view === 'weigh' && <WeightPanel onDone={onDone} onClose={onClose} />}
      </div>
    </GlassModal>
  )
}

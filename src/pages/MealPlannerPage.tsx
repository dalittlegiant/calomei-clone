// Meal Planner — Plan → Shop → Cook → Log（一體化煮飯模組，2026-11-23）。
// 骨架跟參考圖（Mealime 揀菜卡／提醒事項雜貨模式／Crouton 下廚佈局）；
// 皮膚 100% DESIGN.md：Warm Obsidian Liquid Glass、琥珀 #FF9F0A、湖水綠
// #14B8A6，嚴禁白底／淺色／綠藍板。動效跟 src/motion/presets（只驅動
// transform／opacity；新膠囊用全站唯一 layoutId）。
// 數據：Dexie v3 三表（recipes / meal_plans / grocery_items）＋ settings
// cooking_prefs；寫入 food_entries 後跳轉 ResultPage（由 App 接手）。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { DUR, easeOutExpo, springPill } from '../motion/presets'
import {
  db,
  getCookingPrefs,
  setCookingPrefs,
  COOKING_STYLES,
  COOKING_TOOLS,
  GROCERY_CATEGORIES,
  type CookingPrefs,
  type GroceryCategory,
  type GroceryItem,
  type MealPlanItem,
  type Recipe,
  type UserProfile,
  type VisionProviderConfig,
} from '../lib/db'
import { effectiveTarget } from '../lib/nutrition'
import { dayStartMinutes, getDayStart, logDayKey } from '../lib/day'
import { inferMealType, MEAL_LABELS, type MealType } from '../lib/image'
import {
  fmtAmount,
  generateCookRoast,
  generateRecipes,
  mergeGrocery,
  MOCK_RECIPES,
  parseFridgeInput,
  sharedIngredientTags,
} from '../lib/mealPlanner'
import { GlassButton, GlassCard, GlassModal } from '../components/ui'
import {
  CheckIcon,
  ChefHatIcon,
  ClockIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TimerIcon,
  VolumeIcon,
  XIcon,
} from '../components/icons'

type Stage = 'plan' | 'shop' | 'cook'

interface Props {
  profile: UserProfile
  visionConfig: VisionProviderConfig
  tonePrompt: string
  onLogged: (entryId: string) => void
  /** 沿用 App.tsx 現有 toast（showToast），唔自創一套。 */
  onToast: (msg: string) => void
}

const PORTIONS = [0.5, 1, 1.5, 2]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 柔和提示音：兩下 sine 音，唔刺耳。 */
function playDoneChime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [880, 1174.66]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.55)
    })
    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    // 無聲都唔報錯 — 提示音係加分，唔係必要。
  }
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function MealPlannerPage({
  profile,
  visionConfig,
  tonePrompt,
  onLogged,
  onToast,
}: Props) {
  const [stage, setStage] = useState<Stage>('plan')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [libraryTab, setLibraryTab] = useState<'all' | 'fav'>('all')
  const [fridgeInput, setFridgeInput] = useState('')
  const [fridgeMode, setFridgeMode] = useState<'strict' | 'flexible'>(
    'strict',
  )
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState<CookingPrefs | null>(null)
  const [prefsDraft, setPrefsDraft] = useState<CookingPrefs | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [shopFilter, setShopFilter] = useState<'to_buy' | 'have'>('to_buy')
  const [manualName, setManualName] = useState('')
  const [manualCat, setManualCat] = useState<GroceryCategory>('其他')
  const [dayStart, setDayStart] = useState('00:00')

  // Cook mode
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null)
  const [cookServings, setCookServings] = useState(2)
  const [stepIdx, setStepIdx] = useState(0)
  const [prepDone, setPrepDone] = useState<Set<string>>(new Set())
  const [timer, setTimer] = useState<{
    endAt: number
    totalMs: number
    label: string
  } | null>(null)
  const [timerDone, setTimerDone] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())
  const [wakeOn, setWakeOn] = useState(false)
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null)
  const timerDoneRef = useRef(false)

  // Log sheet
  const [logRecipe, setLogRecipe] = useState<Recipe | null>(null)
  const [logPortions, setLogPortions] = useState(1)
  const [logMeal, setLogMeal] = useState<MealType>(() => inferMealType())
  const [roastOn, setRoastOn] = useState(false)
  const [roastText, setRoastText] = useState<string | null>(null)
  const [roastLoading, setRoastLoading] = useState(false)
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [savingFav, setSavingFav] = useState(false)

  const recipes = useLiveQuery(
    () => db.recipes.orderBy('createdAt').toArray(),
    [],
  )
  const mealPlans = useLiveQuery(() => db.meal_plans.toArray(), [])
  const grocery = useLiveQuery(
    () => db.grocery_items.orderBy('createdAt').toArray(),
    [],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const entries = useLiveQuery(() => db.food_entries.toArray(), [])

  useEffect(() => {
    getCookingPrefs().then(setPrefs)
    getDayStart().then(setDayStart)
  }, [])

  // 計時器滴答（500ms 一格就夠，唔使 1 秒都唔到就 re-render 全頁）。
  useEffect(() => {
    if (!timer) return
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [timer !== null])

  // 夠鐘：響一次＋視覺提示。
  useEffect(() => {
    if (timer && nowMs >= timer.endAt && !timerDoneRef.current) {
      timerDoneRef.current = true
      setTimerDone(true)
      playDoneChime()
    }
  }, [nowMs, timer])

  // 離開下廚模式：放開 Wake Lock、停朗讀。
  useEffect(() => {
    if (!cookRecipeId) {
      void releaseWake()
      try {
        window.speechSynthesis?.cancel()
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookRecipeId])

  async function releaseWake(): Promise<void> {
    try {
      await wakeRef.current?.release()
    } catch {
      // ignore — 優雅降級
    }
    wakeRef.current = null
    setWakeOn(false)
  }

  async function toggleWake(): Promise<void> {
    if (wakeOn) {
      await releaseWake()
      return
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (t: string) => Promise<{ release: () => Promise<void> }>
        }
      }
      if (!nav.wakeLock) return // 唔支援就靜默降級，唔報錯
      wakeRef.current = await nav.wakeLock.request('screen')
      setWakeOn(true)
    } catch {
      // 用戶拒絕／瀏覽器唔俾 — 靜默降級
    }
  }

  function speak(text: string): void {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-HK'
      u.rate = 1
      synth.speak(u)
    } catch {
      // 唔支援就靜默
    }
  }

  const startMin = dayStartMinutes(dayStart)
  const todayKey = logDayKey(Date.now(), startMin)
  const todayTotals = useMemo(() => {
    const t = { calories: 0, proteinG: 0 }
    for (const e of entries ?? []) {
      if (logDayKey(e.date, startMin) !== todayKey) continue
      if (e.scanStatus === 'scanning' || e.scanStatus === 'failed') continue
      t.calories += e.calories
      t.proteinG += e.proteinG
    }
    return t
  }, [entries, todayKey, startMin])
  const target = effectiveTarget(profile, override ?? null)
  const remainingKcal = target.calories - todayTotals.calories
  const remainingProtein = target.proteinG - todayTotals.proteinG

  const recipeList = recipes ?? []
  const shownRecipes =
    libraryTab === 'fav'
      ? recipeList.filter((r) => r.isFavorite)
      : recipeList
  const sharedTags = useMemo(
    () => sharedIngredientTags(recipeList),
    [recipeList],
  )
  const plannedRecipes = useMemo(() => {
    const byId = new Map(recipeList.map((r) => [r.id, r]))
    return (mealPlans ?? [])
      .map((p) => ({ plan: p, recipe: byId.get(p.recipeId) }))
      .filter((x): x is { plan: MealPlanItem; recipe: Recipe } =>
        Boolean(x.recipe),
      )
  }, [mealPlans, recipeList])

  const cookRecipe = cookRecipeId
    ? (recipeList.find((r) => r.id === cookRecipeId) ?? null)
    : null
  // 下廚步驟：第 0 步係前置備料卡，之後先係食譜步驟。
  const cookSteps = useMemo(() => {
    if (!cookRecipe) return []
    const prep = {
      text: '開火前搞掂晒：洗淨、切件、醃好肉，調味料擺埋一齊，唔好開咗火先手忙腳亂。',
      ingredients: cookRecipe.ingredients.map((i) => i.name),
      timerMinutes: 0,
      isPrep: true,
    }
    return [
      prep,
      ...cookRecipe.steps.map((s) => ({ ...s, isPrep: false })),
    ]
  }, [cookRecipe])
  const cookStep = cookSteps[stepIdx] ?? null
  const timerRemaining = timer ? timer.endAt - nowMs : 0

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function seedMock(): Promise<void> {
    setSeeding(true)
    try {
      const now = Date.now()
      await db.recipes.bulkPut(
        MOCK_RECIPES.map((r, i) => ({ ...r, createdAt: now + i })),
      )
      setGenMsg('已載入 4 款示範菜式，撳勾選就開得工。')
    } finally {
      setSeeding(false)
    }
  }

  async function onGenerate(): Promise<void> {
    if (generating || !prefs) return
    setGenerating(true)
    setGenError(null)
    setGenMsg(null)
    try {
      const fridgeItems = parseFridgeInput(fridgeInput)
      const list = await generateRecipes(
        visionConfig,
        {
          prefs,
          remainingKcal,
          remainingProteinG: remainingProtein,
          fridgeItems,
          fridgeMode,
        },
        (m) => setGenMsg(m),
      )
      await db.recipes.bulkPut(list)
      setLibraryTab('all')
      setGenMsg(
        `推送咗 ${list.length} 款菜${fridgeItems.length > 0 ? (fridgeMode === 'strict' ? '（只用雪櫃食材）' : '（雪櫃食材為主）') : ''}，勾選想整嘅再生成買餸清單。`,
      )
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '生成失敗，請再試一次。')
    } finally {
      setGenerating(false)
    }
  }

  async function onBuildGrocery(): Promise<void> {
    const picks = recipeList
      .filter((r) => selected.has(r.id))
      .map((recipe) => ({
        recipe,
        servings: prefs?.defaultServings ?? recipe.servings,
      }))
    if (picks.length === 0) return
    // 清雪櫃：輸入框而家有咩食材，嗰啲就自動歸「屋企已有」。
    const merged = mergeGrocery(picks, parseFridgeInput(fridgeInput))
    const now = Date.now()
    await db.transaction('rw', [db.meal_plans, db.grocery_items], async () => {
      await db.meal_plans.clear()
      await db.grocery_items.clear()
      await db.meal_plans.bulkAdd(
        picks.map((p, i) => ({
          id: crypto.randomUUID(),
          recipeId: p.recipe.id,
          servings: p.servings,
          status: 'planned' as const,
          createdAt: now + i,
        })),
      )
      await db.grocery_items.bulkAdd(
        merged.map((g, i) => ({
          ...g,
          id: crypto.randomUUID(),
          createdAt: now + i,
        })),
      )
    })
    setStage('shop')
    setShopFilter('to_buy')
  }

  async function toggleGrocery(item: GroceryItem): Promise<void> {
    // 待買 ⇄ 已買；屋企已有 ⇄ 待買（喺「屋企已有」頁撳返出嚟）。
    const next =
      item.status === 'to_buy'
        ? 'bought'
        : item.status === 'bought'
          ? 'to_buy'
          : 'to_buy'
    await db.grocery_items.update(item.id, { status: next })
  }

  async function markHave(item: GroceryItem): Promise<void> {
    await db.grocery_items.update(item.id, {
      status: item.status === 'have' ? 'to_buy' : 'have',
    })
  }

  async function addManual(): Promise<void> {
    const name = manualName.trim()
    if (!name) return
    await db.grocery_items.add({
      id: crypto.randomUUID(),
      name,
      amount: 1,
      unit: '份',
      grams: null,
      category: manualCat,
      status: 'to_buy',
      sources: ['手動加入'],
      createdAt: Date.now(),
    })
    setManualName('')
  }

  function startCook(recipe: Recipe, servings: number): void {
    setCookRecipeId(recipe.id)
    setCookServings(servings)
    setStepIdx(0)
    setPrepDone(new Set())
    setTimer(null)
    setTimerDone(false)
    timerDoneRef.current = false
  }

  function exitCook(): void {
    setCookRecipeId(null)
    setTimer(null)
    setTimerDone(false)
    timerDoneRef.current = false
  }

  function startStepTimer(minutes: number, label: string): void {
    const totalMs = minutes * 60_000
    setTimer({ endAt: Date.now() + totalMs, totalMs, label })
    setTimerDone(false)
    timerDoneRef.current = false
  }

  function stepIngredients(): Array<{
    name: string
    amount: string
  }> {
    if (!cookRecipe || !cookStep) return []
    // 下廚係煮成碟（計劃份數），唔係每份 — 材料按計劃份數 ÷ 食譜份數縮放。
    const f = cookServings / Math.max(1, cookRecipe.servings)
    return cookStep.ingredients
      .map((name) => {
        const ing = cookRecipe.ingredients.find((i) => i.name === name)
        if (!ing) return { name, amount: '' }
        return {
          name,
          amount:
            ing.grams !== null
              ? `約${Math.round(ing.grams * f)}克`
              : fmtAmount(ing.amount * f, ing.unit),
        }
      })
      .filter((x) => x.name)
  }

  async function onToggleRoast(on: boolean): Promise<void> {
    setRoastOn(on)
    if (!on || !logRecipe) return
    setRoastLoading(true)
    try {
      const text = await generateCookRoast(
        visionConfig,
        tonePrompt,
        logRecipe.name,
        logPortions,
      )
      setRoastText(text)
    } catch {
      setRoastText(null)
      setLogError('Roast 生成唔到，照樣可以記低呢餐。')
    } finally {
      setRoastLoading(false)
    }
  }

  function openLog(recipe: Recipe): void {
    setLogRecipe(recipe)
    setLogPortions(1)
    setLogMeal(inferMealType())
    setRoastOn(false)
    setRoastText(null)
    setLogError(null)
  }

  /**
   * 按所選份數換算食材：食材係「成個食譜（servings 人份）嘅總量」；
   * 食咗 portions 份，即係成碟嘅 portions / servings。逐樣換算後四捨五入，
   * 總數 = 逐樣加埋——confirmLog（記入今日）同 saveFavorite（存入收藏）
   * 用同一條數，兩邊唔會唔夾。
   */
  function buildComponents(recipe: Recipe, portions: number) {
    const factor = portions / Math.max(1, recipe.servings)
    return recipe.ingredients.map((ing) => ({
      nameZH: ing.name,
      nameEN: '',
      portionDescription:
        ing.grams !== null
          ? `約${Math.round(ing.grams * factor)}克`
          : `${Math.round(ing.amount * factor * 100) / 100} ${ing.unit}`,
      calories: Math.round(ing.calories * factor),
      proteinG: round1(ing.proteinG * factor),
      carbsG: round1(ing.carbsG * factor),
      fatG: round1(ing.fatG * factor),
      confidence: 1,
      isExcluded: false,
      sugarG: round1(ing.sugarG * factor),
      fiberG: round1(ing.fiberG * factor),
      sodiumMg: Math.round(ing.sodiumMg * factor),
    }))
  }

  function sumTotals(
    components: ReturnType<typeof buildComponents>,
  ): {
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
    sugarG: number
    fiberG: number
    sodiumMg: number
  } {
    return components.reduce(
      (a, c) => ({
        calories: a.calories + c.calories,
        proteinG: round1(a.proteinG + c.proteinG),
        carbsG: round1(a.carbsG + c.carbsG),
        fatG: round1(a.fatG + c.fatG),
        sugarG: round1(a.sugarG + c.sugarG),
        fiberG: round1(a.fiberG + c.fiberG),
        sodiumMg: a.sodiumMg + c.sodiumMg,
      }),
      {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        sugarG: 0,
        fiberG: 0,
        sodiumMg: 0,
      },
    )
  }

  async function confirmLog(): Promise<void> {
    if (!logRecipe || logging) return
    setLogging(true)
    setLogError(null)
    try {
      const now = Date.now()
      const components = buildComponents(logRecipe, logPortions)
      const totals = sumTotals(components)
      const id = crypto.randomUUID()
      await db.food_entries.add({
        id,
        name: `${logRecipe.name}（自家煮）`,
        calories: totals.calories,
        proteinG: totals.proteinG,
        carbsG: totals.carbsG,
        fatG: totals.fatG,
        servingSize: `${logPortions} 份`,
        mealType: logMeal,
        date: now,
        createdAt: now,
        imagePath: null,
        imageDataUrl: null,
        componentsJson: JSON.stringify(components),
        scanStatus: 'done',
        roastComment: roastOn ? roastText : null,
        roastEmoji: roastOn ? '👨‍🍳' : null,
        sugarG: totals.sugarG,
        fiberG: totals.fiberG,
        sodiumMg: totals.sodiumMg,
        rebuttable: false,
      })
      // 呢味餸標做已煮，唔使再喺菜單度等。
      const plan = (mealPlans ?? []).find(
        (p) => p.recipeId === logRecipe.id,
      )
      if (plan) await db.meal_plans.update(plan.id, { status: 'done' })
      setLogRecipe(null)
      exitCook()
      setStage('plan')
      onLogged(id)
    } catch (e) {
      setLogError(e instanceof Error ? e.message : '寫入失敗，請再試一次。')
    } finally {
      setLogging(false)
    }
  }

  /**
   * 存入收藏（留待之後食先記）：按 Sheet 揀選嘅份數，將所選份數嘅總量
   * 寫入 saved_foods，唔寫 food_entries、唔跳 ResultPage。
   * v4 (2026-11-23)：存齊 7 項營養素＋按份數縮放好嘅 componentsJson，
   * 同 confirmLog 共用 buildComponents／sumTotals 同一條數。
   * 同名已有就更新嗰條，唔會靜靜地整多個重複收藏。
   */
  async function saveFavorite(): Promise<void> {
    if (!logRecipe || savingFav || logging) return
    setSavingFav(true)
    setLogError(null)
    try {
      const components = buildComponents(logRecipe, logPortions)
      const totals = sumTotals(components)
      const name = `${logRecipe.name}（自家煮）`
      // saved_foods 得 id 索引，成個表拎返嚟喺 JS 搵同名
      // （收藏清單好細，AddSheet 都係咁做）。
      const existing = (await db.saved_foods.toArray()).find(
        (f) => f.name === name,
      )
      const row = {
        name,
        calories: totals.calories,
        proteinG: totals.proteinG,
        carbsG: totals.carbsG,
        fatG: totals.fatG,
        sugarG: totals.sugarG,
        fiberG: totals.fiberG,
        sodiumMg: totals.sodiumMg,
        componentsJson: JSON.stringify(components),
        servingSize: `${logPortions} 份`,
        createdAt: Date.now(),
      }
      if (existing) await db.saved_foods.update(existing.id, row)
      else await db.saved_foods.add({ id: crypto.randomUUID(), ...row })
      setLogRecipe(null)
      onToast('已存入『加食物 → 收藏』，下次叮熱食一撳即記！')
    } catch (e) {
      setLogError(e instanceof Error ? e.message : '存入收藏失敗，請再試一次。')
    } finally {
      setSavingFav(false)
    }
  }

  const groceryList = grocery ?? []
  const toBuy = groceryList.filter((g) => g.status === 'to_buy')
  const haveList = groceryList.filter((g) => g.status === 'have')
  const boughtCount = groceryList.filter((g) => g.status === 'bought').length
  const shopShown =
    shopFilter === 'to_buy'
      ? groceryList.filter((g) => g.status !== 'have')
      : haveList
  const groupedShop = GROCERY_CATEGORIES.map((cat) => ({
    cat,
    items: shopShown.filter((g) => g.category === cat),
  })).filter((g) => g.items.length > 0)

  const selectedCount = selected.size

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 md:max-w-2xl md:pb-12">
      {/* 頂部：分段膠囊（揀菜／買餸／開爐）＋廚房偏好小圓掣 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="glass-nav flex flex-1 items-center rounded-full p-1">
          {(
            [
              ['plan', '揀菜'],
              ['shop', '買餸'],
              ['cook', '開爐'],
            ] as Array<[Stage, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStage(key)}
              className={`pressable relative min-h-[44px] flex-1 rounded-full px-2 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                stage === key ? 'text-[#FF9F0A]' : 'text-white/50'
              }`}
            >
              {stage === key && (
                <motion.span
                  layoutId="meal-stage-pill"
                  className="absolute inset-0 rounded-full bg-white/15"
                  transition={springPill}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setPrefsDraft(prefs)
            setPrefsOpen(true)
          }}
          aria-label="廚房偏好"
          className="glass-subcard pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80"
        >
          <ChefHatIcon size={20} />
        </button>
      </div>

      {/* 今日剩餘小提示（供 AI 配菜參考，唔係主角） */}
      <p className="mt-2 text-center text-xs text-white/40 tabular-nums">
        今日仲剩約 {Math.max(0, remainingKcal)} kcal · 蛋白質約{' '}
        {Math.max(0, Math.round(remainingProtein))} 克
      </p>

      {stage === 'plan' && (
        <div>
          {/* 清雪櫃：輸入屋企現有食材，AI 用佢哋嚟諗菜（留空 = 按偏好自由推送） */}
          <div className="glass-subcard mt-3 p-3">
            <label
              htmlFor="fridge-input"
              className="text-sm font-bold text-white/80"
            >
              清雪櫃 · 屋企現有食材
            </label>
            <input
              id="fridge-input"
              type="text"
              value={fridgeInput}
              onChange={(e) => setFridgeInput(e.target.value)}
              placeholder="輸入屋企現有食材，如：三文魚、西蘭花、雞蛋…"
              className="glass-input mt-2"
            />
            <div className="glass-nav mt-2 flex items-center rounded-full p-1">
              {(
                [
                  ['strict', '只用現有食材'],
                  ['flexible', '現有為主＋可加料'],
                ] as Array<['strict' | 'flexible', string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFridgeMode(key)}
                  aria-pressed={fridgeMode === key}
                  className={`pressable relative min-h-[44px] flex-1 rounded-full px-2 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                    fridgeMode === key ? 'text-[#FF9F0A]' : 'text-white/50'
                  }`}
                >
                  {fridgeMode === key && (
                    <motion.span
                      layoutId="fridge-mode-pill"
                      className="absolute inset-0 rounded-full bg-white/15"
                      transition={springPill}
                    />
                  )}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/40">
              {fridgeMode === 'strict'
                ? '只用上面食材＋油鹽豉油等常備調味，唔叫你買新肉新菜；唔夠砌就出少啲款。'
                : '以上食材做主角，每款可加 1–3 樣街市易買嘅新鮮配料。'}
              留空就按廚房偏好自由推送。
            </p>
          </div>
          <GlassButton
            variant="amber"
            onClick={onGenerate}
            disabled={generating || !prefs}
            className="pressable mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-base"
          >
            <SparklesIcon size={20} />
            {generating
              ? '諗緊今期買咩餸…'
              : fridgeInput.trim()
                ? '用雪櫃食材推送菜式'
                : '推送今期買餸 Idea'}
          </GlassButton>
          {genMsg && (
            <p className="mt-2 rounded-xl bg-teal-500/15 px-3 py-2 text-center text-sm text-teal-200">
              {genMsg}
            </p>
          )}
          {genError && (
            <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-300">
              {genError}
            </p>
          )}

          {/* 全部／常煮收藏庫 */}
          <div className="mt-4 flex gap-2">
            {(
              [
                ['all', '全部菜式'],
                ['fav', '常煮收藏庫'],
              ] as Array<['all' | 'fav', string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLibraryTab(key)}
                className={`pressable min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
                  libraryTab === key
                    ? 'glass-cta-amber text-white'
                    : 'glass-subcard text-white/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {recipeList.length === 0 ? (
            <GlassCard className="mt-4 p-5 text-center">
              <p className="text-lg font-bold">未有菜式</p>
              <p className="mt-1 text-sm text-white/50">
                撳上面推送等 AI 諗 6 款，或者先載入示範菜單睇吓個樣。
              </p>
              <GlassButton
                variant="glass"
                onClick={seedMock}
                disabled={seeding}
                className="pressable mt-4 min-h-[48px] rounded-full px-5 py-2.5"
              >
                {seeding ? '載入緊…' : '載入示範菜單（4 款香港家常菜）'}
              </GlassButton>
            </GlassCard>
          ) : shownRecipes.length === 0 ? (
            <GlassCard className="mt-4 p-5 text-center">
              <p className="font-bold">收藏庫仲係空嘅</p>
              <p className="mt-1 text-sm text-white/50">
                喺菜卡撳 ★ 就可以收藏常煮嘅餸。
              </p>
            </GlassCard>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {shownRecipes.map((recipe) => {
                const isSel = selected.has(recipe.id)
                const shared = sharedTags.get(recipe.id) ?? []
                return (
                  <GlassCard
                    key={recipe.id}
                    className={`relative p-4 transition-opacity ${
                      isSel ? 'ring-2 ring-[#FF9F0A]/70' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(recipe.id)}
                      aria-label={isSel ? `取消勾選 ${recipe.name}` : `勾選 ${recipe.name}`}
                      className="pressable absolute top-3 right-3 flex h-11 w-11 items-center justify-center"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                          isSel
                            ? 'border-[#FF9F0A] bg-[#FF9F0A] text-white'
                            : 'border-white/30 bg-black/30 text-transparent'
                        }`}
                      >
                        <CheckIcon size={16} />
                      </span>
                    </button>
                    <h3 className="pr-10 text-lg leading-snug font-bold">
                      {recipe.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-white/50 tabular-nums">
                      <ClockIcon size={14} />
                      備料 {recipe.prepMinutes} 分鐘 · 煮{' '}
                      {recipe.cookMinutes} 分鐘
                    </p>
                    <p className="mt-2 text-sm tabular-nums">
                      <span className="font-bold text-[#FF9F0A]">
                        {recipe.calories} kcal
                      </span>
                      <span className="text-white/50"> / 份 · 蛋白質 </span>
                      <span className="font-bold">{recipe.proteinG}g</span>
                    </p>
                    {shared.length > 0 && (
                      <p className="mt-2">
                        {shared.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="glass-pill mr-1.5 mb-1 inline-block px-2.5 py-1 text-xs font-bold text-teal-200"
                          >
                            共用 {s}
                          </span>
                        ))}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-white/40">
                        {recipe.source === 'ai'
                          ? 'AI 推送'
                          : recipe.source === 'mock'
                            ? '示範菜式'
                            : '自訂'}
                        {' · '}
                        {recipe.servings} 人份
                      </span>
                      <button
                        type="button"
                        onClick={async () =>
                          db.recipes.update(recipe.id, {
                            isFavorite: !recipe.isFavorite,
                          })
                        }
                        aria-label={
                          recipe.isFavorite ? '取消收藏' : '收藏呢味餸'
                        }
                        className={`pressable flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                          recipe.isFavorite ? 'text-[#FF9F0A]' : 'text-white/30'
                        }`}
                      >
                        {recipe.isFavorite ? '★' : '☆'}
                      </button>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {stage === 'shop' && (
        <div>
          {groceryList.length === 0 ? (
            <GlassCard className="mt-4 p-5 text-center">
              <p className="text-lg font-bold">買餸清單仲係空嘅</p>
              <p className="mt-1 text-sm text-white/50">
                返去「揀菜」勾選幾味餸，再撳「生成買餸清單」。
              </p>
              <GlassButton
                variant="amber"
                onClick={() => setStage('plan')}
                className="pressable mt-4 min-h-[48px] rounded-full px-5 py-2.5"
              >
                返去揀菜
              </GlassButton>
            </GlassCard>
          ) : (
            <>
              {/* 待買清單／屋企已有 */}
              <div className="glass-nav mt-3 flex items-center rounded-full p-1">
                {(
                  [
                    ['to_buy', `待買清單（${toBuy.length + boughtCount}）`],
                    ['have', `屋企已有（${haveList.length}）`],
                  ] as Array<['to_buy' | 'have', string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setShopFilter(key)}
                    className={`pressable relative min-h-[44px] flex-1 rounded-full px-2 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                      shopFilter === key ? 'text-[#FF9F0A]' : 'text-white/50'
                    }`}
                  >
                    {shopFilter === key && (
                      <motion.span
                        layoutId="meal-shop-filter-pill"
                        className="absolute inset-0 rounded-full bg-white/15"
                        transition={springPill}
                      />
                    )}
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>

              <p className="mt-2 text-center text-xs text-white/40">
                已買 {boughtCount} / {toBuy.length + boughtCount} 樣
                {shopFilter === 'to_buy'
                  ? ' · 撳圓格標「已買」，撳名可以標「屋企已有」'
                  : ' · 呢啲唔使買，撳返出嚟可以改返待買'}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {groupedShop.map(({ cat, items }) => {
                  // 未買喺上、已買沉底（DOM 重排＋淡出，唔動畫 height）。
                  const sorted = [...items].sort((a, b) =>
                    a.status === 'bought' && b.status !== 'bought'
                      ? 1
                      : a.status !== 'bought' && b.status === 'bought'
                        ? -1
                        : 0,
                  )
                  return (
                    <GlassCard key={cat} className="p-3">
                      <h3 className="px-1 pt-1 pb-2 text-sm font-bold text-white/70">
                        {cat}
                      </h3>
                      <div className="space-y-1">
                        {sorted.map((item) => {
                          const done =
                            item.status === 'bought' ||
                            item.status === 'have'
                          return (
                            <motion.div
                              key={item.id}
                              layout
                              initial={false}
                              animate={{ opacity: done ? 0.55 : 1 }}
                              transition={{
                                duration: DUR.quick,
                                ease: easeOutExpo,
                              }}
                              className="flex items-center gap-2 rounded-2xl px-1 py-1"
                            >
                              <button
                                type="button"
                                onClick={() => toggleGrocery(item)}
                                aria-label={
                                  done
                                    ? `取消已買 ${item.name}`
                                    : `標已買 ${item.name}`
                                }
                                className="pressable flex h-11 w-11 shrink-0 items-center justify-center"
                              >
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                                    item.status === 'bought'
                                      ? 'border-[#14B8A6] bg-[#14B8A6] text-white'
                                      : item.status === 'have'
                                        ? 'border-white/30 bg-white/10 text-white/60'
                                        : 'border-white/30 bg-black/30 text-transparent'
                                  }`}
                                >
                                  <CheckIcon size={16} />
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => markHave(item)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span
                                  className={`block truncate font-bold ${
                                    done ? 'line-through text-white/50' : ''
                                  }`}
                                >
                                  {item.name}
                                </span>
                                <span className="block truncate text-xs text-white/40">
                                  {item.sources.join('、')}
                                </span>
                              </button>
                              <span className="shrink-0 text-sm font-bold text-white/80 tabular-nums whitespace-nowrap">
                                {item.grams !== null
                                  ? `約${item.grams}克`
                                  : fmtAmount(item.amount, item.unit)}
                              </span>
                            </motion.div>
                          )
                        })}
                      </div>
                    </GlassCard>
                  )
                })}
              </div>

              {/* 手動＋加多樣：上下疊排（.glass-input 係 width:100%，
                  同 select 並排會互搶闊度出界）。 */}
              <GlassCard className="mt-3 p-3">
                <p className="px-1 pb-2 text-sm font-bold text-white/70">
                  ＋ 加多樣雜貨
                </p>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addManual()
                  }}
                  placeholder="例如：芫荽 1 扎"
                  aria-label="手動加食材"
                  className="glass-input"
                />
                <div className="mt-2 flex gap-2">
                  <select
                    value={manualCat}
                    onChange={(e) =>
                      setManualCat(e.target.value as GroceryCategory)
                    }
                    aria-label="分類"
                    className="glass-input min-w-0 flex-1"
                  >
                    {GROCERY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <GlassButton
                    variant="amber"
                    onClick={() => void addManual()}
                    disabled={!manualName.trim()}
                    className="pressable min-h-[48px] shrink-0 rounded-xl px-5"
                  >
                    加入
                  </GlassButton>
                </div>
              </GlassCard>

              <GlassButton
                variant="amber"
                onClick={() => setStage('cook')}
                className="pressable mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-base"
              >
                <ShoppingBagIcon size={20} />
                買齊料，去煮飯！
              </GlassButton>
            </>
          )}
        </div>
      )}

      {stage === 'cook' && !cookRecipe && (
        <div>
          {plannedRecipes.length === 0 ? (
            <GlassCard className="mt-4 p-5 text-center">
              <p className="text-lg font-bold">今期菜單仲係空嘅</p>
              <p className="mt-1 text-sm text-white/50">
                返去「揀菜」勾選，再生成買餸清單，先有得開爐。
              </p>
              <GlassButton
                variant="amber"
                onClick={() => setStage('plan')}
                className="pressable mt-4 min-h-[48px] rounded-full px-5 py-2.5"
              >
                返去揀菜
              </GlassButton>
            </GlassCard>
          ) : (
            <div className="mt-3 space-y-3">
              {plannedRecipes.map(({ plan, recipe }) => (
                <GlassCard key={plan.id} className="flex items-center gap-3 p-4">
                  <span className="glass-subcard flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#FF9F0A]">
                    <ChefHatIcon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">
                      {recipe.name}
                    </span>
                    <span className="block text-sm text-white/50 tabular-nums">
                      {plan.servings} 份 · {recipe.calories} kcal / 份 ·{' '}
                      {plan.status === 'done' ? '已煮好' : '等緊開爐'}
                    </span>
                  </span>
                  <GlassButton
                    variant={plan.status === 'done' ? 'glass' : 'amber'}
                    onClick={() => startCook(recipe, plan.servings)}
                    className="pressable min-h-[48px] shrink-0 rounded-full px-5 py-2.5"
                  >
                    {plan.status === 'done' ? '再煮' : '開爐'}
                  </GlassButton>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部懸浮行動條：Plan 已選 → 生成買餸清單 */}
      {stage === 'plan' && selectedCount > 0 && (
        <div className="sticky bottom-[max(88px,calc(env(safe-area-inset-bottom)+76px))] z-20 mt-6 md:bottom-6">
          <div className="glass-nav flex gap-2 rounded-full p-2">
            <GlassButton
              variant="amber"
              onClick={() => void onBuildGrocery()}
              className="pressable flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full px-3 py-3"
            >
              <ShoppingBagIcon size={20} />
              生成買餸清單（已選 {selectedCount} 道菜）
            </GlassButton>
          </div>
        </div>
      )}

      {/* 廚房偏好彈窗（GlassModal，唔攤喺主頁） */}
      <GlassModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        variant="dialog"
      >
        {prefsDraft && (
          <>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <ChefHatIcon size={20} className="text-[#FF9F0A]" />
              我的廚房偏好
            </h3>
            <p className="mt-3 text-sm font-bold text-white/70">常用廚具</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COOKING_TOOLS.map((tool) => {
                const on = prefsDraft.tools.includes(tool)
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() =>
                      setPrefsDraft({
                        ...prefsDraft,
                        tools: on
                          ? prefsDraft.tools.filter((t) => t !== tool)
                          : [...prefsDraft.tools, tool],
                      })
                    }
                    className={`pressable min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
                      on
                        ? 'glass-cta-amber text-white'
                        : 'glass-subcard text-white/70'
                    }`}
                  >
                    {tool}
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-sm font-bold text-white/70">飲食風格</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COOKING_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setPrefsDraft({ ...prefsDraft, style })}
                  className={`pressable min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
                    prefsDraft.style === style
                      ? 'glass-cta-amber text-white'
                      : 'glass-subcard text-white/70'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm font-bold text-white/70">
              忌口食材
              <input
                type="text"
                value={prefsDraft.avoid}
                onChange={(e) =>
                  setPrefsDraft({ ...prefsDraft, avoid: e.target.value })
                }
                placeholder="例如：花生、芫荽（逗號分隔）"
                className="glass-input mt-2"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-white/70">
                預設幾人份
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={8}
                  value={prefsDraft.defaultServings}
                  onChange={(e) =>
                    setPrefsDraft({
                      ...prefsDraft,
                      defaultServings: Math.min(
                        8,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className="glass-input mt-2"
                />
              </label>
              <label className="block text-sm font-bold text-white/70">
                預設煮幾餐
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={7}
                  value={prefsDraft.defaultMeals}
                  onChange={(e) =>
                    setPrefsDraft({
                      ...prefsDraft,
                      defaultMeals: Math.min(
                        7,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className="glass-input mt-2"
                />
              </label>
            </div>
            <GlassButton
              variant="amber"
              onClick={async () => {
                await setCookingPrefs(prefsDraft)
                setPrefs(prefsDraft)
                setPrefsOpen(false)
              }}
              className="pressable mt-5 min-h-[52px] w-full rounded-full py-3"
            >
              儲存偏好
            </GlassButton>
          </>
        )}
      </GlassModal>

      {/* 全屏下廚模式（fixed overlay 蓋住底部導航＋FAB） */}
      {cookRecipe && cookStep && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[linear-gradient(180deg,#0A0A0C_0%,#141210_100%)]">
          <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] md:max-w-3xl">
            {/* 頂：分段進度條＋返回／長著／朗讀 */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={exitCook}
                aria-label="離開下廚模式"
                className="glass-subcard pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              >
                <XIcon size={20} />
              </button>
              <div className="flex min-w-0 flex-1 gap-1">
                {cookSteps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < stepIdx
                        ? 'bg-[#14B8A6]'
                        : i === stepIdx
                          ? 'bg-[#FF9F0A]'
                          : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void toggleWake()}
                aria-label={wakeOn ? '關閉螢幕長著' : '開啟螢幕長著'}
                aria-pressed={wakeOn}
                className={`glass-subcard pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  wakeOn ? 'text-[#FF9F0A]' : 'text-white/70'
                }`}
              >
                <TimerIcon size={20} />
              </button>
              <button
                type="button"
                onClick={() => speak(cookStep.text)}
                aria-label="廣東話朗讀呢一步"
                className="glass-subcard pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/70"
              >
                <VolumeIcon size={20} />
              </button>
            </div>

            {/* 懸浮迷你計時條（切步後繼續倒數） */}
            {timer && (
              <div
                className={`glass-nav mt-3 flex items-center justify-between rounded-full px-4 py-2.5 ${
                  timerDone ? 'ring-2 ring-[#FF9F0A]' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                  <TimerIcon size={18} className="shrink-0 text-[#FF9F0A]" />
                  <span className="truncate">{timer.label}</span>
                </span>
                <span className="shrink-0 text-lg font-bold text-[#FF9F0A] tabular-nums">
                  {timerDone ? '夠鐘！' : fmtCountdown(timerRemaining)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTimer(null)
                    setTimerDone(false)
                    timerDoneRef.current = false
                  }}
                  className="pressable shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"
                >
                  停
                </button>
              </div>
            )}

            <h2 className="mt-4 truncate text-xl font-bold">
              {cookRecipe.name}
              <span className="ml-2 text-sm font-normal text-white/40 tabular-nums">
                {cookStep.isPrep
                  ? '前置備料'
                  : `第 ${stepIdx} / ${cookSteps.length - 1} 步`}
              </span>
            </h2>

            <div className="mt-3 flex flex-1 flex-col gap-4 md:grid md:grid-cols-[300px_1fr] md:items-start">
              {/* 左欄（展開版）／上層（摺埋版）：今步所需材料膠囊（可剔走） */}
              <div>
                <p className="text-sm font-bold text-white/70">
                  {cookStep.isPrep ? '前置備料 — 全部材料' : '今步所需材料'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {stepIngredients().map((ing) => {
                    const done = prepDone.has(ing.name)
                    return (
                      <button
                        key={ing.name}
                        type="button"
                        onClick={() =>
                          setPrepDone((prev) => {
                            const next = new Set(prev)
                            if (next.has(ing.name)) next.delete(ing.name)
                            else next.add(ing.name)
                            return next
                          })
                        }
                        aria-pressed={done}
                        className={`pressable min-h-[44px] rounded-full px-3.5 py-2 text-sm font-bold tabular-nums ${
                          done
                            ? 'bg-[#14B8A6]/25 text-teal-200 line-through opacity-70'
                            : 'glass-pill text-white/90'
                        }`}
                      >
                        {ing.name}
                        {ing.amount ? ` · ${ing.amount}` : ''}
                      </button>
                    )
                  })}
                </div>
                {cookStep.isPrep && (
                  <p className="mt-3 text-sm leading-relaxed text-white/50">
                    撳材料膠囊可以逐樣剔走，唔使記住邊樣搞掂咗。
                  </p>
                )}
                {/* 運行中計時器（展開版左欄固定顯示） */}
                {timer && (
                  <div className="glass-card mt-4 hidden p-4 text-center md:block">
                    <p className="text-xs font-bold text-white/50">
                      計緊時 · {timer.label}
                    </p>
                    <p className="mt-1 text-4xl font-bold text-[#FF9F0A] tabular-nums">
                      {timerDone ? '夠鐘！' : fmtCountdown(timerRemaining)}
                    </p>
                  </div>
                )}
              </div>

              {/* 右欄（展開版）／中層（摺埋版）：超大字步驟＋計時藥丸 */}
              <div className="flex flex-col">
                <GlassCard className="p-5">
                  <p className="text-2xl leading-relaxed font-bold md:text-3xl">
                    {cookStep.isPrep ? '前置備料' : `第 ${stepIdx} 步`}
                  </p>
                  <p className="mt-2 text-xl leading-relaxed md:text-2xl">
                    {cookStep.text}
                  </p>
                </GlassCard>
                {cookStep.timerMinutes > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      startStepTimer(cookStep.timerMinutes, cookStep.text)
                    }
                    className="glass-cta-amber pressable mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-full px-4 py-3 text-base font-bold text-white"
                  >
                    <TimerIcon size={20} />
                    {timer && !timerDone
                      ? `計緊時 ${fmtCountdown(timerRemaining)}`
                      : `一撳開始倒數 ${cookStep.timerMinutes} 分鐘`}
                  </button>
                )}
                {timerDone && (
                  <p className="mt-3 rounded-2xl bg-[#FF9F0A]/15 px-4 py-3 text-center font-bold text-amber-200">
                    夠鐘！可以做下一步啦。
                  </p>
                )}
              </div>
            </div>

            {/* 底層：上一步／下一步大玻璃掣；最後一步係記入卡路里 */}
            <div className="mt-6 flex gap-3">
              <GlassButton
                variant="glass"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                disabled={stepIdx === 0}
                className="pressable min-h-[56px] flex-1 rounded-full py-3 text-base"
              >
                ← 上一步
              </GlassButton>
              {stepIdx < cookSteps.length - 1 ? (
                <GlassButton
                  variant="amber"
                  onClick={() => setStepIdx((i) => i + 1)}
                  className="pressable min-h-[56px] flex-[1.4] rounded-full py-3 text-base"
                >
                  下一步 →
                </GlassButton>
              ) : (
                <GlassButton
                  variant="amber"
                  onClick={() => openLog(cookRecipe)}
                  className="pressable min-h-[56px] flex-[1.4] rounded-full py-3 text-base"
                >
                  煮好開餐！記入今日卡路里
                </GlassButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log 確認 Sheet */}
      <GlassModal
        open={logRecipe !== null}
        onClose={() => setLogRecipe(null)}
        variant="sheet"
      >
        {logRecipe && (
          <>
            <h3 className="text-lg font-bold">
              煮好開餐！記入今日卡路里
            </h3>
            <p className="mt-1 text-sm text-white/50">
              {logRecipe.name} · 每份 {logRecipe.calories} kcal
            </p>
            <p className="mt-4 text-sm font-bold text-white/70">
              今次實際食咗幾多份？
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PORTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLogPortions(p)}
                  className={`pressable min-h-[48px] rounded-full px-5 py-2.5 text-sm font-bold tabular-nums ${
                    logPortions === p
                      ? 'glass-cta-amber text-white'
                      : 'glass-subcard text-white/80'
                  }`}
                >
                  {p} 份
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-white/40 tabular-nums">
              即係約 {Math.round(logRecipe.calories * logPortions)} kcal ·
              蛋白質約 {round1(logRecipe.proteinG * logPortions)}g
            </p>
            <p className="mt-4 text-sm font-bold text-white/70">邊餐？</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLogMeal(m)}
                  className={`pressable min-h-[48px] rounded-full px-5 py-2.5 text-sm font-bold ${
                    logMeal === m
                      ? 'glass-cta-amber text-white'
                      : 'glass-subcard text-white/80'
                  }`}
                >
                  {MEAL_LABELS[m]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void onToggleRoast(!roastOn)}
              aria-pressed={roastOn}
              className="pressable glass-subcard mt-4 flex min-h-[52px] w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
            >
              <span className="text-sm font-bold">
                順便叫 AI 寸／讚我一句
                <span className="block text-xs font-normal text-white/40">
                  用而家揀緊嘅香港語氣，講一句廣東話
                </span>
              </span>
              <span
                className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                  roastOn ? 'bg-[#FF9F0A] justify-end' : 'bg-white/15'
                }`}
              >
                <span className="h-5 w-5 rounded-full bg-white" />
              </span>
            </button>
            {roastLoading && (
              <p className="mt-2 text-center text-sm text-white/50">
                AI 諗緊點寸你…
              </p>
            )}
            {roastOn && roastText && (
              <p className="glass-roast mt-2 rounded-2xl p-3 text-sm leading-relaxed">
                {roastText}
              </p>
            )}
            {logError && (
              <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
                {logError}
              </p>
            )}
            <GlassButton
              variant="amber"
              onClick={() => void confirmLog()}
              disabled={logging}
              className="pressable mt-5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full py-3 text-base"
            >
              <ChefHatIcon size={20} />
              {logging ? '寫緊入今日…' : '確認記入'}
            </GlassButton>
            <GlassButton
              variant="glass"
              onClick={() => void saveFavorite()}
              disabled={savingFav || logging}
              className="pressable mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full py-3 text-base text-white/85"
            >
              {savingFav ? '存緊入收藏…' : '⭐ 存入收藏（留待之後食先記）'}
            </GlassButton>
          </>
        )}
      </GlassModal>
    </div>
  )
}

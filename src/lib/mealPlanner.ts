// Meal Planner — AI 食譜生成 + 買餸清單合併邏輯（2026-11-23，v3 特批新增）。
// 重用現有 AI 設定：呼叫端傳入 getVisionConfig() 讀返嚟嘅 provider /
// apiKey / model / reasoningEffort，max_tokens 設 5000（vision.ts 嘅
// 4096 唔夠 6 款食譜連食材加步驟；reasoning 模型思考爆額會回空內容，
// 所以 reasoning 預設 'none' 時照樣唔送 reasoning 參數）。
// 唔郁 prompts.ts / vision.ts：呢度自帶獨立嘅 chat completion（text only），
// roast 只係借 tonePrompt 做 system prompt，唔改任何現有 prompt。

import {
  GROCERY_CATEGORIES,
  type CookingPrefs,
  type GroceryCategory,
  type GroceryItem,
  type Recipe,
  type RecipeIngredient,
  type VisionProviderConfig,
} from './db'

const MEAL_TIMEOUT_MS = 90_000
const MEAL_MAX_TOKENS = 5000

// ---------------------------------------------------------------------------
// Mock 食譜（離線示範菜單 — 唔依賴 LLM 都睇到晒四個畫面）
// 語義：食材份量／營養係「成個食譜（servings 人份）嘅總量」；
// 每份總數 = 食材總和 ÷ servings（卡上面顯示嘅數就係咁計出嚟）。
// ---------------------------------------------------------------------------

function ing(
  name: string,
  amount: number,
  unit: string,
  grams: number | null,
  category: GroceryCategory,
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  sugarG = 0,
  fiberG = 0,
  sodiumMg = 0,
): RecipeIngredient {
  return {
    name,
    amount,
    unit,
    grams,
    category,
    calories,
    proteinG,
    carbsG,
    fatG,
    sugarG,
    fiberG,
    sodiumMg,
  }
}

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 'mock-豉汁蒸排骨',
    name: '豉汁蒸排骨',
    servings: 2,
    prepMinutes: 15,
    cookMinutes: 20,
    calories: 161,
    proteinG: 12.5,
    carbsG: 6.1,
    fatG: 9.3,
    sugarG: 1.5,
    fiberG: 0.8,
    sodiumMg: 402,
    ingredients: [
      ing('排骨', 300, '克', 300, '肉類／海鮮', 210, 22, 0, 13),
      ing('豆豉', 1, '湯匙', 15, '乾貨／調味', 18, 1.5, 2, 0.5, 0, 1, 320),
      ing('蒜頭', 3, '瓣', 15, '乾貨／調味', 8, 0.3, 1.5, 0, 0, 0.2, 2),
      ing('薑', 3, '片', 10, '乾貨／調味', 3, 0.1, 0.6, 0, 0, 0.1, 1),
      ing('生抽', 1, '湯匙', 15, '乾貨／調味', 8, 0.8, 1, 0, 1, 0, 480),
      ing('糖', 0.5, '茶匙', 2, '乾貨／調味', 8, 0, 2, 0, 2, 0, 0),
      ing('生粉', 1, '茶匙', 5, '乾貨／調味', 18, 0, 4.5, 0, 0, 0, 0),
      ing('食油', 1, '茶匙', 5, '乾貨／調味', 45, 0, 0, 5),
      ing('蔥', 1, '條', 10, '蔬菜', 3, 0.2, 0.6, 0, 0, 0.2, 1),
    ],
    steps: [
      {
        text: '排骨洗淨瀝乾，加豆豉、蒜蓉、薑片、生抽、糖、生粉同食油撈勻，醃 15 分鐘。',
        ingredients: ['排骨', '豆豉', '蒜頭', '薑', '生抽', '糖', '生粉', '食油'],
        timerMinutes: 15,
      },
      {
        text: '排骨平鋪上碟，唔好疊埋一齊，否則中間唔熟。',
        ingredients: ['排骨'],
        timerMinutes: 0,
      },
      {
        text: '大火蒸 20 分鐘，熄火焗 2 分鐘，灑蔥花即成。',
        ingredients: ['排骨', '蔥'],
        timerMinutes: 20,
      },
    ],
    sharedTags: ['同冬菇蒸雞共用蒜頭、薑'],
    isFavorite: false,
    source: 'mock',
    createdAt: 1,
  },
  {
    id: 'mock-番茄炒蛋',
    name: '番茄炒蛋',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 8,
    calories: 111,
    proteinG: 6.2,
    carbsG: 7,
    fatG: 6.6,
    sugarG: 4,
    fiberG: 1.7,
    sodiumMg: 199,
    ingredients: [
      ing('雞蛋', 3, '隻', 150, '雪櫃凍品', 108, 9.5, 0.8, 7.5),
      ing('番茄', 2, '個', 300, '蔬菜', 54, 2.5, 10, 0.6, 6, 3, 15),
      ing('蔥', 1, '條', 10, '蔬菜', 3, 0.2, 0.6, 0, 0, 0.2, 1),
      ing('食油', 1, '湯匙', 15, '乾貨／調味', 45, 0, 0, 5),
      ing('糖', 0.5, '茶匙', 2, '乾貨／調味', 8, 0, 2, 0, 2, 0, 0),
      ing('鹽', 0.25, '茶匙', 1.5, '乾貨／調味', 0, 0, 0, 0, 0, 0, 380),
      ing('蒜頭', 1, '瓣', 5, '乾貨／調味', 3, 0.1, 0.5, 0, 0, 0.1, 1),
    ],
    steps: [
      {
        text: '雞蛋加少少鹽打勻；番茄切件，蔥切段。',
        ingredients: ['雞蛋', '鹽', '番茄', '蔥'],
        timerMinutes: 0,
      },
      {
        text: '落油，蛋液倒入鑊，輕輕推到半熟即刻上碟備用。',
        ingredients: ['雞蛋', '食油'],
        timerMinutes: 0,
      },
      {
        text: '原鑊爆香蒜頭，落番茄炒到出汁，加糖調味，倒回蛋一齊兜勻即成。',
        ingredients: ['番茄', '蒜頭', '糖', '雞蛋'],
        timerMinutes: 3,
      },
    ],
    sharedTags: ['同豉汁蒸排骨共用蒜頭、蔥'],
    isFavorite: false,
    source: 'mock',
    createdAt: 2,
  },
  {
    id: 'mock-蒜蓉西蘭花炒蝦仁',
    name: '蒜蓉西蘭花炒蝦仁',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 10,
    calories: 146,
    proteinG: 18,
    carbsG: 8.2,
    fatG: 3.8,
    sugarG: 1.3,
    fiberG: 3.2,
    sodiumMg: 327,
    ingredients: [
      ing('蝦仁', 200, '克', 200, '肉類／海鮮', 140, 28, 1, 1.5),
      ing('西蘭花', 250, '克', 250, '蔬菜', 85, 7, 12, 1, 2, 6, 30),
      ing('蒜頭', 4, '瓣', 20, '乾貨／調味', 10, 0.4, 2, 0, 0, 0.3, 2),
      ing('薑', 2, '片', 6, '乾貨／調味', 2, 0.1, 0.4, 0, 0, 0.1, 1),
      ing('食油', 1, '湯匙', 15, '乾貨／調味', 45, 0, 0, 5),
      ing('生抽', 0.5, '湯匙', 8, '乾貨／調味', 4, 0.4, 0.5, 0, 0.5, 0, 240),
      ing('料酒', 1, '茶匙', 5, '乾貨／調味', 5, 0, 0.5, 0, 0, 0, 0),
      ing('鹽', 0.25, '茶匙', 1.5, '乾貨／調味', 0, 0, 0, 0, 0, 0, 380),
    ],
    steps: [
      {
        text: '蝦仁用料酒、少少鹽醃 10 分鐘；西蘭花切細朵，蒜頭切蓉。',
        ingredients: ['蝦仁', '料酒', '鹽', '西蘭花', '蒜頭'],
        timerMinutes: 10,
      },
      {
        text: '滾水加少少鹽，西蘭花焯 2 分鐘撈起瀝乾。',
        ingredients: ['西蘭花', '鹽'],
        timerMinutes: 2,
      },
      {
        text: '落油爆香蒜蓉、薑片，蝦仁炒到轉色，加西蘭花、生抽兜勻即成。',
        ingredients: ['食油', '蒜頭', '薑', '蝦仁', '西蘭花', '生抽'],
        timerMinutes: 4,
      },
    ],
    sharedTags: ['高蛋白 · 同排骨共用蒜頭、薑'],
    isFavorite: false,
    source: 'mock',
    createdAt: 3,
  },
  {
    id: 'mock-冬菇蒸雞',
    name: '冬菇蒸雞',
    servings: 2,
    prepMinutes: 15,
    cookMinutes: 18,
    calories: 156,
    proteinG: 16.8,
    carbsG: 6.9,
    fatG: 6.7,
    sugarG: 0.8,
    fiberG: 1,
    sodiumMg: 336,
    ingredients: [
      ing('雞腿肉', 300, '克', 300, '肉類／海鮮', 195, 30, 0, 8),
      ing('冬菇', 6, '隻', 90, '蔬菜', 30, 2, 5, 0.3, 0, 1.5, 8),
      ing('薑', 3, '片', 10, '乾貨／調味', 3, 0.1, 0.6, 0, 0, 0.1, 1),
      ing('蒜頭', 2, '瓣', 10, '乾貨／調味', 5, 0.2, 1, 0, 0, 0.1, 1),
      ing('生抽', 1, '湯匙', 15, '乾貨／調味', 8, 0.8, 1, 0, 1, 0, 480),
      ing('蠔油', 1, '茶匙', 5, '乾貨／調味', 5, 0.2, 1, 0, 0.5, 0, 180),
      ing('生粉', 1, '茶匙', 5, '乾貨／調味', 18, 0, 4.5, 0, 0, 0, 0),
      ing('食油', 1, '茶匙', 5, '乾貨／調味', 45, 0, 0, 5),
      ing('蔥', 1, '條', 10, '蔬菜', 3, 0.2, 0.6, 0, 0, 0.2, 1),
    ],
    steps: [
      {
        text: '雞腿肉切件，加薑片、蒜蓉、生抽、蠔油、生粉、食油撈勻醃 15 分鐘；冬菇浸軟去蒂切片。',
        ingredients: ['雞腿肉', '薑', '蒜頭', '生抽', '蠔油', '生粉', '食油', '冬菇'],
        timerMinutes: 15,
      },
      {
        text: '雞件同冬菇平鋪上碟，大火蒸 18 分鐘。',
        ingredients: ['雞腿肉', '冬菇'],
        timerMinutes: 18,
      },
      {
        text: '熄火焗 2 分鐘，灑蔥花即成。',
        ingredients: ['蔥'],
        timerMinutes: 2,
      },
    ],
    sharedTags: ['同排骨共用蒜頭、薑、蔥'],
    isFavorite: false,
    source: 'mock',
    createdAt: 4,
  },
]

// ---------------------------------------------------------------------------
// 買餸合併
// ---------------------------------------------------------------------------

/** 常備料：預設標「屋企已有」，用戶可以逐樣改返「要買」。 */
export const PANTRY_STAPLES = new Set([
  '食油',
  '鹽',
  '糖',
  '生抽',
  '老抽',
  '蠔油',
  '料酒',
  '生粉',
  '蒜頭',
  '薑',
  '蔥',
  '胡椒粉',
  '豆豉',
])

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function fmtAmount(amount: number, unit: string): string {
  const a = Math.round(amount * 100) / 100
  return `${a} ${unit}`
}

/**
 * 將已選菜式（每款 × 計劃份數 ÷ 食譜份數）嘅食材合併：
 * 同名＋同單位先加總；分類按 GROCERY_CATEGORIES 順序排；
 * 常備料預設 status 'have'，其餘 'to_buy'。
 * fridgeHave：用戶輸入嘅屋企現有食材（清雪櫃模式）——寬鬆比對中
 * 咗嘅都標 'have'，唔會再叫用戶去買。
 */
export function mergeGrocery(
  picks: Array<{ recipe: Recipe; servings: number }>,
  fridgeHave: string[] = [],
): Omit<GroceryItem, 'id' | 'createdAt'>[] {
  const map = new Map<string, Omit<GroceryItem, 'id' | 'createdAt'>>()
  for (const { recipe, servings } of picks) {
    const factor = servings / Math.max(1, recipe.servings)
    for (const ing of recipe.ingredients) {
      const key = `${ing.name}｜${ing.unit}`
      const existing = map.get(key)
      const amount = round1(ing.amount * factor)
      const grams =
        ing.grams !== null ? Math.round(ing.grams * factor) : null
      if (existing) {
        existing.amount = round1(existing.amount + amount)
        existing.grams =
          existing.grams !== null && grams !== null
            ? existing.grams + grams
            : (existing.grams ?? grams)
        if (!existing.sources.includes(recipe.name)) {
          existing.sources.push(recipe.name)
        }
      } else {
        map.set(key, {
          name: ing.name,
          amount,
          unit: ing.unit,
          grams,
          category: ing.category,
          status: PANTRY_STAPLES.has(ing.name) ? 'have' : 'to_buy',
          sources: [recipe.name],
        })
      }
    }
  }
  const order = new Map(GROCERY_CATEGORIES.map((c, i) => [c, i]))
  // 清雪櫃：輸入過嘅現有食材自動歸「屋企已有」（常備料本身已經係 have）。
  if (fridgeHave.length > 0) {
    for (const item of map.values()) {
      if (
        item.status !== 'have' &&
        matchesFridgeItem(item.name, fridgeHave)
      ) {
        item.status = 'have'
      }
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.name.localeCompare(b.name, 'zh-HK'),
  )
}

/** 將輸入框文字切成食材清單：逗號／頓號／空格／換行分隔，trim 後去重。 */
export function parseFridgeInput(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[,，、\s\n]+/)) {
    const t = part.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

function normName(s: string): string {
  return s.trim().replace(/\s+/g, '')
}

/** 寬鬆比對：食材名包含／被包含輸入嘅食材都算屋企有（「三文魚」對到「三文魚柳」）。 */
export function matchesFridgeItem(
  ingredientName: string,
  fridgeItems: string[],
): boolean {
  const n = normName(ingredientName)
  if (!n) return false
  return fridgeItems.some((f) => {
    const m = normName(f)
    return m.length > 0 && (n.includes(m) || m.includes(n))
  })
}

/** 由同一批食材計「共用食材」標籤：出現喺 ≥2 款菜嘅食材名。 */
export function sharedIngredientTags(
  recipes: Recipe[],
): Map<string, string[]> {
  const counts = new Map<string, Set<string>>()
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const s = counts.get(ing.name) ?? new Set<string>()
      s.add(r.name)
      counts.set(ing.name, s)
    }
  }
  const out = new Map<string, string[]>()
  for (const r of recipes) {
    const shared = r.ingredients
      .map((i) => i.name)
      .filter((n) => (counts.get(n)?.size ?? 0) >= 2)
    out.set(r.id, [...new Set(shared)])
  }
  return out
}

// ---------------------------------------------------------------------------
// LLM：食譜生成 + Roast（一句）
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

async function chatJson<T>(
  config: VisionProviderConfig,
  messages: ChatMessage[],
  validate: (x: unknown) => x is T,
  onProgress?: (message: string) => void,
): Promise<T> {
  if (!config.apiKey.trim()) {
    throw new Error('未設定 API Key，請去設定頁輸入。')
  }
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey.trim()}`,
  }
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'CaLoMei Clone'
  }
  const effort = config.reasoningEffort ?? 'none'
  const withReasoning =
    config.provider === 'openrouter' && effort !== 'default'
  const base = {
    model: config.model,
    messages,
    temperature: 0.7,
    max_tokens: MEAL_MAX_TOKENS,
    ...(withReasoning ? { reasoning: { effort } } : {}),
  }
  const attempts = [
    { ...base, response_format: { type: 'json_object' } },
    // 有啲模型唔接受 reasoning: { effort: 'none' }（400）——去咗佢再試一次。
    { ...base, response_format: { type: 'json_object' } },
  ]
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const body: Record<string, unknown> = { ...attempts[attempt] }
    if (attempt === 1) delete body.reasoning
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), MEAL_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        lastError = new Error(
          text ? `API 錯誤（HTTP ${res.status}）：${text.slice(0, 200)}` : `API 錯誤（HTTP ${res.status}）`,
        )
        if (res.status === 400 && attempt === 0) {
          onProgress?.('模型唔接受 reasoning 參數，移除咗再試…')
          continue
        }
        throw lastError
      }
      const data = (await res.json()) as unknown
      const choice = isRecord(data)
        ? (data.choices as Array<{ message?: { content?: string | null } }>)?.[0]
        : undefined
      const text = choice?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        const finish = isRecord(data)
          ? (data.choices as Array<{ finish_reason?: string }>)?.[0]
              ?.finish_reason
          : undefined
        lastError = new Error(
          `模型無回傳內容${finish ? `（finish_reason=${finish}）` : ''}，可能係 max_tokens 唔夠 reasoning 用；請去設定頁將 reasoning 設為 none 再試。`,
        )
        if (attempt === 0) continue
        throw lastError
      }
      const parsed: unknown = JSON.parse(text)
      if (!validate(parsed)) throw new Error('回傳 JSON 格式唔啱')
      return parsed as T
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('請求超時（90 秒），請再試一次。')
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === attempts.length - 1) throw lastError
    } finally {
      window.clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('未知錯誤')
}

const RECIPE_SYSTEM = `你係一個香港家常菜食譜策劃人，識計營養。只輸出一個 JSON，唔好加任何其他文字。`

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normaliseRecipe(r: Record<string, unknown>): Recipe {
  const ingredients = (
    Array.isArray(r.ingredients) ? r.ingredients : []
  ).map((raw) => {
    const i = isRecord(raw) ? raw : {}
    const catRaw = str(i.category)
    const category: GroceryCategory = (
      GROCERY_CATEGORIES as string[]
    ).includes(catRaw)
      ? (catRaw as GroceryCategory)
      : '其他'
    return {
      name: str(i.name) || '食材',
      amount: num(i.amount, 1),
      unit: str(i.unit) || '克',
      grams: i.grams === null || i.grams === undefined ? null : num(i.grams),
      category,
      calories: num(i.calories),
      proteinG: num(i.proteinG),
      carbsG: num(i.carbsG),
      fatG: num(i.fatG),
      sugarG: num(i.sugarG),
      fiberG: num(i.fiberG),
      sodiumMg: num(i.sodiumMg),
    } satisfies RecipeIngredient
  })
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((raw) => {
    const s = isRecord(raw) ? raw : {}
    return {
      text: str(s.text) || '按食譜做。',
      ingredients: Array.isArray(s.ingredients)
        ? (s.ingredients.filter((v) => typeof v === 'string') as string[])
        : [],
      timerMinutes: num(s.timerMinutes),
    }
  })
  const totals = ingredients.reduce(
    (a, i) => ({
      calories: a.calories + i.calories,
      proteinG: a.proteinG + i.proteinG,
      carbsG: a.carbsG + i.carbsG,
      fatG: a.fatG + i.fatG,
      sugarG: a.sugarG + i.sugarG,
      fiberG: a.fiberG + i.fiberG,
      sodiumMg: a.sodiumMg + i.sodiumMg,
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
  // 每份總數一律由食材總和 ÷ servings 計出（唔用模型自己報嘅每份數，
  // 避免模型將食材當成每份份量、又將每份總數當成成碟總數，兩邊唔夾）。
  const perServing = (total: number, modelValue: number): number =>
    total > 0 ? total : modelValue
  const div = Math.max(1, Math.round(num(r.servings, 2)))
  return {
    id: crypto.randomUUID(),
    name: str(r.name) || '未命名菜式',
    servings: div,
    prepMinutes: Math.round(num(r.prepMinutes, 10)),
    cookMinutes: Math.round(num(r.cookMinutes, 15)),
    calories: Math.round(perServing(totals.calories, num(r.calories)) / div),
    proteinG: round1(perServing(totals.proteinG, num(r.proteinG)) / div),
    carbsG: round1(perServing(totals.carbsG, num(r.carbsG)) / div),
    fatG: round1(perServing(totals.fatG, num(r.fatG)) / div),
    sugarG: round1(perServing(totals.sugarG, num(r.sugarG)) / div),
    fiberG: round1(perServing(totals.fiberG, num(r.fiberG)) / div),
    sodiumMg: Math.round(perServing(totals.sodiumMg, num(r.sodiumMg)) / div),
    ingredients,
    steps:
      steps.length > 0
        ? steps
        : [{ text: '按食材份量煮熟即成。', ingredients: [], timerMinutes: 0 }],
    sharedTags: Array.isArray(r.sharedTags)
      ? (r.sharedTags.filter((v) => typeof v === 'string') as string[])
      : [],
    isFavorite: false,
    source: 'ai',
    createdAt: Date.now(),
  }
}

export interface GenerateRecipesInput {
  prefs: CookingPrefs
  /** 今日剩餘卡路里（約數，供 AI 配菜參考）。 */
  remainingKcal: number
  /** 今日剩餘蛋白質目標（克，約數）。 */
  remainingProteinG: number
  /** 屋企雪櫃現有食材（已 trim 去重）；留空 = 按偏好自由推送。 */
  fridgeItems?: string[]
  /** 'strict' 只用現有食材；'flexible' 現有為主＋可加 1–3 樣配料。 */
  fridgeMode?: 'strict' | 'flexible'
}

/**
 * 生成 6 款香港街市／超市易買齊料嘅家常／帶飯菜式。回傳已正規化嘅
 * Recipe[]；parse / 驗證失敗會掟出可讀錯誤，唔會 crash。
 */
export async function generateRecipes(
  config: VisionProviderConfig,
  input: GenerateRecipesInput,
  onProgress?: (message: string) => void,
): Promise<Recipe[]> {
  const avoid = input.prefs.avoid.trim()
  const fridge = (input.fridgeItems ?? []).filter(Boolean)
  const fridgeBlock =
    fridge.length === 0
      ? ''
      : input.fridgeMode === 'strict'
        ? `清雪櫃模式（只用現有食材）：屋企而家有 ${fridge.join('、')}。只可以用呢啲食材＋屋企基礎常備調味（油、鹽、豉油、蒜、薑、糖、生粉等），嚴禁要求買新肉新菜；如果呢啲食材唔夠砌成 6 款，就出少啲款（例如 3–4 款），唔好為湊數而編造新食材。`
        : `清雪櫃模式（現有為主＋可加料）：屋企而家有 ${fridge.join('、')}，請以佢哋做主角；每款菜容許額外配搭 1–3 樣香港街市／超市易買嘅新鮮配料，令菜式豐富啲。`
  const userPrompt = `請生成 6 款香港家常／帶飯菜式（${input.prefs.style}，${input.prefs.defaultServings} 人份，${input.prefs.defaultMeals} 餐嘅量）。
今日剩餘卡路里約 ${Math.max(0, Math.round(input.remainingKcal))} kcal、剩餘蛋白質約 ${Math.max(0, Math.round(input.remainingProteinG))} 克，請將每份卡路里控制喺合理範圍，蛋白質盡量夠。
廚具：${input.prefs.tools.join('、') || '一般廚具'}。${avoid ? `忌口食材（絕對唔可以用）：${avoid}。` : ''}
${fridgeBlock}
要求：
- 全部食材要喺香港街市／超市容易買齊；幾款菜盡量共用新鮮食材（例如同一批蒜頭、薑、蔥、雞肉分幾味用），減少廚餘。
- 單位用香港慣用：克、両、條、隻、湯匙、茶匙、個。
- 每款菜：名稱（廣東話）、備料分鐘、烹調分鐘、每份卡路里＋蛋白質／碳水／脂肪／糖／纖維／鈉、食材清單（每樣：名稱、份量數字、單位、克數或 null、買餸分類：肉類／海鮮、蔬菜、雪櫃凍品、乾貨／調味、其他、該食材喺成碟嘅卡路里＋6 項營養）、步驟（每步：文字、呢步用嘅食材名陣列、計時分鐘數 0 或正整數；醃肉、蒸、焗要有計時）。
- 份量語義（好重要）：食材份量係「成個食譜（servings 人份）嘅總量」，唔係每份嘅量；每份卡路里＋營養 = 全部食材加埋再 ÷ servings。
只輸出以下格式嘅 JSON，唔加其他文字：
{"recipes": [{"name": "…", "servings": 2, "prepMinutes": 10, "cookMinutes": 15, "calories": 300, "proteinG": 25, "carbsG": 8, "fatG": 18, "sugarG": 2, "fiberG": 2, "sodiumMg": 500, "ingredients": [{"name": "雞腿肉", "amount": 300, "unit": "克", "grams": 300, "category": "肉類／海鮮", "calories": 195, "proteinG": 30, "carbsG": 0, "fatG": 8, "sugarG": 0, "fiberG": 0, "sodiumMg": 100}], "steps": [{"text": "…", "ingredients": ["雞腿肉"], "timerMinutes": 15}], "sharedTags": []}]}`
  const result = await chatJson<{ recipes: Record<string, unknown>[] }>(
    config,
    [
      { role: 'system', content: RECIPE_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    (x): x is { recipes: Record<string, unknown>[] } =>
      isRecord(x) &&
      Array.isArray(x.recipes) &&
      x.recipes.length > 0 &&
      x.recipes.every((r) => isRecord(r)),
    onProgress,
  )
  const recipes = result.recipes
    .map((r) => normaliseRecipe(r))
    .filter((r) => r.ingredients.length > 0 && r.steps.length > 0)
  if (recipes.length === 0) {
    throw new Error('AI 回傳嘅食譜無可用食材／步驟，請再試一次。')
  }
  return recipes
}

/** 煮完嗰句廣東話 Roast：用現有 tonePrompt 做 system prompt，一句就夠。 */
export async function generateCookRoast(
  config: VisionProviderConfig,
  tonePrompt: string,
  dishName: string,
  portions: number,
): Promise<string> {
  const result = await chatJson<{ roast_comment: string }>(
    config,
    [
      {
        role: 'system',
        content: `${tonePrompt}\n\n你而家唔係分析相，係評一句用戶親手煮好嘅餸。只輸出一個 JSON {"roast_comment": "…"}，一至兩句廣東話，唔加其他文字。`,
      },
      {
        role: 'user',
        content: `用戶啱啱煮好「${dishName}」，食咗 ${portions} 份。寸佢或者讚佢一句，要提返呢味餸，唔好講空話。`,
      },
    ],
    (x): x is { roast_comment: string } =>
      isRecord(x) && typeof x.roast_comment === 'string',
  )
  return result.roast_comment.trim()
}

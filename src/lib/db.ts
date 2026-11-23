// Dexie (IndexedDB) database — schema mirrors CLONE_SPEC.md §4, which was
// extracted from the original app's Room entities (same table + field names,
// camelCase). Field names are kept identical so the spec stays the source of
// truth. One addition: `settings` (key-value) for provider config, tone and
// custom prompts, and `imageDataUrl` on food_entries (a PWA has no local
// file path; the compressed JPEG is stored as a data URL).

import Dexie, { type EntityTable } from 'dexie'

export interface UserProfile {
  id: string
  name: string
  gender: string
  /** Epoch ms; 0 = unknown (age defaults to 25). */
  birthday: number
  heightCM: number
  weightKG: number
  targetWeightKG: number | null
  activityLevel: string
  goal: string
  currentStreak: number
  longestStreak: number
  lastLogDate: number | null
  streakBrokenShown: boolean
  streakEarnedDatesJson: string
  createdAt: number
  onboardingCompleted: boolean
  toneMode: string
  region: string
  colorTheme: string
  breakfastTime: string
  lunchTime: string
  dinnerTime: string
}

export interface FoodComponent {
  nameZH: string
  nameEN: string
  portionDescription: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  confidence: number
  isExcluded: boolean
  /** v1.7.0: sugar / fiber / sodium per item (g / g / mg). Optional so old
   * componentsJson without them still loads — treat missing as 0. */
  sugarG?: number
  fiberG?: number
  sodiumMg?: number
}

export interface FoodEntry {
  id: string
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servingSize: string
  mealType: string
  /** Epoch ms of the meal day. */
  date: number
  createdAt: number
  imagePath?: string | null
  /** Compressed JPEG data URL (from Canvas compression). */
  imageDataUrl?: string | null
  /** JSON of FoodComponent[]. */
  componentsJson?: string | null
  /** 'scanning' | 'done' | 'failed' */
  scanStatus?: string | null
  roastComment?: string | null
  roastEmoji?: string | null
  aiOriginalName?: string | null
  aiOriginalComponentsJson?: string | null
  /** v1.7.0 totals (like proteinG etc.). Optional — old entries lack them. */
  sugarG?: number
  fiberG?: number
  sodiumMg?: number
  /** v1.7.0: whether this roast can be rebutted. Default true when absent. */
  rebuttable?: boolean
  /** JSON array of previous roast comments for this entry (oldest first),
   * appended on each rebuttal. Feeds `previous_roasts` on later scans. */
  roastHistoryJson?: string | null
}

export interface WeightEntry {
  id: string
  weightKG: number
  date: number
  createdAt: number
}

export interface SavedFood {
  id: string
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servingSize: string
  createdAt: number
  /** v4 (2026-11-23): 完整 7 項營養素＋逐樣食材。全部可選 — 舊收藏
   * 無呢啲欄位，讀取嗰陣 fallback（糖／纖維／鈉當 0，食材清單當單項），
   * 所以係 unindexed props，唔使 data migration。 */
  sugarG?: number
  fiberG?: number
  sodiumMg?: number
  /** JSON of FoodComponent[]（同 food_entries.componentsJson 同一格式）。 */
  componentsJson?: string
}

export interface FoodCollection {
  id: string
  remoteId?: string | null
  userId?: string | null
  name: string
  description?: string | null
  isPublic: boolean
  isImported: boolean
  createdAt: number
  updatedAt: number
}

export interface FoodCollectionItem {
  id: string
  collectionId: string
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servingSize: string
  sortOrder: number
  createdAt: number
}

/** v1.7.0 water_entries — one row per drink. */
export interface WaterEntry {
  id: string
  /** Millilitres drunk. */
  amountML: number
  /** Epoch ms of the drink. */
  date: number
  createdAt: number
}

/**
 * v1.7.0 exercise_entries — simple manual log (Kong's choice: name,
 * minutes and calories burned only, no MET library).
 */
export interface ExerciseEntry {
  id: string
  name: string
  exerciseType: string
  durationMinutes: number
  caloriesBurned: number
  /** Epoch ms of the workout. */
  date: number
  createdAt: number
}

/** v1.7.0 body_fat_entries — one row per body-fat reading. */
export interface BodyFatEntry {
  id: string
  bodyFatPercentage: number
  /** Epoch ms of the reading. */
  date: number
  createdAt: number
  /** Optional extras (unindexed props — no Dexie migration needed). */
  muscleRate?: number | null
  visceralFat?: number | null
}

/**
 * v1.7.0 nutrition_target_overrides — a single active row (id 'default').
 * Every field is nullable: null means "use the Mifflin-St Jeor default".
 * Sugar is a ceiling, fiber is a floor, sodium is a ceiling.
 */
export interface NutritionTargetOverride {
  id: string
  effectiveFrom: number
  updatedAt: number
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  sugarCeilingG: number | null
  fiberFloorG: number | null
  sodiumCeilingMg: number | null
}

export function defaultTargetOverride(): NutritionTargetOverride {
  return {
    id: 'default',
    effectiveFrom: Date.now(),
    updatedAt: Date.now(),
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    sugarCeilingG: null,
    fiberFloorG: null,
    sodiumCeilingMg: null,
  }
}

export interface Setting {
  key: string
  value: string
}

// ---- Meal Planner (2026-11-23, v3) ----

export type GroceryCategory =
  | '肉類／海鮮'
  | '蔬菜'
  | '雪櫃凍品'
  | '乾貨／調味'
  | '其他'

export const GROCERY_CATEGORIES: GroceryCategory[] = [
  '肉類／海鮮',
  '蔬菜',
  '雪櫃凍品',
  '乾貨／調味',
  '其他',
]

export interface RecipeIngredient {
  name: string
  /** 份量數字（成個食譜、即 servings 人份嘅總量；每份 = 總量 ÷ servings）。 */
  amount: number
  unit: string
  /** 克數（成個食譜總量，有就填；無就 null）。 */
  grams: number | null
  category: GroceryCategory
  /** 該食材喺成個食譜嘅卡路里＋營養（加埋 ÷ servings ≈ 每份總數）。 */
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  sugarG: number
  fiberG: number
  sodiumMg: number
}

export interface RecipeStep {
  text: string
  /** 呢一步會用到嘅食材名（對應 ingredients[].name）。 */
  ingredients: string[]
  /** 計時分鐘數；0 = 唔使計時。 */
  timerMinutes: number
}

export interface Recipe {
  id: string
  name: string
  /** 每份份量人數（食譜本身幾人份）。 */
  servings: number
  prepMinutes: number
  cookMinutes: number
  /** 每份營養。 */
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  sugarG: number
  fiberG: number
  sodiumMg: number
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  /** 共用食材小標籤（例如「同排骨共用蒜頭」由 UI 計出；呢度存 AI 建議嘅標籤）。 */
  sharedTags: string[]
  isFavorite: boolean
  /** 'ai' | 'mock' | 'custom' */
  source: string
  createdAt: number
}

export interface MealPlanItem {
  id: string
  recipeId: string
  /** 計劃煮幾份。 */
  servings: number
  status: 'planned' | 'cooking' | 'done'
  createdAt: number
}

export type GroceryStatus = 'have' | 'to_buy' | 'bought'

export interface GroceryItem {
  id: string
  name: string
  amount: number
  unit: string
  grams: number | null
  category: GroceryCategory
  status: GroceryStatus
  /** 來源菜式名。 */
  sources: string[]
  createdAt: number
}

export interface CookingPrefs {
  tools: string[]
  style: string
  avoid: string
  defaultServings: number
  defaultMeals: number
}

export const COOKING_TOOLS = [
  '平底鑊',
  '氣炸鍋',
  '微波爐／叮菜盒',
  '蒸爐',
  '電飯煲',
]

export const COOKING_STYLES = [
  '減脂高蛋白',
  '少油清淡',
  '工作日帶飯',
  '快手 15 分鐘',
  '家常慢煮',
]

export function defaultCookingPrefs(): CookingPrefs {
  return {
    tools: ['平底鑊', '蒸爐'],
    style: '減脂高蛋白',
    avoid: '',
    defaultServings: 2,
    defaultMeals: 3,
  }
}

export type VisionProvider = 'openrouter' | 'openai' | 'gemini'

export interface VisionProviderConfig {
  provider: VisionProvider
  baseUrl: string
  apiKey: string
  model: string
  /**
   * OpenRouter reasoning effort (2026-11-21 fix for 「模型無回傳內容」):
   * 'none' (default — disable reasoning, avoids reasoning tokens eating
   * max_tokens), 'low' (light reasoning), 'default' (omit the reasoning
   * parameter entirely, let the model decide). Only sent to OpenRouter.
   */
  reasoningEffort?: 'none' | 'low' | 'default'
}

export const PROVIDER_PRESETS: Record<
  VisionProvider,
  { label: string; baseUrl: string; model: string }
> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
  },
}

export const DEFAULT_VISION_CONFIG: VisionProviderConfig = {
  provider: 'openrouter',
  baseUrl: PROVIDER_PRESETS.openrouter.baseUrl,
  apiKey: '',
  model: PROVIDER_PRESETS.openrouter.model,
  reasoningEffort: 'none',
}

export function defaultProfile(): UserProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    gender: '男',
    birthday: 0,
    heightCM: 170,
    weightKG: 65,
    targetWeightKG: null,
    activityLevel: '輕度運動',
    goal: '減脂',
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    streakBrokenShown: false,
    streakEarnedDatesJson: '[]',
    createdAt: Date.now(),
    onboardingCompleted: false,
    toneMode: 'normal',
    region: 'hk',
    colorTheme: 'amber',
    breakfastTime: '08:00',
    lunchTime: '12:30',
    dinnerTime: '19:00',
  }
}

class CaLoMeiDb extends Dexie {
  user_profiles!: EntityTable<UserProfile, 'id'>
  food_entries!: EntityTable<FoodEntry, 'id'>
  weight_entries!: EntityTable<WeightEntry, 'id'>
  saved_foods!: EntityTable<SavedFood, 'id'>
  food_collections!: EntityTable<FoodCollection, 'id'>
  food_collection_items!: EntityTable<FoodCollectionItem, 'id'>
  water_entries!: EntityTable<WaterEntry, 'id'>
  exercise_entries!: EntityTable<ExerciseEntry, 'id'>
  body_fat_entries!: EntityTable<BodyFatEntry, 'id'>
  nutrition_target_overrides!: EntityTable<NutritionTargetOverride, 'id'>
  settings!: EntityTable<Setting, 'key'>
  recipes!: EntityTable<Recipe, 'id'>
  meal_plans!: EntityTable<MealPlanItem, 'id'>
  grocery_items!: EntityTable<GroceryItem, 'id'>

  constructor() {
    super('calomei')
    this.version(1).stores({
      user_profiles: 'id',
      food_entries: 'id, date, mealType, createdAt',
      weight_entries: 'id, date',
      saved_foods: 'id',
      food_collections: 'id',
      food_collection_items: 'id, collectionId',
      settings: 'key',
    })
    // v2 (2026-11-21, v1.7.0 port): 4 new tables. Dexie adds the tables
    // and keeps every v1 row — new fields on food_entries are unindexed
    // props, so no data migration is needed. version(2).stores() must list
    // the FULL schema, not just the delta.
    this.version(2).stores({
      user_profiles: 'id',
      food_entries: 'id, date, mealType, createdAt',
      weight_entries: 'id, date',
      saved_foods: 'id',
      food_collections: 'id',
      food_collection_items: 'id, collectionId',
      water_entries: 'id, date',
      exercise_entries: 'id, date',
      body_fat_entries: 'id, date',
      nutrition_target_overrides: 'id, effectiveFrom',
      settings: 'key',
    })
    // v3 (2026-11-23, Meal Planner): 3 new tables only — old tables
    // untouched, so v2 data opens as-is. All new-table queries must use
    // indexed fields only (2026-11-21 black-screen lesson).
    this.version(3).stores({
      user_profiles: 'id',
      food_entries: 'id, date, mealType, createdAt',
      weight_entries: 'id, date',
      saved_foods: 'id',
      food_collections: 'id',
      food_collection_items: 'id, collectionId',
      water_entries: 'id, date',
      exercise_entries: 'id, date',
      body_fat_entries: 'id, date',
      nutrition_target_overrides: 'id, effectiveFrom',
      settings: 'key',
      recipes: 'id, createdAt, isFavorite',
      meal_plans: 'id, recipeId, status',
      grocery_items: 'id, category, status, createdAt',
    })
    // v4 (2026-11-23, SavedFood 完整營養素)：stores 同 v3 一模一樣，只係
    // 版本號＋1 — SavedFood 新加嘅 sugarG／fiberG／sodiumMg／
    // componentsJson 全部係 unindexed 可選 props，舊行唔使 migration，
    // 讀取嗰陣 fallback（見 AddSheet／ResultPage）；Dexie 升版唔會清資料。
    // version(4).stores() 必須列出 FULL schema，唔係淨係 delta。
    this.version(4).stores({
      user_profiles: 'id',
      food_entries: 'id, date, mealType, createdAt',
      weight_entries: 'id, date',
      saved_foods: 'id',
      food_collections: 'id',
      food_collection_items: 'id, collectionId',
      water_entries: 'id, date',
      exercise_entries: 'id, date',
      body_fat_entries: 'id, date',
      nutrition_target_overrides: 'id, effectiveFrom',
      settings: 'key',
      recipes: 'id, createdAt, isFavorite',
      meal_plans: 'id, recipeId, status',
      grocery_items: 'id, category, status, createdAt',
    })
  }
}

export const db = new CaLoMeiDb()

// ---- settings helpers (JSON values) ----

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value: JSON.stringify(value) })
}

export async function getVisionConfig(): Promise<VisionProviderConfig> {
  // Merge over the defaults so configs saved before a new field existed
  // (e.g. reasoningEffort) still get the current default.
  const stored = await getSetting<VisionProviderConfig>(
    'vision',
    DEFAULT_VISION_CONFIG,
  )
  return { ...DEFAULT_VISION_CONFIG, ...stored }
}

export async function getOrCreateProfile(): Promise<UserProfile> {
  const existing = await db.user_profiles.toArray()
  if (existing.length > 0) return existing[0]
  const profile = defaultProfile()
  await db.user_profiles.add(profile)
  return profile
}

/** Custom tone prompt override, or null when the default is in use. */
export async function getTonePromptOverride(
  tone: string,
): Promise<string | null> {
  return getSetting<string | null>(`prompt_${tone}`, null)
}

export async function setTonePromptOverride(
  tone: string,
  prompt: string,
): Promise<void> {
  await setSetting(`prompt_${tone}`, prompt)
}

export async function resetTonePromptOverride(tone: string): Promise<void> {
  await db.settings.delete(`prompt_${tone}`)
}

/** iOS Shortcut name used for the Apple Health export (Settings). */
export const DEFAULT_HEALTH_SHORTCUT_NAME = 'CaLoMeiToHealth'

export type ThemeMode = 'dark' | 'light'

/** Dark is the default (matches the original app's dark theme). */
export async function getTheme(): Promise<ThemeMode> {
  return getSetting<ThemeMode>('theme', 'dark')
}

export async function setTheme(theme: ThemeMode): Promise<void> {
  await setSetting('theme', theme)
}

export async function getHealthShortcutName(): Promise<string> {
  return getSetting<string>(
    'healthShortcutName',
    DEFAULT_HEALTH_SHORTCUT_NAME,
  )
}

export async function setHealthShortcutName(name: string): Promise<void> {
  await setSetting(
    'healthShortcutName',
    name.trim() || DEFAULT_HEALTH_SHORTCUT_NAME,
  )
}

/** The single active custom-targets row, or null when defaults apply. */
export async function getTargetOverride(): Promise<NutritionTargetOverride | null> {
  const row = await db.nutrition_target_overrides.get('default')
  return row ?? null
}

export async function setTargetOverride(
  patch: Partial<Omit<NutritionTargetOverride, 'id' | 'updatedAt'>>,
): Promise<NutritionTargetOverride> {
  const existing = await getTargetOverride()
  const next: NutritionTargetOverride = {
    ...(existing ?? defaultTargetOverride()),
    ...patch,
    id: 'default',
    updatedAt: Date.now(),
  }
  await db.nutrition_target_overrides.put(next)
  return next
}

/** Cooking prefs (Meal Planner, v3) — stored in `settings` under
 * 'cooking_prefs', merged over defaults so old/partial rows stay valid. */
export async function getCookingPrefs(): Promise<CookingPrefs> {
  const stored = await getSetting<CookingPrefs>(
    'cooking_prefs',
    defaultCookingPrefs(),
  )
  return { ...defaultCookingPrefs(), ...stored }
}

export async function setCookingPrefs(prefs: CookingPrefs): Promise<void> {
  await setSetting('cooking_prefs', prefs)
}

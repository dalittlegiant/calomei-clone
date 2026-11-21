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

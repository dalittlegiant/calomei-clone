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
  return getSetting<VisionProviderConfig>('vision', DEFAULT_VISION_CONFIG)
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

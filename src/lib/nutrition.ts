// Nutrition targets — standard practice (VISION_API_DESIGN.md §5):
// Mifflin-St Jeor BMR, activity multipliers, -15% for 減脂, protein 1.8 g/kg,
// fat 25% of calories, carbs fill the rest.

import type { NutritionTargetOverride, UserProfile } from './db'

export interface NutritionTarget {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  /** v1.7.0: daily sugar ceiling (g). */
  sugarCeilingG: number
  /** v1.7.0: daily fiber floor (g). */
  fiberFloorG: number
  /** v1.7.0: daily sodium ceiling (mg). */
  sodiumCeilingMg: number
}

/** Standard-practice defaults: WHO free sugars <10% of energy (~50 g on a
 * 2,000 kcal day), fiber ≥25 g/day, sodium ≤2,000 mg/day. */
export const DEFAULT_SUGAR_CEILING_G = 50
export const DEFAULT_FIBER_FLOOR_G = 25
export const DEFAULT_SODIUM_CEILING_MG = 2000

/** Water: the original app counts bottles — 1 樽 = 500 ml, target 4 樽. */
export const WATER_TARGET_ML = 2000
export const BOTTLE_ML = 500

export function bmi(weightKG: number, heightCM: number): number {
  if (!heightCM || heightCM <= 0) return 0
  return weightKG / (heightCM / 100) ** 2
}

/** HK-style bands (the original app calls 23.5 過重， standard at ≤22.9). */
export function bmiLabel(bmiValue: number): string {
  if (bmiValue <= 0) return '—'
  if (bmiValue < 18.5) return '偏輕'
  if (bmiValue < 23) return '標準'
  if (bmiValue < 25) return '過重'
  return '肥胖'
}

export const ACTIVITY_OPTIONS: Array<{
  value: string
  label: string
  factor: number
}> = [
  { value: '久坐', label: '久坐（少郁）', factor: 1.2 },
  { value: '輕度運動', label: '輕度運動（每週 1–3 次）', factor: 1.375 },
  { value: '中度運動', label: '中度運動（每週 3–5 次）', factor: 1.55 },
  { value: '高度運動', label: '高度運動（每週 6–7 次）', factor: 1.725 },
  { value: '非常活躍', label: '非常活躍（體力勞動）', factor: 1.9 },
]

export function activityFactor(activityLevel: string): number {
  return (
    ACTIVITY_OPTIONS.find((o) => o.value === activityLevel)?.factor ?? 1.375
  )
}

export function ageFromBirthday(birthday: number): number {
  if (!birthday) return 25
  const birth = new Date(birthday)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(1, age)
}

export function mifflinBmr(profile: UserProfile): number {
  const age = ageFromBirthday(profile.birthday)
  const base =
    10 * profile.weightKG + 6.25 * profile.heightCM - 5 * age
  return profile.gender === '女' ? base - 161 : base + 5
}

export function dailyTarget(profile: UserProfile): NutritionTarget {
  const tdee = mifflinBmr(profile) * activityFactor(profile.activityLevel)
  const calories = Math.round(tdee * 0.85) // 減脂：TDEE -15%
  const proteinG = Math.round(profile.weightKG * 1.8)
  const fatG = Math.round((calories * 0.25) / 9)
  const carbsG = Math.max(
    0,
    Math.round((calories - proteinG * 4 - fatG * 9) / 4),
  )
  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    sugarCeilingG: DEFAULT_SUGAR_CEILING_G,
    fiberFloorG: DEFAULT_FIBER_FLOOR_G,
    sodiumCeilingMg: DEFAULT_SODIUM_CEILING_MG,
  }
}

/**
 * Merge a custom override over the Mifflin default. Each non-null override
 * field wins; null means "use the default". Pass null for no override.
 */
export function effectiveTarget(
  profile: UserProfile,
  override: NutritionTargetOverride | null | undefined,
): NutritionTarget {
  const base = dailyTarget(profile)
  if (!override) return base
  return {
    calories: override.calories ?? base.calories,
    proteinG: override.proteinG ?? base.proteinG,
    carbsG: override.carbsG ?? base.carbsG,
    fatG: override.fatG ?? base.fatG,
    sugarCeilingG: override.sugarCeilingG ?? base.sugarCeilingG,
    fiberFloorG: override.fiberFloorG ?? base.fiberFloorG,
    sodiumCeilingMg: override.sodiumCeilingMg ?? base.sodiumCeilingMg,
  }
}

// Nutrition targets — standard practice (VISION_API_DESIGN.md §5):
// Mifflin-St Jeor BMR, activity multipliers, -15% for 減脂, protein 1.8 g/kg,
// fat 25% of calories, carbs fill the rest.

import type { UserProfile } from './db'

export interface NutritionTarget {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
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
  return { calories, proteinG, carbsG, fatG }
}

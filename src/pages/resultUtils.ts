// 結果頁共用純函數（見 DESIGN.md §11）——唔掂 Dexie，唔改 src/lib 邏輯。
// 克數來源：FoodComponent 原本無存克數欄位——由 portionDescription 解析
// （如「約150克」「100g」）；解析唔到就當無克數，向後相容舊記錄。
// 份數縮放模型：base（1 份時嘅值）× multiplier = 顯示值；所有縮放都由 base
// 重新計，唔會逐次累積誤差。
import type { FoodComponent } from '../lib/db'
import { MEAL_LABELS } from '../lib/image'

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 由份量文字解析克數：「約150克」「150g」「150 克」→ 150；解析唔到
 * 或者 ≤ 0（例如「約0克」）→ null，唔好當 0 克用——0 做除數會生出
 * Infinity／NaN 再寫入 Dexie。 */
export function parseGrams(portionDescription: string): number | null {
  const m = portionDescription.match(/(\d+(?:\.\d+)?)\s*(g|克|gram|grams)/i)
  if (!m) return null
  const v = Number(m[1])
  return v > 0 ? v : null
}

export interface Nutrients {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  sugarG: number
  fiberG: number
  sodiumMg: number
}

export function pickNutrients(c: {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  sugarG?: number
  fiberG?: number
  sodiumMg?: number
}): Nutrients {
  return {
    calories: c.calories,
    proteinG: c.proteinG,
    carbsG: c.carbsG,
    fatG: c.fatG,
    sugarG: c.sugarG ?? 0,
    fiberG: c.fiberG ?? 0,
    sodiumMg: c.sodiumMg ?? 0,
  }
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  return {
    calories: Math.round(n.calories * factor),
    proteinG: round1(n.proteinG * factor),
    carbsG: round1(n.carbsG * factor),
    fatG: round1(n.fatG * factor),
    sugarG: round1(n.sugarG * factor),
    fiberG: round1(n.fiberG * factor),
    sodiumMg: Math.round(n.sodiumMg * factor),
  }
}

/** 按比例縮放一樣食材：卡路里、6 項營養、克數（份量文字有克數先郁）。 */
export function scaleComponent(
  c: FoodComponent,
  factor: number,
): FoodComponent {
  const g = parseGrams(c.portionDescription)
  return {
    ...c,
    ...scaleNutrients(pickNutrients(c), factor),
    portionDescription:
      g !== null ? `約${Math.round(g * factor)}克` : c.portionDescription,
  }
}

/** 份數藥丸顯示：1 → "1"，1.5 → "1.5"，1.25 → "1.25"。 */
export function fmtMultiplier(m: number): string {
  return String(Math.round(m * 100) / 100)
}

/** 餐類＋時間膠囊：「晚餐 · 8:32 PM」。 */
export function fmtMealTime(mealType: string, dateMs: number): string {
  const label =
    MEAL_LABELS[mealType as keyof typeof MEAL_LABELS] ?? mealType
  const time = new Date(dateMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${label} · ${time}`
}

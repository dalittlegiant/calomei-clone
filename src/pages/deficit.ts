// 熱量赤字計算（見 DESIGN.md §10）——純函數，唔掂 Dexie，唔改 src/lib 邏輯。
// 鐵律：只計「有食物記錄嘅日子」；無記數嘅日子完全跳過，唔可以當食咗 0 kcal。
// 單日淨熱量 = 當日食物總卡路里 − (TDEE + 當日運動消耗)。
// 負數 = 赤字（慳咗），正數 = 盈餘（食凸咗）。
import { logDayKey } from '../lib/day'

export const FAT_KCAL_PER_KG = 7700 // 約 7,700 kcal 相當於 1 公斤體脂
const RICE_BOWL_KCAL = 650 // 一碗叉燒飯 ≈ 650 kcal
const HALF_BOWL_KCAL = 325

export interface DayNet {
  key: string
  startMs: number
  eaten: number
  exerciseKcal: number
  /** TDEE + 當日運動消耗。 */
  burn: number
  /** 食咗 − 燒咗（只限有記食物嘅日子；無記數嘅日子 = 0）。 */
  net: number
  hasFood: boolean
}

export interface DeficitSummary {
  /** 區間內每日一格，由舊到新；無記數嘅日子 hasFood=false、net=0。 */
  allDays: DayNet[]
  /** 只有有記食物嘅日子，由舊到新。 */
  foodDays: DayNet[]
  total: number
  daysWithFood: number
  /** 累計 ÷ 有記食物嘅日數；0 日有記 = 0。 */
  avg: number
  /** 累計 ÷ 7700（kg，可負可正）。 */
  fatKg: number
}

export function computeDeficit(
  entries: Array<{
    date: number
    calories: number
    scanStatus?: string | null
  }>,
  exercises: Array<{ date: number; caloriesBurned: number }>,
  tdee: number,
  startMin: number,
  endStartMs: number, // 區間最後一日嘅 log-day start（通常係今日）
  rangeDays: number,
): DeficitSummary {
  const eatenByDay = new Map<string, number>()
  const foodDaysSet = new Set<string>()
  for (const e of entries ?? []) {
    // 分析緊（未完成）嘅記錄唔計——佢未有卡路里數字。
    if (e.scanStatus === 'scanning') continue
    const key = logDayKey(e.date, startMin)
    eatenByDay.set(key, (eatenByDay.get(key) ?? 0) + e.calories)
    foodDaysSet.add(key)
  }
  const exerciseByDay = new Map<string, number>()
  for (const e of exercises ?? []) {
    const key = logDayKey(e.date, startMin)
    exerciseByDay.set(key, (exerciseByDay.get(key) ?? 0) + e.caloriesBurned)
  }

  const allDays: DayNet[] = []
  for (let i = rangeDays - 1; i >= 0; i--) {
    const startMs = endStartMs - i * 86_400_000
    const key = logDayKey(startMs, startMin)
    const hasFood = foodDaysSet.has(key)
    const eaten = eatenByDay.get(key) ?? 0
    const exerciseKcal = exerciseByDay.get(key) ?? 0
    const burn = tdee + exerciseKcal
    allDays.push({
      key,
      startMs,
      eaten,
      exerciseKcal,
      burn,
      net: hasFood ? eaten - burn : 0,
      hasFood,
    })
  }
  const foodDays = allDays.filter((d) => d.hasFood)
  const total = Math.round(foodDays.reduce((a, d) => a + d.net, 0))
  const daysWithFood = foodDays.length
  return {
    allDays,
    foodDays,
    total,
    daysWithFood,
    avg: daysWithFood > 0 ? Math.round(total / daysWithFood) : 0,
    fatKg: total / FAT_KCAL_PER_KG,
  }
}

/** 帶符號整數：−1,635 / +410 / 0（用 U+2212 減號，同 App 其餘數字一致）。 */
export function fmtSigned(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(Math.round(n)).toLocaleString()
  return n < 0 ? `−${abs}` : `+${abs}`
}

/** 相當體脂（1 位小數）：−0.5 / +0.1 / 0.0（細過 0.05 顯示 0.0，唔出 −0.0）。 */
export function fmtFatKg(total: number): string {
  const v = total / FAT_KCAL_PER_KG
  if (Math.abs(v) < 0.05) return '0.0'
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`
}

/** 按赤字／盈餘區間自動換句嘅廣東話評語。 */
export function deficitComment(total: number, daysWithFood: number): string {
  if (daysWithFood === 0) return '呢期未有記錄，記返幾餐先計到畀你。'
  if (total === 0) return '啱啱好打和，食幾多燒幾多。'
  if (total < 0) {
    const saved = -total
    if (saved < HALF_BOWL_KCAL)
      return `慳咗 ${saved.toLocaleString()} kcal，連半碗叉燒飯都未夠，咁都叫忍？`
    if (saved < FAT_KCAL_PER_KG / 2)
      return `慳咗 ${saved.toLocaleString()} kcal，即係大約 ${(saved / RICE_BOWL_KCAL).toFixed(1)} 碗叉燒飯，唔錯喎！`
    return `慳咗 ${saved.toLocaleString()} kcal，成 ${(saved / FAT_KCAL_PER_KG).toFixed(1)} 公斤肥肉咁滯，犀利！`
  }
  if (total < FAT_KCAL_PER_KG / 2)
    return `食凸咗 ${total.toLocaleString()} kcal，即係大約 ${(total / RICE_BOWL_KCAL).toFixed(1)} 碗叉燒飯，聽日忍返啲啦！`
  return `食凸咗 ${total.toLocaleString()} kcal，成 ${(total / FAT_KCAL_PER_KG).toFixed(1)} 公斤肥肉咁滯，聽日認真啲啦！`
}

/** "11月20日" */
export function fmtDayZh(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** "11月7日 – 11月20日" */
export function fmtRangeZh(startMs: number, endMs: number): string {
  return `${fmtDayZh(startMs)} – ${fmtDayZh(endMs)}`
}

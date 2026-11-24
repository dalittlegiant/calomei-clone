// 離線 MET 運動資料庫（2026-11-24，Kong 規格）。
// 全部數據離線，唔使上網。MET 值取自 Compendium of Physical Activities
// 嘅常用值（四捨五入到一位小數），係估算唔係量度值。
// 燒咗 kcal = Math.round(MET × 體重kg × (分鐘 / 60))；未有體重記錄
// 就 fallback 65kg（defaultProfile.weightKG）。
// 今日上限只計返 72%（EXERCISE_ALLOWANCE_FACTOR）：運動燒咗嘅卡路里
// 唔係全數變返做額度，係保守折算；設定「運動計入額度」關閉就 +0。

import type { ExerciseIconKey } from '../components/icons'

export type ExerciseCategory = '有氧' | '球類' | '健身房' | '日常'

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  '有氧',
  '球類',
  '健身房',
  '日常',
]

export interface ExerciseDef {
  id: string
  name: string
  /** 搜尋用別名（中文俗稱／英文），例如「行山 / 遠足」、「重訓 / gym」。 */
  aliases: string[]
  category: ExerciseCategory
  met: number
  icon: ExerciseIconKey
}

/** 運動燒咗嘅卡路里有幾多計入今日上限（保守折算）。 */
export const EXERCISE_ALLOWANCE_FACTOR = 0.72

/** 預設體重（未有體重記錄嗰陣用）。 */
export const FALLBACK_WEIGHT_KG = 65

/** MET 公式：燒咗 kcal = MET × 體重kg × (分鐘 / 60)。 */
export function kcalForMet(
  met: number,
  weightKg: number,
  minutes: number,
): number {
  return Math.round(met * weightKg * (minutes / 60))
}

/** 每 30 分鐘燒幾多 kcal（列表副標用）。 */
export function kcalPer30(met: number, weightKg: number): number {
  return kcalForMet(met, weightKg, 30)
}

/** 燒咗嘅 kcal 折算成今日上限（設定關閉就 +0）。 */
export function allowanceKcalFor(
  burnedKcal: number,
  countsTowardAllowance: boolean,
): number {
  if (!countsTowardAllowance) return 0
  return Math.round(burnedKcal * EXERCISE_ALLOWANCE_FACTOR)
}

/** 模糊搜尋：名稱＋別名，唔分大小寫，子字串就中。 */
export function searchExercises(query: string): ExerciseDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return EXERCISES
  return EXERCISES.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)),
  )
}

export function findExerciseById(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id)
}

export function findExerciseByName(name: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.name === name)
}

export const EXERCISES: ExerciseDef[] = [
  // ---- 有氧 ----
  { id: 'run-slow', name: '跑步（慢跑）', aliases: ['跑步', '慢跑', 'jogging', 'run'], category: '有氧', met: 8.3, icon: 'run' },
  { id: 'run-fast', name: '跑步（快跑）', aliases: ['快跑', '衝刺', 'sprint'], category: '有氧', met: 10.0, icon: 'run' },
  { id: 'treadmill-run', name: '跑步機（跑）', aliases: ['跑步機', 'treadmill'], category: '有氧', met: 8.3, icon: 'run' },
  { id: 'walk', name: '行路', aliases: ['行路', '散步', '步行', 'walk'], category: '有氧', met: 3.0, icon: 'walk' },
  { id: 'walk-brisk', name: '急步行', aliases: ['急步行', '快走', 'brisk walk'], category: '有氧', met: 4.3, icon: 'walk' },
  { id: 'treadmill-walk', name: '跑步機（快走）', aliases: ['跑步機', '快走', 'treadmill'], category: '有氧', met: 4.5, icon: 'walk' },
  { id: 'hike', name: '行山', aliases: ['行山', '遠足', '爬山', 'hiking'], category: '有氧', met: 6.0, icon: 'hike' },
  { id: 'swim-free', name: '游水（自由式）', aliases: ['游水', '游泳', '自由式', 'swim'], category: '有氧', met: 8.0, icon: 'swim' },
  { id: 'swim-breast', name: '游水（蛙式）', aliases: ['游水', '游泳', '蛙式'], category: '有氧', met: 5.3, icon: 'swim' },
  { id: 'swim-back', name: '游水（背泳）', aliases: ['游水', '游泳', '背泳'], category: '有氧', met: 5.0, icon: 'swim' },
  { id: 'bike', name: '踩單車', aliases: ['踩單車', '單車', 'cycling', 'bike'], category: '有氧', met: 7.5, icon: 'bike' },
  { id: 'bike-fast', name: '踩單車（快／爬坡）', aliases: ['踩單車', '單車', '爬坡'], category: '有氧', met: 10.0, icon: 'bike' },
  { id: 'bike-share', name: '共享單車（慢）', aliases: ['共享單車', '單車'], category: '有氧', met: 4.0, icon: 'bike' },
  { id: 'bike-machine', name: '單車機', aliases: ['單車機', '室內單車', 'spin', 'spinning'], category: '有氧', met: 7.0, icon: 'bike' },
  { id: 'elliptical', name: '橢圓機', aliases: ['橢圓機', 'elliptical'], category: '有氧', met: 5.0, icon: 'bike' },
  { id: 'row-machine', name: '划艇機', aliases: ['划艇機', 'rowing', 'rower'], category: '有氧', met: 7.0, icon: 'row' },
  { id: 'row-outdoor', name: '划船（戶外）', aliases: ['划船', 'rowing'], category: '有氧', met: 6.0, icon: 'row' },
  { id: 'sup', name: '直立板', aliases: ['直立板', 'sup', 'paddle board'], category: '有氧', met: 4.0, icon: 'sup' },
  { id: 'rope', name: '跳繩（中速）', aliases: ['跳繩', 'skip', 'rope'], category: '有氧', met: 11.0, icon: 'rope' },
  { id: 'rope-slow', name: '跳繩（慢速）', aliases: ['跳繩'], category: '有氧', met: 8.8, icon: 'rope' },
  { id: 'hiit', name: 'HIIT', aliases: ['HIIT', '高強度間歇'], category: '有氧', met: 8.0, icon: 'hiit' },
  { id: 'crossfit', name: 'CrossFit', aliases: ['CrossFit', 'crossfit'], category: '有氧', met: 8.0, icon: 'hiit' },
  { id: 'burpee', name: '波比跳', aliases: ['波比跳', 'burpee'], category: '有氧', met: 8.0, icon: 'hiit' },
  { id: 'jumping-jack', name: '開合跳', aliases: ['開合跳', 'jumping jack'], category: '有氧', met: 8.0, icon: 'hiit' },
  { id: 'aerobics', name: '健身操', aliases: ['健身操', '體能訓練', 'aerobics'], category: '有氧', met: 5.5, icon: 'hiit' },
  { id: 'dance-aerobic', name: '有氧舞', aliases: ['有氧舞', '跳舞', 'dance'], category: '有氧', met: 5.0, icon: 'dance' },
  { id: 'zumba', name: '尊巴', aliases: ['尊巴', 'zumba'], category: '有氧', met: 6.5, icon: 'dance' },
  { id: 'boxing-bag', name: '拳擊（打沙包）', aliases: ['拳擊', '打沙包', 'boxing'], category: '有氧', met: 5.5, icon: 'boxing' },
  { id: 'muay-thai', name: '泰拳', aliases: ['泰拳', 'muay thai'], category: '有氧', met: 7.0, icon: 'boxing' },
  { id: 'battle-rope', name: '戰繩', aliases: ['戰繩', 'battle rope'], category: '有氧', met: 8.0, icon: 'rope' },
  { id: 'skateboard', name: '滑板', aliases: ['滑板', 'skateboard'], category: '有氧', met: 5.0, icon: 'skateboard' },
  { id: 'roller', name: '溜冰（滾軸）', aliases: ['溜冰', '滾軸', 'roller'], category: '有氧', met: 7.0, icon: 'roller' },
  { id: 'ski', name: '滑雪', aliases: ['滑雪', 'ski'], category: '有氧', met: 7.0, icon: 'ski' },
  // ---- 球類 ----
  { id: 'badminton-casual', name: '羽毛球（休閒）', aliases: ['羽毛球', 'badminton'], category: '球類', met: 4.5, icon: 'shuttle' },
  { id: 'badminton-match', name: '羽毛球（比賽）', aliases: ['羽毛球', 'badminton'], category: '球類', met: 7.0, icon: 'shuttle' },
  { id: 'basketball-half', name: '籃球（半場）', aliases: ['籃球', 'basketball'], category: '球類', met: 6.0, icon: 'basketball' },
  { id: 'basketball-full', name: '籃球（全場比賽）', aliases: ['籃球', 'basketball'], category: '球類', met: 8.0, icon: 'basketball' },
  { id: 'soccer-casual', name: '足球（休閒）', aliases: ['足球', 'soccer'], category: '球類', met: 7.0, icon: 'football' },
  { id: 'soccer-match', name: '足球（比賽）', aliases: ['足球', 'soccer'], category: '球類', met: 10.0, icon: 'football' },
  { id: 'tennis-single', name: '網球（單打）', aliases: ['網球', 'tennis'], category: '球類', met: 7.3, icon: 'tennis' },
  { id: 'tennis-double', name: '網球（雙打）', aliases: ['網球', 'tennis'], category: '球類', met: 5.0, icon: 'tennis' },
  { id: 'pingpong', name: '乒乓球', aliases: ['乒乓球', 'table tennis', 'ping pong'], category: '球類', met: 4.0, icon: 'pingpong' },
  { id: 'squash', name: '壁球', aliases: ['壁球', 'squash'], category: '球類', met: 12.0, icon: 'racket' },
  { id: 'golf', name: '高爾夫', aliases: ['高爾夫', 'golf'], category: '球類', met: 4.8, icon: 'golf' },
  { id: 'volleyball', name: '排球', aliases: ['排球', 'volleyball'], category: '球類', met: 4.0, icon: 'volleyball' },
  { id: 'baseball', name: '棒球／壘球', aliases: ['棒球', '壘球', 'baseball'], category: '球類', met: 5.0, icon: 'baseball' },
  { id: 'bowling', name: '保齡球', aliases: ['保齡球', 'bowling'], category: '球類', met: 3.0, icon: 'bowling' },
  { id: 'snooker', name: '桌球', aliases: ['桌球', 'snooker'], category: '球類', met: 2.5, icon: 'snooker' },
  // ---- 健身房 ----
  { id: 'weights', name: '重訓／舉鐵', aliases: ['重訓', '舉鐵', 'gym', '健身', 'weight'], category: '健身房', met: 6.0, icon: 'dumbbell' },
  { id: 'weights-light', name: '重訓（輕量／器械）', aliases: ['重訓', '器械', 'gym'], category: '健身房', met: 3.5, icon: 'dumbbell' },
  { id: 'kettlebell', name: '壺鈴訓練', aliases: ['壺鈴', 'kettlebell'], category: '健身房', met: 6.0, icon: 'dumbbell' },
  { id: 'squat', name: '深蹲', aliases: ['深蹲', 'squat'], category: '健身房', met: 5.0, icon: 'squat' },
  { id: 'deadlift', name: '硬拉', aliases: ['硬拉', 'deadlift'], category: '健身房', met: 6.0, icon: 'barbell' },
  { id: 'bench', name: '臥推', aliases: ['臥推', 'bench press'], category: '健身房', met: 5.0, icon: 'barbell' },
  { id: 'core', name: '核心訓練', aliases: ['核心', 'core', 'abs'], category: '健身房', met: 4.0, icon: 'core' },
  { id: 'plank', name: '平板支撐', aliases: ['平板', 'plank'], category: '健身房', met: 3.0, icon: 'core' },
  { id: 'pilates', name: '普拉提', aliases: ['普拉提', 'pilates'], category: '健身房', met: 3.0, icon: 'yoga' },
  { id: 'yoga-hatha', name: '瑜伽（哈達）', aliases: ['瑜伽', 'yoga'], category: '健身房', met: 2.5, icon: 'yoga' },
  { id: 'yoga-flow', name: '瑜伽（流瑜伽）', aliases: ['瑜伽', '流瑜伽', 'yoga'], category: '健身房', met: 3.5, icon: 'yoga' },
  { id: 'stretch', name: '拉筋／伸展', aliases: ['拉筋', '伸展', 'stretch'], category: '健身房', met: 2.3, icon: 'stretch' },
  // ---- 日常 ----
  { id: 'housework', name: '做家務', aliases: ['做家務', '家務', '清潔', 'housework'], category: '日常', met: 3.3, icon: 'housework' },
  { id: 'mop', name: '抹地／吸塵', aliases: ['抹地', '吸塵', '拖地'], category: '日常', met: 3.5, icon: 'housework' },
  { id: 'cooking', name: '煮飯', aliases: ['煮飯', 'cooking'], category: '日常', met: 2.5, icon: 'cooking' },
  { id: 'car-wash', name: '洗車', aliases: ['洗車', 'car wash'], category: '日常', met: 3.5, icon: 'carwash' },
  { id: 'gardening', name: '園藝', aliases: ['園藝', 'gardening'], category: '日常', met: 4.0, icon: 'leaf' },
  { id: 'stairs-up', name: '行樓梯（上）', aliases: ['行樓梯', '上樓梯', '爬樓梯', 'stairs'], category: '日常', met: 8.0, icon: 'stairs' },
  { id: 'stairs-down', name: '行樓梯（落）', aliases: ['行樓梯', '落樓梯', 'stairs'], category: '日常', met: 3.0, icon: 'stairs' },
  { id: 'standing-work', name: '企住工作', aliases: ['企住工作', '企'], category: '日常', met: 2.0, icon: 'walk' },
  { id: 'dog-walk', name: '遛狗', aliases: ['遛狗', '放狗', 'dog'], category: '日常', met: 3.0, icon: 'walk' },
  { id: 'kids-play', name: '帶小朋友玩', aliases: ['帶小朋友玩', '湊仔'], category: '日常', met: 4.0, icon: 'walk' },
  { id: 'shopping', name: '行街（購物）', aliases: ['行街', '購物', 'shopping'], category: '日常', met: 2.3, icon: 'walk' },
  { id: 'moving', name: '搬重物', aliases: ['搬重物', '搬屋', 'moving'], category: '日常', met: 5.0, icon: 'dumbbell' },
]

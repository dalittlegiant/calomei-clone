// Text-only scan — 打字估算共用流程（2026-11-25）。
// 同 ScanPage 打字模式完全同一條路：開一個「打字輸入…」entry
// （scanStatus 'scanning'），用 placeholder 相＋textOnly 叫 scanFood
// 純文字估算，填好 entry 後回 entryId；失敗就刪 entry 再拋錯。
// 放喺 pages 層（唔係 src/lib/）——只係讀 lib，唔改 lib。
// ScanPage 嘅打字分支同 AddSheet 嘅打字快入彈窗共用呢度，唔各自一套。
import { db, type UserProfile, type VisionProviderConfig } from '../lib/db'
import {
  inferMealType,
  placeholderImageBase64,
} from '../lib/image'
import { scanFood } from '../lib/vision'
import { getToneInfo } from '../config/prompts'

export interface TextScanInput {
  description: string
  profile: UserProfile
  tonePrompt: string
  visionConfig: VisionProviderConfig
  onProgress?: (message: string) => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function runTextScan(input: TextScanInput): Promise<string> {
  const { description, profile, tonePrompt, visionConfig, onProgress } =
    input
  if (!description.trim()) {
    throw new Error('打低你食咗咩先，AI 先估到。')
  }
  if (!visionConfig.apiKey.trim()) {
    throw new Error(
      '未設定 API Key，請先去「設定」輸入 OpenRouter / OpenAI / Gemini 嘅 key。',
    )
  }
  const entryId = crypto.randomUUID()
  const tone = getToneInfo(profile.toneMode)
  // 2026-11-25：早／午／晚餐類型取消——唔再問邊餐，記錄嗰陣按時間
  // 推斷存入去就算，畫面唔顯示。
  const mealType = inferMealType()
  const now = Date.now()
  try {
    await db.food_entries.add({
      id: entryId,
      name: '打字輸入…',
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
      servingSize: '',
      mealType,
      date: now,
      createdAt: now,
      imageDataUrl: null,
      scanStatus: 'scanning',
      rebuttable: true,
    })
    // v1.7.0 previous_roasts：今日之前嘅 roast，模型唔會重複同一句。
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todays = await db.food_entries
      .where('date')
      .aboveOrEqual(startOfToday.getTime())
      .toArray()
    const previousRoasts = todays
      .filter((e) => e.scanStatus === 'done' && e.roastComment)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map((e) => e.roastComment as string)
    const result = await scanFood(
      {
        image_base64: placeholderImageBase64(),
        food_description: description.trim(),
        meal_type: mealType,
        region: 'hk',
        tone_mode: tone.apiValue,
        textOnly: true,
        previous_roasts: previousRoasts,
      },
      visionConfig,
      tonePrompt,
      onProgress,
    )
    const components = result.food_items.map((item) => ({
      nameZH: item.name_zh,
      nameEN: item.name_en,
      portionDescription: item.portion_description,
      calories: item.estimated_calories,
      proteinG: item.protein_g,
      carbsG: item.carbs_g,
      fatG: item.fat_g,
      confidence: item.confidence,
      sugarG: item.sugar_g ?? 0,
      fiberG: item.fiber_g ?? 0,
      sodiumMg: item.sodium_mg ?? 0,
      isExcluded: false,
    }))
    const first = components[0]
    // 2026-11-25：大標題用 AI 起嘅成碟名（dish_name，例如邊爐拼盤），
    // 唔再拎第一樣食材嚟做；AI 無畀先退返第一樣食材。
    const dishName = result.dish_name?.trim() || undefined
    await db.food_entries.update(entryId, {
      name: dishName ?? first?.nameZH ?? '未知食物',
      calories: result.total_calories,
      proteinG: round1(components.reduce((a, c) => a + c.proteinG, 0)),
      carbsG: round1(components.reduce((a, c) => a + c.carbsG, 0)),
      fatG: round1(components.reduce((a, c) => a + c.fatG, 0)),
      sugarG: round1(components.reduce((a, c) => a + (c.sugarG ?? 0), 0)),
      fiberG: round1(components.reduce((a, c) => a + (c.fiberG ?? 0), 0)),
      sodiumMg: Math.round(
        components.reduce((a, c) => a + (c.sodiumMg ?? 0), 0),
      ),
      servingSize: first?.portionDescription ?? '',
      componentsJson: JSON.stringify(components),
      scanStatus: 'done',
      roastComment: result.roast_comment,
      roastEmoji: tone.emoji,
      rebuttable: result.rebuttable ?? true,
      aiOriginalName: dishName ?? first?.nameZH ?? null,
      aiOriginalComponentsJson: JSON.stringify(components),
    })
    return entryId
  } catch (e) {
    await db.food_entries.delete(entryId).catch(() => undefined)
    throw e
  }
}

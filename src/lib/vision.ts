// VisionClient — OpenAI-compatible chat completions client for food scanning.
// Keeps the original app's JSON contract exactly (ScanFoodRequest ->
// FoodScanResult, CorrectFoodRequest -> CorrectionResult; see
// VISION_API_DESIGN.md §3). The provider is a setting (OpenRouter / OpenAI /
// Gemini via its OpenAI-compatible endpoint), so swapping models is a
// settings change, not a code change.

import { CORRECTION_SYSTEM_PROMPT } from '../config/prompts'
import type { VisionProviderConfig } from './db'

export interface ScannedFoodItem {
  name_zh: string
  name_en: string
  portion_description: string
  estimated_calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: number
}

export interface FoodScanResult {
  food_items: ScannedFoodItem[]
  total_calories: number
  roast_comment: string
}

export interface CorrectionResult {
  food_items: ScannedFoodItem[]
  total_calories: number
}

export interface ScanFoodRequest {
  image_base64: string
  food_description?: string | null
  meal_type: string
  region: string
  tone_mode: string
}

export interface CorrectFoodRequest {
  image_base64: string
  food_titles: string[]
  region: string
}

const SCANNED_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name_zh: { type: 'string' },
    name_en: { type: 'string' },
    portion_description: { type: 'string' },
    estimated_calories: { type: 'integer', minimum: 0 },
    protein_g: { type: 'number', minimum: 0 },
    carbs_g: { type: 'number', minimum: 0 },
    fat_g: { type: 'number', minimum: 0 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'name_zh',
    'name_en',
    'portion_description',
    'estimated_calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'confidence',
  ],
  additionalProperties: false,
} as const

export const FOOD_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    food_items: { type: 'array', items: SCANNED_ITEM_SCHEMA },
    total_calories: { type: 'integer', minimum: 0 },
    roast_comment: { type: 'string' },
  },
  required: ['food_items', 'total_calories', 'roast_comment'],
  additionalProperties: false,
} as const

export const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    food_items: { type: 'array', items: SCANNED_ITEM_SCHEMA },
    total_calories: { type: 'integer', minimum: 0 },
  },
  required: ['food_items', 'total_calories'],
  additionalProperties: false,
} as const

const TIMEOUT_MS = 60_000

interface ChatMessage {
  role: 'system' | 'user'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function isScannedItem(x: unknown): x is ScannedFoodItem {
  if (!isRecord(x)) return false
  return (
    typeof x.name_zh === 'string' &&
    typeof x.name_en === 'string' &&
    typeof x.portion_description === 'string' &&
    Number.isFinite(x.estimated_calories) &&
    Number.isFinite(x.protein_g) &&
    Number.isFinite(x.carbs_g) &&
    Number.isFinite(x.fat_g) &&
    typeof x.confidence === 'number' &&
    x.confidence >= 0 &&
    x.confidence <= 1
  )
}

function isFoodScanResult(x: unknown): x is FoodScanResult {
  if (!isRecord(x)) return false
  if (!Array.isArray(x.food_items) || !x.food_items.every(isScannedItem))
    return false
  return (
    Number.isFinite(x.total_calories) && typeof x.roast_comment === 'string'
  )
}

function isCorrectionResult(x: unknown): x is CorrectionResult {
  if (!isRecord(x)) return false
  if (!Array.isArray(x.food_items) || !x.food_items.every(isScannedItem))
    return false
  return Number.isFinite(x.total_calories)
}

/** Fix total_calories to the sum of items when it drifts too far (±10%). */
function fixTotal<T extends { food_items: ScannedFoodItem[]; total_calories: number }>(
  result: T,
): T {
  const sum = result.food_items.reduce(
    (acc, item) => acc + Math.round(item.estimated_calories),
    0,
  )
  if (Math.abs(sum - result.total_calories) > Math.max(10, sum * 0.1)) {
    return { ...result, total_calories: sum }
  }
  return result
}

async function chatCompletion<T>(
  config: VisionProviderConfig,
  schemaName: string,
  schema: unknown,
  messages: ChatMessage[],
  validate: (x: unknown) => x is T,
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

  const bodyBase = {
    model: config.model,
    messages,
    temperature: 0.4,
    max_tokens: 1200,
  }

  // Attempt 1: strict Structured Outputs. Some providers/models reject
  // json_schema — then fall back to json_object + client-side validation.
  const attempts: Array<Record<string, unknown>> = [
    {
      ...bodyBase,
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    },
    { ...bodyBase, response_format: { type: 'json_object' } },
  ]

  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(attempts[attempt]),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // A 400 on the strict attempt usually means the model does not
        // support json_schema — try the json_object fallback once.
        if (res.status === 400 && attempt === 0) {
          lastError = new Error(`HTTP 400: ${text.slice(0, 200)}`)
          continue
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = (await res.json()) as unknown
      const content = isRecord(data)
        ? (data.choices as Array<{ message?: { content?: string } }>)
        : null
      const text = content?.[0]?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('模型無回傳內容')
      }
      const parsed: unknown = JSON.parse(text)
      if (!validate(parsed)) throw new Error('回傳 JSON 格式唔啱')
      return fixTotal(parsed as T & { food_items: ScannedFoodItem[]; total_calories: number }) as T
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('請求超時（60 秒），請再試一次。')
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      // JSON parse/validation errors on the last attempt: one repair retry
      // is handled by the caller, not here.
      if (attempt === attempts.length - 1) throw lastError
    } finally {
      window.clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('未知錯誤')
}

async function withRepairRetry<T>(
  run: () => Promise<T>,
  config: VisionProviderConfig,
  schemaName: string,
  schema: unknown,
  messages: ChatMessage[],
  validate: (x: unknown) => x is T,
): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!/格式唔啱|JSON/.test(msg)) throw err
    // Ask the model to fix its own broken JSON once.
    const repairMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          '你上一次回傳嘅 JSON 格式有問題。請只輸出修正後嘅 JSON，符合同一個 schema，唔好加任何其他文字。',
      },
    ]
    return chatCompletion(config, schemaName, schema, repairMessages, validate)
  }
}

export async function scanFood(
  req: ScanFoodRequest,
  config: VisionProviderConfig,
  systemPrompt: string,
): Promise<FoodScanResult> {
  const contextParts = [`餐類：${req.meal_type}；地區：${req.region}。`]
  if (req.food_description?.trim()) {
    contextParts.push(`用戶補充：${req.food_description.trim()}`)
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: contextParts.join('') },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${req.image_base64}` },
        },
      ],
    },
  ]
  return withRepairRetry(
    () =>
      chatCompletion(
        config,
        'food_scan',
        FOOD_SCAN_SCHEMA,
        messages,
        isFoodScanResult,
      ),
    config,
    'food_scan',
    FOOD_SCAN_SCHEMA,
    messages,
    isFoodScanResult,
  )
}

export async function correctFood(
  req: CorrectFoodRequest,
  config: VisionProviderConfig,
): Promise<CorrectionResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `用戶話相入面正確嘅食物係：${JSON.stringify(req.food_titles)}。地區：${req.region}。請按呢啲名重新分析同一張相，唔好估其他嘢。`,
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${req.image_base64}` },
        },
      ],
    },
  ]
  return withRepairRetry(
    () =>
      chatCompletion(
        config,
        'correction',
        CORRECTION_SCHEMA,
        messages,
        isCorrectionResult,
      ),
    config,
    'correction',
    CORRECTION_SCHEMA,
    messages,
    isCorrectionResult,
  )
}

// VisionClient — OpenAI-compatible chat completions client for food scanning.
// Keeps the original app's JSON contract exactly (ScanFoodRequest ->
// FoodScanResult, CorrectFoodRequest -> CorrectionResult; see
// VISION_API_DESIGN.md §3). The provider is a setting (OpenRouter / OpenAI /
// Gemini via its OpenAI-compatible endpoint), so swapping models is a
// settings change, not a code change.

import {
  CORRECTION_SYSTEM_PROMPT,
  LABEL_SCAN_TASK,
  REBUT_TASK_SUFFIX,
} from '../config/prompts'
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
  /** v1.7.0: sugar (g), fiber (g), sodium (mg). Optional — older results
   * and the json_object fallback may omit them; normalised to 0. */
  sugar_g?: number
  fiber_g?: number
  sodium_mg?: number
}

export interface FoodScanResult {
  food_items: ScannedFoodItem[]
  total_calories: number
  roast_comment: string
  /** v1.7.0: whether this roast can be rebutted. Default true when absent. */
  rebuttable?: boolean
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
  /** v1.7.0: today's earlier roast comments, so the model does not repeat
   * the same roast. Sent as prompt context, not part of the JSON schema. */
  previous_roasts?: string[] | null
}

export interface CorrectFoodRequest {
  image_base64: string
  food_titles: string[]
  region: string
  /** v1.7.0: the user's rebuttal text, when correcting with an argument. */
  rebuttal?: string | null
  /** v1.7.0: tone to answer in. */
  tone_mode?: string | null
}

/** v1.7.0 rebuttal response: just a fresh roast_comment. */
export interface RebutResult {
  roast_comment: string
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
    sugar_g: { type: 'number', minimum: 0 },
    fiber_g: { type: 'number', minimum: 0 },
    sodium_mg: { type: 'number', minimum: 0 },
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
    'sugar_g',
    'fiber_g',
    'sodium_mg',
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

export const REBUT_SCHEMA = {
  type: 'object',
  properties: {
    roast_comment: { type: 'string' },
  },
  required: ['roast_comment'],
  additionalProperties: false,
} as const

const TIMEOUT_MS = 60_000
const MAX_TOKENS = 4096

/** Pull a readable message out of an OpenRouter-style error body. */
function apiErrorMessage(text: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(text)
    if (isRecord(parsed) && isRecord(parsed.error)) {
      const msg = parsed.error.message
      const code = parsed.error.code
      if (typeof msg === 'string' && msg) {
        return code ? `${msg}（${String(code)}）` : msg
      }
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text ? `${fallback}: ${text.slice(0, 300)}` : fallback
}

/**
 * Describe an empty-content reply so the cause is visible at a glance:
 * finish_reason (e.g. length = hit max_tokens), refusal, how many
 * reasoning tokens were spent, and whether any reasoning content came back.
 */
function describeEmptyContent(data: unknown): string {
  if (!isRecord(data)) return '回應唔係 JSON'
  const choice = Array.isArray(data.choices)
    ? (data.choices[0] as Record<string, unknown> | undefined)
    : undefined
  const message =
    choice && isRecord(choice.message) ? choice.message : null
  const usage = isRecord(data.usage) ? data.usage : null
  const details =
    usage && isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : null
  const parts: string[] = []
  if (typeof choice?.finish_reason === 'string') {
    parts.push(`finish_reason=${choice.finish_reason}`)
  }
  if (message && typeof message.refusal === 'string' && message.refusal) {
    parts.push(`refusal=${String(message.refusal).slice(0, 120)}`)
  }
  if (details && typeof details.reasoning_tokens === 'number') {
    parts.push(`reasoning_tokens=${details.reasoning_tokens}`)
  }
  const reasoning = message?.reasoning
  const hasReasoning =
    (typeof reasoning === 'string' && reasoning.length > 0) ||
    (Array.isArray(reasoning) && reasoning.length > 0)
  parts.push(hasReasoning ? '有 reasoning 內容' : '無 reasoning 內容')
  if (usage && typeof usage.completion_tokens === 'number') {
    parts.push(`completion_tokens=${usage.completion_tokens}`)
  }
  return parts.length > 0 ? parts.join('，') : '原因不明'
}

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
  // sugar_g / fiber_g / sodium_mg are optional here: the strict schema
  // requires them, but the json_object fallback may omit them — they are
  // normalised to 0 afterwards.
  const optionalNumber = (v: unknown) =>
    v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
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
    x.confidence <= 1 &&
    optionalNumber(x.sugar_g) &&
    optionalNumber(x.fiber_g) &&
    optionalNumber(x.sodium_mg)
  )
}

/** Fill missing sugar/fiber/sodium with 0 so callers never see undefined. */
function normalizeItems(items: ScannedFoodItem[]): ScannedFoodItem[] {
  return items.map((item) => ({
    ...item,
    sugar_g: item.sugar_g ?? 0,
    fiber_g: item.fiber_g ?? 0,
    sodium_mg: item.sodium_mg ?? 0,
  }))
}

function isFoodScanResult(x: unknown): x is FoodScanResult {
  if (!isRecord(x)) return false
  if (!Array.isArray(x.food_items) || !x.food_items.every(isScannedItem))
    return false
  if (
    x.rebuttable !== undefined &&
    typeof x.rebuttable !== 'boolean'
  )
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

function isRebutResult(x: unknown): x is RebutResult {
  return isRecord(x) && typeof x.roast_comment === 'string'
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

  // Reasoning effort (OpenRouter only; default 'none' — reasoning tokens
  // count against max_tokens, and a reasoning-heavy model can burn the
  // whole budget before emitting any JSON, which is exactly how
  // 「模型無回傳內容」 happened on deepseek-v4.1-flash).
  const effort = config.reasoningEffort ?? 'none'
  const withReasoning =
    config.provider === 'openrouter' && effort !== 'default'

  const makeBodyBase = (includeReasoning: boolean) => ({
    model: config.model,
    messages,
    temperature: 0.4,
    // 4096 (was 1200): reasoning models spend tokens thinking first;
    // 1200 was not enough for a reasoning model to finish the JSON.
    max_tokens: MAX_TOKENS,
    ...(includeReasoning && withReasoning
      ? { reasoning: { effort } }
      : {}),
  })

  // Attempt 1: strict Structured Outputs. The schema is built from plain
  // objects and JSON.stringify expands it inline — there is no top-level
  // $ref / $defs to trip providers up. Some providers/models reject
  // json_schema — then fall back to json_object + client-side validation.
  // An empty-content reply on attempt 1 also falls back (it used to throw
  // straight away, which hid the real cause).
  const makeAttempts = (includeReasoning: boolean) => {
    const base = makeBodyBase(includeReasoning)
    return [
      {
        ...base,
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, strict: true, schema },
        },
      },
      { ...base, response_format: { type: 'json_object' } },
    ]
  }

  let attempts = makeAttempts(true)
  let reasoningStripped = false
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
        const detail = apiErrorMessage(text, `HTTP ${res.status}`)
        // A forced-reasoning model may 400 on reasoning: { effort: "none" }.
        // Strip the reasoning field and retry the SAME response_format once.
        if (
          res.status === 400 &&
          !reasoningStripped &&
          'reasoning' in attempts[attempt]
        ) {
          reasoningStripped = true
          attempts = makeAttempts(false)
          lastError = new Error(`${detail}（已移除 reasoning 重試）`)
          attempt--
          continue
        }
        // A 400 on the strict attempt usually means the model does not
        // support json_schema — try the json_object fallback once.
        if (res.status === 400 && attempt === 0) {
          lastError = new Error(detail)
          continue
        }
        throw new Error(detail)
      }
      const data = (await res.json()) as unknown
      // Some providers return HTTP 200 with a top-level error object.
      if (isRecord(data) && isRecord(data.error)) {
        const msg =
          typeof data.error.message === 'string'
            ? data.error.message
            : 'API 回傳錯誤'
        throw new Error(`API 錯誤：${msg}`)
      }
      const choice = isRecord(data)
        ? (
            data.choices as Array<{
              message?: {
                content?: string | null
                refusal?: string | null
                reasoning?: unknown
              }
              finish_reason?: string
            }>
          )?.[0]
        : undefined
      const text = choice?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        const detail = describeEmptyContent(data)
        if (attempt === 0) {
          lastError = new Error(
            `模型無回傳內容（${detail}），已改用 json_object 重試`,
          )
          continue
        }
        throw new Error(`模型無回傳內容（${detail}）`)
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
  if (req.previous_roasts?.length) {
    const prior = req.previous_roasts
      .slice(-5)
      .map((r) => r.replace(/\s+/g, ' ').trim().slice(0, 60))
      .filter(Boolean)
    if (prior.length > 0) {
      contextParts.push(
        `今日之前你已經講過以下評語，唔好重複同一句，要講啲新嘢：${prior.map((r) => `「${r}」`).join('、')}。`,
      )
    }
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
  const result = await withRepairRetry(
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
  return {
    ...result,
    food_items: normalizeItems(result.food_items),
    // v1.7.0: rebuttable defaults to true when the model omits it.
    rebuttable: result.rebuttable ?? true,
  }
}

/**
 * Nutrition-label mode — same FoodScanResult shape, but the photo is a
 * package's nutrition label. The tone prompt still sets the roast voice;
 * LABEL_SCAN_TASK overrides the "recognise dishes" part.
 */
export async function scanNutritionLabel(
  req: ScanFoodRequest,
  config: VisionProviderConfig,
  systemPrompt: string,
): Promise<FoodScanResult> {
  const contextParts = [`地區：${req.region}。`]
  if (req.food_description?.trim()) {
    contextParts.push(`產品名（用戶提供）：${req.food_description.trim()}`)
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: `${systemPrompt}\n\n${LABEL_SCAN_TASK}` },
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
  const result = await withRepairRetry(
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
  return {
    ...result,
    food_items: normalizeItems(result.food_items),
    rebuttable: result.rebuttable ?? true,
  }
}

export interface RebutRoastRequest {
  image_base64: string
  original_roast: string
  rebuttal: string
  region: string
  tone_mode: string
}

/**
 * v1.7.0 rebut-roast: the user argues back, the model answers in the same
 * tone with a fresh roast_comment. Only the comment changes — the food
 * numbers stay as they are.
 */
export async function rebutRoast(
  req: RebutRoastRequest,
  config: VisionProviderConfig,
  systemPrompt: string,
): Promise<RebutResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `${systemPrompt}\n\n${REBUT_TASK_SUFFIX}` },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `你之前講：「${req.original_roast}」\n用戶駁：「${req.rebuttal.trim()}」\n地區：${req.region}；語氣：${req.tone_mode}。`,
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
        'rebut',
        REBUT_SCHEMA,
        messages,
        isRebutResult,
      ),
    config,
    'rebut',
    REBUT_SCHEMA,
    messages,
    isRebutResult,
  )
}

export async function correctFood(
  req: CorrectFoodRequest,
  config: VisionProviderConfig,
): Promise<CorrectionResult> {
  const contextParts = [
    `用戶話相入面正確嘅食物係：${JSON.stringify(req.food_titles)}。地區：${req.region}。請按呢啲名重新分析同一張相，唔好估其他嘢。`,
  ]
  if (req.rebuttal?.trim()) {
    contextParts.push(`用戶補充（反駁）：${req.rebuttal.trim()}`)
  }
  if (req.tone_mode) {
    contextParts.push(`語氣：${req.tone_mode}。`)
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
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
  const result = await withRepairRetry(
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
  return { ...result, food_items: normalizeItems(result.food_items) }
}

// Apple Health export via an iOS Shortcut.
//
// A PWA cannot write to HealthKit directly, so the app hands a JSON payload
// to a user-built iOS Shortcut through the URL scheme:
//   shortcuts://run-shortcut?name=<name>&input=text&text=<encoded JSON>
// The Shortcut (built once by the user — see the tutorial in Settings)
// parses the JSON and logs the samples with "Log Health Sample".
// Nothing leaves the phone except to the Shortcuts app; the payload is
// plain JSON, no API key or account involved.
//
// Payload contract (v1) — the Shortcut switches on `type`:
//   meal:   { type, date (ISO), name, calories, protein_g, carbs_g, fat_g,
//             sugar_g, fiber_g, sodium_mg }
//   water:  { type, date (ISO), amount_ml }
//   weight: { type, date (ISO), weight_kg, body_fat_percent? }
// All numbers are plain numbers (no units in the values); dates are ISO
// 8601 strings so the Shortcut can pass them straight to Health.

export type HealthExportPayload =
  | {
      type: 'meal'
      date: string
      name: string
      calories: number
      protein_g: number
      carbs_g: number
      fat_g: number
      sugar_g: number
      fiber_g: number
      sodium_mg: number
    }
  | {
      type: 'water'
      date: string
      amount_ml: number
    }
  | {
      type: 'weight'
      date: string
      weight_kg: number
      body_fat_percent?: number | null
    }

/** Build the shortcuts:// URL. Does not navigate by itself. */
export function healthShortcutUrl(
  shortcutName: string,
  payload: HealthExportPayload,
): string {
  const text = encodeURIComponent(JSON.stringify(payload))
  return `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${text}`
}

/**
 * Hand the payload to the iOS Shortcut. Only works on iOS (Safari / the
 * installed PWA); anywhere else the URL scheme does nothing.
 */
export function openHealthShortcut(
  shortcutName: string,
  payload: HealthExportPayload,
): void {
  window.location.href = healthShortcutUrl(shortcutName, payload)
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString()
}

/** Field reference for the Shortcut tutorial (Settings page). */
export const HEALTH_PAYLOAD_FIELDS: Array<{
  type: string
  fields: Array<{ name: string; meaning: string }>
}> = [
  {
    type: 'meal',
    fields: [
      { name: 'type', meaning: '"meal"（固定）' },
      { name: 'date', meaning: 'ISO 時間，例如 2026-11-21T12:30:00.000Z' },
      { name: 'name', meaning: '餐名，例如「叉燒飯」' },
      { name: 'calories', meaning: '卡路里（kcal）' },
      { name: 'protein_g', meaning: '蛋白質（克）' },
      { name: 'carbs_g', meaning: '碳水（克）' },
      { name: 'fat_g', meaning: '脂肪（克）' },
      { name: 'sugar_g', meaning: '糖（克）' },
      { name: 'fiber_g', meaning: '纖維（克）' },
      { name: 'sodium_mg', meaning: '鈉（毫克）' },
    ],
  },
  {
    type: 'water',
    fields: [
      { name: 'type', meaning: '"water"（固定）' },
      { name: 'date', meaning: 'ISO 時間' },
      { name: 'amount_ml', meaning: '飲水量（毫升）' },
    ],
  },
  {
    type: 'weight',
    fields: [
      { name: 'type', meaning: '"weight"（固定）' },
      { name: 'date', meaning: 'ISO 時間' },
      { name: 'weight_kg', meaning: '體重（公斤）' },
      { name: 'body_fat_percent', meaning: '體脂（%，可選，無就唔傳）' },
    ],
  },
]

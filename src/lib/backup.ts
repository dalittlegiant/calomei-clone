// Backup / restore — exports the whole Dexie database as one JSON file and
// imports it back. The API key is EXCLUDED by default (the export checkbox
// is off); including it is an explicit opt-in, so a backup file shared or
// stored carelessly does not leak the key.

import { db, type VisionProviderConfig } from './db'

export interface BackupData {
  app: 'calomei-clone'
  backupVersion: 2
  exportedAt: string
  user_profiles: unknown[]
  food_entries: unknown[]
  weight_entries: unknown[]
  saved_foods: unknown[]
  food_collections: unknown[]
  food_collection_items: unknown[]
  /** v2 (2026-11-21): water, exercise, body fat, custom targets. */
  water_entries: unknown[]
  exercise_entries: unknown[]
  body_fat_entries: unknown[]
  nutrition_target_overrides: unknown[]
  settings: Array<{ key: string; value: string }>
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export async function exportBackup(
  includeApiKey: boolean,
): Promise<BackupData> {
  const [
    profiles,
    entries,
    weights,
    saved,
    collections,
    items,
    water,
    exercise,
    bodyFat,
    targets,
    settings,
  ] = await Promise.all([
    db.user_profiles.toArray(),
    db.food_entries.toArray(),
    db.weight_entries.toArray(),
    db.saved_foods.toArray(),
    db.food_collections.toArray(),
    db.food_collection_items.toArray(),
    db.water_entries.toArray(),
    db.exercise_entries.toArray(),
    db.body_fat_entries.toArray(),
    db.nutrition_target_overrides.toArray(),
    db.settings.toArray(),
  ])

  const safeSettings = settings.map((s) => {
    if (s.key === 'vision' && !includeApiKey) {
      try {
        const vision = JSON.parse(s.value) as VisionProviderConfig
        return {
          key: s.key,
          value: JSON.stringify({ ...vision, apiKey: '' }),
        }
      } catch {
        return s
      }
    }
    return s
  })

  return {
    app: 'calomei-clone',
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    user_profiles: profiles,
    food_entries: entries,
    weight_entries: weights,
    saved_foods: saved,
    food_collections: collections,
    food_collection_items: items,
    water_entries: water,
    exercise_entries: exercise,
    body_fat_entries: bodyFat,
    nutrition_target_overrides: targets,
    settings: safeSettings,
  }
}

export interface ImportResult {
  counts: {
    profiles: number
    entries: number
    weights: number
    saved: number
    collections: number
    items: number
    water: number
    exercise: number
    bodyFat: number
    targets: number
  }
  vision: VisionProviderConfig | null
}

export async function importBackup(data: unknown): Promise<ImportResult> {
  if (!isRecord(data)) throw new Error('備份檔格式唔啱')
  // Accept files written by exportBackup (app marker) and tolerate files
  // that only carry the tables.
  if (data.app !== 'calomei-clone' && !Array.isArray(data.food_entries)) {
    throw new Error('呢個唔係 CaLoMei 嘅備份檔')
  }
  const table = (name: string): unknown[] =>
    Array.isArray(data[name]) ? (data[name] as unknown[]) : []
  // Whether the file actually carries a table (vs. an old file that predates
  // it) — see M11 below.
  const has = (name: string) => Array.isArray(data[name])

  // M5: read the device's current API key BEFORE the transaction clears
  // settings — an imported vision row with a blank key (the default export
  // blanks it) must not wipe the key this device is using.
  let currentApiKey = ''
  try {
    const current = await db.settings.get('vision')
    if (current) {
      currentApiKey =
        (JSON.parse(current.value) as VisionProviderConfig).apiKey?.trim() ??
        ''
    }
  } catch {
    currentApiKey = ''
  }

  await db.transaction(
    'rw',
    [
      db.user_profiles,
      db.food_entries,
      db.weight_entries,
      db.saved_foods,
      db.food_collections,
      db.food_collection_items,
      db.water_entries,
      db.exercise_entries,
      db.body_fat_entries,
      db.nutrition_target_overrides,
      db.settings,
    ],
    async () => {
      // M11: only clear a table the backup file actually contains — a v1
      // file has no water / exercise / body-fat / target tables, so those
      // keep their current rows instead of being wiped by the clear.
      await Promise.all([
        has('user_profiles') ? db.user_profiles.clear() : Promise.resolve(),
        has('food_entries') ? db.food_entries.clear() : Promise.resolve(),
        has('weight_entries') ? db.weight_entries.clear() : Promise.resolve(),
        has('saved_foods') ? db.saved_foods.clear() : Promise.resolve(),
        has('food_collections')
          ? db.food_collections.clear()
          : Promise.resolve(),
        has('food_collection_items')
          ? db.food_collection_items.clear()
          : Promise.resolve(),
        has('water_entries') ? db.water_entries.clear() : Promise.resolve(),
        has('exercise_entries')
          ? db.exercise_entries.clear()
          : Promise.resolve(),
        has('body_fat_entries')
          ? db.body_fat_entries.clear()
          : Promise.resolve(),
        has('nutrition_target_overrides')
          ? db.nutrition_target_overrides.clear()
          : Promise.resolve(),
        has('settings') ? db.settings.clear() : Promise.resolve(),
      ])
      const profiles = table('user_profiles')
      const entries = table('food_entries')
      const weights = table('weight_entries')
      const saved = table('saved_foods')
      const collections = table('food_collections')
      const items = table('food_collection_items')
      const water = table('water_entries')
      const exercise = table('exercise_entries')
      const bodyFat = table('body_fat_entries')
      const targets = table('nutrition_target_overrides')
      const settings = table('settings') as Array<{
        key: string
        value: string
      }>
      if (profiles.length > 0)
        await db.user_profiles.bulkPut(
          profiles as Parameters<typeof db.user_profiles.bulkPut>[0],
        )
      if (entries.length > 0)
        await db.food_entries.bulkPut(
          entries as Parameters<typeof db.food_entries.bulkPut>[0],
        )
      if (weights.length > 0)
        await db.weight_entries.bulkPut(
          weights as Parameters<typeof db.weight_entries.bulkPut>[0],
        )
      if (saved.length > 0)
        await db.saved_foods.bulkPut(
          saved as Parameters<typeof db.saved_foods.bulkPut>[0],
        )
      if (collections.length > 0)
        await db.food_collections.bulkPut(
          collections as Parameters<typeof db.food_collections.bulkPut>[0],
        )
      if (items.length > 0)
        await db.food_collection_items.bulkPut(
          items as Parameters<typeof db.food_collection_items.bulkPut>[0],
        )
      // v1 backup files lack these tables — table() returns [] for them.
      if (water.length > 0)
        await db.water_entries.bulkPut(
          water as Parameters<typeof db.water_entries.bulkPut>[0],
        )
      if (exercise.length > 0)
        await db.exercise_entries.bulkPut(
          exercise as Parameters<typeof db.exercise_entries.bulkPut>[0],
        )
      if (bodyFat.length > 0)
        await db.body_fat_entries.bulkPut(
          bodyFat as Parameters<typeof db.body_fat_entries.bulkPut>[0],
        )
      if (targets.length > 0)
        await db.nutrition_target_overrides.bulkPut(
          targets as Parameters<
            typeof db.nutrition_target_overrides.bulkPut
          >[0],
        )
      if (settings.length > 0) {
        // M5: if the imported vision row carries no API key, keep the one
        // this device already has instead of overwriting it with ''.
        const visionRow = settings.find((s) => s.key === 'vision')
        if (visionRow && currentApiKey) {
          try {
            const imported = JSON.parse(visionRow.value) as VisionProviderConfig
            if (!imported.apiKey?.trim()) {
              visionRow.value = JSON.stringify({
                ...imported,
                apiKey: currentApiKey,
              })
            }
          } catch {
            // Keep the imported row as-is on parse failure.
          }
        }
        await db.settings.bulkPut(settings)
      }
    },
  )

  const settings = table('settings') as Array<{ key: string; value: string }>
  const visionRow = settings.find((s) => s.key === 'vision')
  let vision: VisionProviderConfig | null = null
  if (visionRow) {
    try {
      vision = JSON.parse(visionRow.value) as VisionProviderConfig
    } catch {
      vision = null
    }
  }
  return {
    counts: {
      profiles: table('user_profiles').length,
      entries: table('food_entries').length,
      weights: table('weight_entries').length,
      saved: table('saved_foods').length,
      collections: table('food_collections').length,
      items: table('food_collection_items').length,
      water: table('water_entries').length,
      exercise: table('exercise_entries').length,
      bodyFat: table('body_fat_entries').length,
      targets: table('nutrition_target_overrides').length,
    },
    vision,
  }
}

export function downloadBackup(data: BackupData): void {
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `calomei-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

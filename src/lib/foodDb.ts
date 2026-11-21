// Offline food databases — the two JSON files extracted from the original
// APK's assets (TFDA 2,007 items + China 1,130 items). They are plain JSON
// arrays with a shared schema, copied into public/data/ and fetched at
// runtime (not bundled) so they can be cached by the service worker.

export interface LocalFoodItem {
  id: string
  name: string
  nameEN: string | null
  source: 'tfda' | 'china'
  category: string
  caloriesPerHundredG: number
  proteinGPerHundredG: number
  carbsGPerHundredG: number
  fatGPerHundredG: number
}

export interface FoodMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

let cache: LocalFoodItem[] | null = null
let loading: Promise<LocalFoodItem[]> | null = null

export async function loadFoodDb(): Promise<LocalFoodItem[]> {
  if (cache) return cache
  if (loading) return loading
  loading = (async () => {
    try {
      // BASE_URL is '/calomei-clone/' on GitHub Pages, '/' in dev.
      const base = import.meta.env.BASE_URL
      const [tfda, china] = await Promise.all([
        fetch(`${base}data/tfda_foods.json`).then((r) => r.json()),
        fetch(`${base}data/china_foods.json`).then((r) => r.json()),
      ])
      cache = [...(tfda as LocalFoodItem[]), ...(china as LocalFoodItem[])]
      return cache
    } catch (err) {
      // A failed load must not poison the session: reset `loading` so the
      // next search retries the fetch instead of re-throwing the same
      // rejected promise forever (e.g. first load happened offline).
      loading = null
      throw err
    }
  })()
  return loading
}

/** Simple substring search over name + nameEN. Exact/prefix matches first. */
export async function searchFoods(
  query: string,
  limit = 20,
): Promise<LocalFoodItem[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all = await loadFoodDb()
  const starts: LocalFoodItem[] = []
  const contains: LocalFoodItem[] = []
  for (const item of all) {
    const name = item.name.toLowerCase()
    const nameEN = (item.nameEN ?? '').toLowerCase()
    if (name.startsWith(q) || nameEN.startsWith(q)) starts.push(item)
    else if (name.includes(q) || nameEN.includes(q)) contains.push(item)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

/** Scale per-100g values to a portion in grams. */
export function macrosForGrams(
  item: LocalFoodItem,
  grams: number,
): FoodMacros {
  const f = grams / 100
  return {
    calories: Math.round(item.caloriesPerHundredG * f),
    proteinG: round1(item.proteinGPerHundredG * f),
    carbsG: round1(item.carbsGPerHundredG * f),
    fatG: round1(item.fatGPerHundredG * f),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

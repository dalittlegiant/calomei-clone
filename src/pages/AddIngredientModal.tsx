// ＋加多樣 彈窗（見 DESIGN.md §11）：離線食物庫搜尋（TFDA＋中國食物庫）
// 同「手動自訂一項食材」二揀一；揀完直接加入呢餐並重計總數。
import { useState } from 'react'
import { macrosForGrams, searchFoods, type LocalFoodItem } from '../lib/foodDb'
import type { FoodComponent } from '../lib/db'
import { GlassModal } from '../components/ui'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (item: FoodComponent) => void
}

export default function AddIngredientModal({ open, onClose, onAdd }: Props) {
  const [tab, setTab] = useState<'search' | 'manual'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalFoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPortion, setManualPortion] = useState('一份')
  const [manualCalories, setManualCalories] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [manualSugar, setManualSugar] = useState('')
  const [manualFiber, setManualFiber] = useState('')
  const [manualSodium, setManualSodium] = useState('')

  async function onSearch(q: string) {
    setQuery(q)
    setSearchError(false)
    if (q.trim().length < 1) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      setResults(await searchFoods(q, 12))
    } catch {
      // Food-DB load failed (e.g. offline on first load) — say so instead
      // of the misleading "搵唔到"; loadFoodDb retries on the next search.
      setSearchError(true)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function addLocalFood(item: LocalFoodItem, grams: number) {
    const m = macrosForGrams(item, grams)
    onAdd({
      nameZH: item.name,
      nameEN: item.nameEN ?? '',
      portionDescription: `約${grams}克`,
      calories: m.calories,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
      confidence: 1,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
      isExcluded: false,
    })
    onClose()
  }

  function addManual() {
    if (manualName.trim() === '') return
    onAdd({
      nameZH: manualName.trim(),
      nameEN: '',
      portionDescription: manualPortion.trim() || '一份',
      calories: Number(manualCalories) || 0,
      proteinG: Number(manualProtein) || 0,
      carbsG: Number(manualCarbs) || 0,
      fatG: Number(manualFat) || 0,
      confidence: 1,
      sugarG: Number(manualSugar) || 0,
      fiberG: Number(manualFiber) || 0,
      sodiumMg: Number(manualSodium) || 0,
      isExcluded: false,
    })
    onClose()
  }

  return (
    <GlassModal open={open} onClose={onClose} variant="sheet">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">＋ 加多樣</h3>
        <button
          type="button"
          onClick={onClose}
          className="glass-pill px-3 py-1.5 text-sm font-bold text-white/80"
        >
          ✕ 關閉
        </button>
      </div>

      {/* 搜尋／手動 切換 */}
      <div className="mt-3 flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`flex-1 rounded-full py-2 text-sm font-bold ${
            tab === 'search' ? 'glass-cta-amber text-white' : 'text-white/60'
          }`}
        >
          搜尋食物庫
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`flex-1 rounded-full py-2 text-sm font-bold ${
            tab === 'manual' ? 'glass-cta-amber text-white' : 'text-white/60'
          }`}
        >
          手動自訂
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜尋食物，例如：鯖魚、米飯…"
            className="glass-input mt-3"
          />
          {searching && <p className="mt-2 text-sm text-white/40">搵緊…</p>}
          {searchError && (
            <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
              食物庫載入失敗，請檢查網絡再試過。
            </p>
          )}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-white/10">
              {results.map((food) => (
                <li
                  key={food.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {food.name}{' '}
                      <span className="font-normal text-white/40">
                        {food.nameEN ?? ''}
                      </span>
                    </p>
                    <p className="text-xs text-white/50">
                      {food.category} · 每100克 {food.caloriesPerHundredG} kcal
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addLocalFood(food, 100)}
                    className="shrink-0 rounded-xl bg-[#FF9F0A]/15 px-3 py-1.5 text-sm font-bold text-amber-200"
                  >
                    ＋100克
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() !== '' &&
            !searching &&
            !searchError &&
            results.length === 0 && (
              <p className="mt-3 text-center text-sm text-white/40">
                搵唔到「{query}」，試下轉去「手動自訂」。
              </p>
            )}
        </>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="食物名，例如：白飯"
              aria-label="食物名"
              className="glass-input min-w-0 flex-1"
            />
            <input
              type="text"
              value={manualPortion}
              onChange={(e) => setManualPortion(e.target.value)}
              placeholder="份量"
              aria-label="份量"
              className="glass-input w-24 shrink-0"
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <label>
              <span className="text-xs text-white/50">卡路里</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={manualCalories}
                onChange={(e) => setManualCalories(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">蛋白質 g</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualProtein}
                onChange={(e) => setManualProtein(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">碳水 g</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualCarbs}
                onChange={(e) => setManualCarbs(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">脂肪 g</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualFat}
                onChange={(e) => setManualFat(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">糖 g</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualSugar}
                onChange={(e) => setManualSugar(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">纖維 g</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualFiber}
                onChange={(e) => setManualFiber(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs text-white/50">鈉 mg</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={manualSodium}
                onChange={(e) => setManualSodium(e.target.value)}
                className="glass-input mt-0.5"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={manualName.trim() === ''}
            onClick={addManual}
            className="glass-cta-amber mt-3 w-full rounded-2xl py-3 font-bold text-white"
          >
            加入呢餐
          </button>
        </>
      )}
    </GlassModal>
  )
}

// 單一食材編輯窗（見 DESIGN.md §11）。
// - 名稱＋紅色剔除／恢復 icon 掣；底部兩下確認刪除。
// - 份量：份數／克切換膠囊；改份量即時按比例重計卡路里＋6 項營養。
// - 營養資料：大 🔥 kcal 卡＋2×3 格，撳任何一格可手動微調數字。
// - 克數由 portionDescription 解析（見 resultUtils.ts）；舊記錄無克數就
//   份數模式起手，輸入克數後先有克數基準——唔改 Dexie schema。
import { useState } from 'react'
import type { FoodComponent } from '../lib/db'
import { GlassModal } from '../components/ui'
import { RotateCcwIcon, TrashIcon } from '../components/icons'
import {
  parseGrams,
  pickNutrients,
  round1,
  scaleNutrients,
  type Nutrients,
} from './resultUtils'

export interface IngredientPatch extends Nutrients {
  nameZH: string
  portionDescription: string
  isExcluded: boolean
}

interface Props {
  item: FoodComponent
  onSave: (patch: IngredientPatch) => void
  onDelete: () => void
  onClose: () => void
}

const FIELDS: Array<{
  key: keyof Nutrients
  label: string
  unit: string
  step: string
}> = [
  { key: 'proteinG', label: '蛋白質', unit: 'g', step: '0.1' },
  { key: 'carbsG', label: '碳水', unit: 'g', step: '0.1' },
  { key: 'fatG', label: '脂肪', unit: 'g', step: '0.1' },
  { key: 'sugarG', label: '糖', unit: 'g', step: '0.1' },
  { key: 'fiberG', label: '纖維', unit: 'g', step: '0.1' },
  { key: 'sodiumMg', label: '鈉', unit: 'mg', step: '1' },
]

export default function IngredientSheet({
  item,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(item.nameZH)
  const [excluded, setExcluded] = useState(item.isExcluded)
  // 1 份時嘅營養基準——手動改數字會同步改基準，之後再改份量都跟得上。
  const [baseNutrients, setBaseNutrients] = useState<Nutrients>(() =>
    pickNutrients(item),
  )
  const [baseGrams, setBaseGrams] = useState<number | null>(() =>
    parseGrams(item.portionDescription),
  )
  const [nutrients, setNutrients] = useState<Nutrients>(() =>
    pickNutrients(item),
  )
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState<'servings' | 'grams'>(
    parseGrams(item.portionDescription) !== null ? 'grams' : 'servings',
  )
  const [servingsStr, setServingsStr] = useState('1')
  const [gramsStr, setGramsStr] = useState(
    parseGrams(item.portionDescription) !== null
      ? String(parseGrams(item.portionDescription))
      : '',
  )
  const [editingField, setEditingField] = useState<keyof Nutrients | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function applyScale(nextScale: number) {
    if (!nextScale || nextScale <= 0) return
    setScale(nextScale)
    setNutrients(scaleNutrients(baseNutrients, nextScale))
  }

  function onServingsChange(value: string) {
    setServingsStr(value)
    const s = Number(value)
    if (value.trim() !== '' && Number.isFinite(s) && s > 0) applyScale(s)
  }

  function onGramsChange(value: string) {
    setGramsStr(value)
    const g = Number(value)
    if (value.trim() === '' || !Number.isFinite(g) || g <= 0) return
    if (baseGrams === null) {
      // 舊記錄無克數：第一次輸入克數只係定基準，唔重計營養。
      setBaseGrams(g)
      return
    }
    applyScale(g / baseGrams)
  }

  /** 手動微調一個數字：即時改，基準同步跟住改，之後改份量都按比例郁。 */
  function onManualEdit(field: keyof Nutrients, value: number) {
    const v = Number.isFinite(value) ? Math.max(0, value) : 0
    setNutrients((prev) => ({ ...prev, [field]: v }))
    setBaseNutrients((prev) => ({
      ...prev,
      [field]: scale > 0 ? round1(v / scale) : v,
    }))
  }

  function onSaveSheet() {
    onSave({
      nameZH: name.trim() || item.nameZH,
      portionDescription:
        mode === 'grams' && gramsStr.trim() !== ''
          ? `約${gramsStr.trim()}克`
          : item.portionDescription,
      ...nutrients,
      isExcluded: excluded,
    })
  }

  const gramsHint =
    mode === 'servings'
      ? baseGrams !== null
        ? `≈ ${Math.round(baseGrams * scale)} 克 · 改份量會自動調整營養數值`
        : '改份量會自動調整營養數值'
      : gramsStr.trim() !== ''
        ? `≈ ${gramsStr.trim()} 克 · 改份量會自動調整營養數值`
        : '輸入克數，營養會按比例調整'

  return (
    <GlassModal open onClose={onClose} variant="sheet">
      {/* 頂欄：返回＋搞掂 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="glass-pill px-3 py-1.5 text-sm font-bold text-white/80"
        >
          ‹ 返回
        </button>
        <button
          type="button"
          onClick={onSaveSheet}
          className="glass-cta-amber rounded-full px-4 py-1.5 text-sm font-bold text-white"
        >
          搞掂
        </button>
      </div>

      {/* 名稱＋剔除／恢復 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="食材名稱"
          className={`glass-input min-w-0 flex-1 text-lg font-bold ${
            excluded ? 'line-through opacity-50' : ''
          }`}
        />
        <button
          type="button"
          onClick={() => setExcluded((v) => !v)}
          title={excluded ? '恢復呢樣' : '剔除呢樣'}
          aria-label={excluded ? '恢復呢樣' : '剔除呢樣'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-500/40"
        >
          {excluded ? <RotateCcwIcon size={20} /> : <TrashIcon size={20} />}
        </button>
      </div>
      {excluded && (
        <p className="mt-2 text-sm text-white/50">
          呢樣已剔除，唔會計入總數——撳紅色掣可以恢復。
        </p>
      )}

      {/* 份量 */}
      <p className="mt-4 text-sm font-bold text-white/60">份量</p>
      <div className="mt-1 flex items-center gap-2">
        {mode === 'servings' ? (
          <input
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.5"
            value={servingsStr}
            onChange={(e) => onServingsChange(e.target.value)}
            aria-label="份數"
            className="glass-input min-w-0 flex-1 text-center text-lg font-bold"
          />
        ) : (
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            value={gramsStr}
            onChange={(e) => onGramsChange(e.target.value)}
            placeholder="輸入克數"
            aria-label="克數"
            className="glass-input min-w-0 flex-1 text-center text-lg font-bold"
          />
        )}
        <span className="w-6 shrink-0 text-center font-bold text-white/60">
          {mode === 'servings' ? '份' : '克'}
        </span>
        <div className="flex shrink-0 rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setMode('servings')}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${
              mode === 'servings' ? 'glass-cta-amber text-white' : 'text-white/60'
            }`}
          >
            份數
          </button>
          <button
            type="button"
            onClick={() => setMode('grams')}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${
              mode === 'grams' ? 'glass-cta-amber text-white' : 'text-white/60'
            }`}
          >
            克
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-white/40">{gramsHint}</p>

      {/* 營養資料 */}
      <p className="mt-4 text-sm font-bold text-white/60">營養資料</p>
      {editingField === 'calories' ? (
        <input
          type="number"
          inputMode="decimal"
          min="0"
          autoFocus
          value={nutrients.calories}
          onChange={(e) => onManualEdit('calories', Number(e.target.value) || 0)}
          onBlur={() => setEditingField(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setEditingField(null)
          }}
          aria-label="卡路里"
          className="glass-inset mt-2 w-full rounded-2xl p-3 text-center text-3xl font-bold outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('calories')}
          className="glass-inset mt-2 block w-full rounded-2xl p-3 text-center"
        >
          <span className="text-3xl font-bold">🔥 {nutrients.calories}</span>
          <span className="ml-1 text-white/50">kcal</span>
          <span className="block text-xs text-white/40">撳嚟改</span>
        </button>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="glass-inset rounded-2xl p-3 text-center">
            <p className="text-xs text-white/50">{f.label}</p>
            {editingField === f.key ? (
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={f.step}
                autoFocus
                value={nutrients[f.key]}
                onChange={(e) =>
                  onManualEdit(f.key, Number(e.target.value) || 0)
                }
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingField(null)
                }}
                aria-label={f.label}
                className="mt-0.5 w-full bg-transparent text-center text-lg font-bold outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingField(f.key)}
                className="mt-0.5 block w-full text-lg font-bold"
              >
                {nutrients[f.key]}
                <span className="text-xs font-normal text-white/40">
                  {f.unit}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-white/40">
        撳任何一個數字可以直接改，改份量會按比例重計
      </p>

      {/* 刪除（兩下確認） */}
      <button
        type="button"
        onClick={() => {
          if (!confirmDelete) {
            setConfirmDelete(true)
            return
          }
          onDelete()
        }}
        className={`mt-4 w-full rounded-2xl py-3 font-bold ${
          confirmDelete
            ? 'bg-red-600 text-white'
            : 'bg-white/[0.06] text-red-400 ring-1 ring-red-500/40'
        }`}
      >
        {confirmDelete ? '再撳一次確認刪除呢樣' : '刪除呢樣食材'}
      </button>
    </GlassModal>
  )
}

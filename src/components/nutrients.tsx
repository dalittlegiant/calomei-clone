// Shared 7-nutrient icon + semantic-colour system (2026-11-24).
// Single source of truth for the nutrient look — used by the Progress
// chart filter capsules, saved-food cards and search detail sheets.
// Icons are @phosphor-icons/react weight="fill", one colour per nutrient;
// no emoji anywhere.

import type { ComponentType } from 'react'
import {
  Bone,
  Cube,
  Drop,
  Flame,
  Grains,
  Plant,
  Sparkle,
  type Icon,
} from '@phosphor-icons/react'

export type NutrientKey =
  | 'calories'
  | 'proteinG'
  | 'carbsG'
  | 'fatG'
  | 'sugarG'
  | 'fiberG'
  | 'sodiumMg'

export interface NutrientMeta {
  label: string
  unit: string
  /** Semantic colour — the icon's colour; text stays neutral. */
  color: string
  Icon: Icon
}

export const NUTRIENT_META: Record<NutrientKey, NutrientMeta> = {
  calories: { label: '熱量', unit: 'kcal', color: '#F59E0B', Icon: Flame },
  proteinG: { label: '蛋白質', unit: 'g', color: '#F43F5E', Icon: Bone },
  carbsG: { label: '碳水', unit: 'g', color: '#EAB308', Icon: Grains },
  fatG: { label: '脂肪', unit: 'g', color: '#14B8A6', Icon: Drop },
  sugarG: { label: '糖', unit: 'g', color: '#EC4899', Icon: Cube },
  fiberG: { label: '纖維', unit: 'g', color: '#22C55E', Icon: Plant },
  sodiumMg: { label: '鈉', unit: 'mg', color: '#38BDF8', Icon: Sparkle },
}

/** The nutrient's icon in its semantic colour. Pass `color` to override
 *  (e.g. white inside a filled amber capsule). */
export function NutrientIcon({
  nutrient,
  size = 18,
  color,
  className,
}: {
  nutrient: NutrientKey
  size?: number
  color?: string
  className?: string
}) {
  const meta = NUTRIENT_META[nutrient]
  const IconCmp: ComponentType<{
    size?: number | string
    weight?: 'fill'
    className?: string
    style?: React.CSSProperties
  }> = meta.Icon
  return (
    <IconCmp
      size={size}
      weight="fill"
      className={className}
      style={{ color: color ?? meta.color }}
    />
  )
}

/** Compact "icon + value" mini used in saved-food cards and detail rows,
 *  e.g. Bone icon + "18g". Value is already rounded by the caller. */
export function NutrientMini({
  nutrient,
  value,
  size = 14,
}: {
  nutrient: NutrientKey
  value: number
  size?: number
}) {
  const meta = NUTRIENT_META[nutrient]
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-white/70">
      <NutrientIcon nutrient={nutrient} size={size} />
      {value}
      {meta.unit}
    </span>
  )
}

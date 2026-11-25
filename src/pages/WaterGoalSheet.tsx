// Daily water goal sheet — 每日飲水目標（2026-11-25）。
// 由 WaterPanel 嘅「你啲樽」設定抽出嚟共用：主頁飲水卡支鉛筆掣同
// 飲水轉盤中央掣開同一張 sheet。杯／毫升切換，杯模式每次 ±1 杯
// （250 ml），毫升模式每次 ±100 ml；範圍 500–5000 ml，存入
// settings `water_goal_ml`（主頁飲水卡用 live query 讀同一個 key，
// 一存即刻重算目標樽數／仲差幾多／樽圖示數目）。
// 確定掣用湖水綠玻璃（同飲水卡 +1 樽掣一樣，係水嘅主題色）。
import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../lib/db'
import { WATER_TARGET_ML } from '../lib/nutrition'
import { GlassButton, GlassModal } from '../components/ui'

const CUP_ML = 250
const ML_STEP = 100
const GOAL_MIN_ML = 500
const GOAL_MAX_ML = 5000

interface Props {
  open: boolean
  onClose: () => void
}

export default function WaterGoalSheet({ open, onClose }: Props) {
  const [goalMl, setGoalMl] = useState(WATER_TARGET_ML)
  const [goalUnit, setGoalUnit] = useState<'cups' | 'ml'>('cups')

  // 每次打開都由 settings 讀最新目標，唔用舊值。
  useEffect(() => {
    if (open) {
      getSetting<number>('water_goal_ml', WATER_TARGET_ML).then(setGoalMl)
    }
  }, [open ])

  const step = goalUnit === 'cups' ? CUP_ML : ML_STEP
  const goalCups = Math.round(goalMl / CUP_ML)
  const goalDisplay =
    goalUnit === 'cups' ? `${goalCups}` : `${goalMl.toLocaleString()}`
  const goalUnitLabel = goalUnit === 'cups' ? '杯' : '毫升'

  async function saveGoal() {
    await setSetting('water_goal_ml', goalMl)
    onClose()
  }

  return (
    <GlassModal open={open} onClose={onClose} variant="sheet">
      <div
        aria-hidden
        className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20"
      />
      <h3 className="text-center text-lg font-bold">每日飲水目標</h3>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-black/25 p-1">
        {(
          [
            { id: 'cups', label: '杯' },
            { id: 'ml', label: '毫升' },
          ] as const
        ).map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setGoalUnit(u.id)}
            className={`pressable rounded-xl py-2.5 font-bold ${
              goalUnit === u.id
                ? 'bg-white/[0.12] text-white'
                : 'text-white/50'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-sm text-white/50">
        {goalUnit === 'cups'
          ? '建議每日飲 6-10 杯水 (每杯約 250ml)'
          : '建議每日飲 1,500 - 2,500 毫升'}
      </p>
      <div className="mt-3 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => setGoalMl((v) => Math.max(GOAL_MIN_ML, v - step))}
          disabled={goalMl <= GOAL_MIN_ML}
          aria-label="減少目標"
          className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-2xl font-bold disabled:opacity-30"
        >
          −
        </button>
        <div className="w-20 text-center">
          <p className="text-4xl font-bold tabular-nums text-[#2DD4BF]">
            {goalDisplay}
          </p>
          <p className="mt-0.5 text-sm text-white/50">{goalUnitLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setGoalMl((v) => Math.min(GOAL_MAX_ML, v + step))}
          disabled={goalMl >= GOAL_MAX_ML}
          aria-label="增加目標"
          className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-2xl font-bold disabled:opacity-30"
        >
          ＋
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-white/40">
        範圍：500 - 5000 毫升
      </p>
      <GlassButton
        variant="teal"
        onClick={saveGoal}
        className="pressable mt-4 w-full rounded-2xl py-3 text-base"
      >
        確定
      </GlassButton>
    </GlassModal>
  )
}

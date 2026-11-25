// Water wheel panel — 飲咗邊樽？
// Replaces the old "+1 樽 / +250ml / 自訂" water view. Pick a bottle on
// the three-sector wheel, fine-tune in 50 ml steps, confirm with the
// teal glass CTA. The centre button opens the daily water-goal setting
// （共用 WaterGoalSheet，杯／毫升切換，杯模式 ±1 杯、毫升模式 ±100 ml，
// 500–5000 ml，存入 settings `water_goal_ml`）.
// Writes to the existing water_entries table; no schema change.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BeerBottle, Coffee, PencilSimple } from '@phosphor-icons/react'
import { db } from '../lib/db'
import { BOTTLE_ML } from '../lib/nutrition'
import { dayStartMinutes, getDayStart, todayLogStartMs } from '../lib/day'
import { GlassButton } from '../components/ui'
import WaterGoalSheet from './WaterGoalSheet'

const CUP_ML = 250
const BIG_ML = 1000
const STEP_ML = 50

interface Props {
  onDone: (msg: string) => void
  onClose: () => void
}

type Sector = 'cup' | 'bottle' | 'big'

const SECTORS: Array<{
  id: Sector
  label: string
  ml: number
  /** Centre angle of the sector, 0° = 12 o'clock, clockwise. */
  angle: number
  /** Icon component (line weight — the wheel uses outline icons). */
  Icon: typeof Coffee
  iconSize: number
}> = [
  { id: 'cup', label: '杯', ml: CUP_ML, angle: 0, Icon: Coffee, iconSize: 30 },
  { id: 'bottle', label: '樽', ml: BOTTLE_ML, angle: 120, Icon: BeerBottle, iconSize: 30 },
  { id: 'big', label: '大樽', ml: BIG_ML, angle: 240, Icon: BeerBottle, iconSize: 30 },
]

// ---- wheel geometry (SVG, 300×300, centre 150,150, radius 138) ----
const CX = 150
const CY = 150
const R = 138

function polar(angleDeg: number, r: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function sectorPath(startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(startDeg, R)
  const [x2, y2] = polar(endDeg, R)
  return `M ${CX} ${CY} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`
}

export default function WaterPanel({ onDone, onClose }: Props) {
  const [dayStart, setDayStart] = useState('00:00')
  const [amount, setAmount] = useState(BOTTLE_ML)
  const [sector, setSector] = useState<Sector>('bottle')
  const [goalOpen, setGoalOpen] = useState(false)

  const waterToday = useLiveQuery(
    () =>
      db.water_entries
        .where('date')
        .aboveOrEqual(todayLogStartMs(dayStartMinutes(dayStart)))
        .toArray(),
    [dayStart],
  )
  const waterTotal = (waterToday ?? []).reduce((a, w) => a + w.amountML, 0)

  useEffect(() => {
    getDayStart().then(setDayStart)
  }, [])

  function pickSector(s: (typeof SECTORS)[number]) {
    setSector(s.id)
    setAmount(s.ml)
  }

  function step(delta: number) {
    setAmount((v) => Math.max(0, Math.min(3000, v + delta)))
  }

  async function confirm() {
    if (amount <= 0) return
    const now = Date.now()
    await db.water_entries.add({
      id: crypto.randomUUID(),
      amountML: Math.round(amount),
      date: now,
      createdAt: now,
    })
    onDone(`已加入 ${Math.round(amount)} ml 水`)
    onClose()
  }

  async function undoWater() {
    const last = (waterToday ?? []).sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0]
    if (!last) return
    await db.water_entries.delete(last.id)
  }

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold text-white/70"
        >
          ✕
        </button>
        <h2 className="flex-1 pr-9 text-center text-lg font-bold">飲咗邊樽？</h2>
      </div>
      <p className="mt-1 text-center text-sm text-white/50">
        揀樽就填好 ml，唔啱自己改
      </p>

      {/* ---- three-sector wheel ---- */}
      <div className="relative mx-auto mt-4 h-[300px] w-[300px]">
        <svg
          viewBox="0 0 300 300"
          className="h-full w-full"
          role="group"
          aria-label="揀樽"
        >
          <circle
            cx={CX}
            cy={CY}
            r={R + 1}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.10)"
          />
          {SECTORS.map((s) => {
            const selected = sector === s.id
            const [tx, ty] = polar(s.angle, 96)
            const Icon = s.Icon
            return (
              <g
                key={s.id}
                onClick={() => pickSector(s)}
                className="cursor-pointer"
                role="button"
                aria-pressed={selected}
                aria-label={`${s.label} ${s.ml.toLocaleString()} ml`}
              >
                <path
                  d={sectorPath(s.angle - 60, s.angle + 60)}
                  fill={selected ? 'rgba(20,184,166,0.22)' : 'rgba(255,255,255,0.03)'}
                  stroke={selected ? '#14B8A6' : 'rgba(255,255,255,0.14)'}
                  strokeWidth={selected ? 2 : 1}
                  style={
                    selected
                      ? { filter: 'drop-shadow(0 0 6px rgba(20,184,166,0.55))' }
                      : undefined
                  }
                />
                <g transform={`translate(${tx - 15}, ${ty - 34})`}>
                  <Icon
                    size={s.iconSize}
                    weight="regular"
                    color={selected ? '#2DD4BF' : 'rgba(255,255,255,0.75)'}
                  />
                </g>
                <text
                  x={tx}
                  y={ty + 6}
                  textAnchor="middle"
                  fill={selected ? '#FFFFFF' : 'rgba(255,255,255,0.85)'}
                  fontSize="17"
                  fontWeight="700"
                >
                  {s.label}
                </text>
                <text
                  x={tx}
                  y={ty + 26}
                  textAnchor="middle"
                  fill={selected ? '#2DD4BF' : 'rgba(255,255,255,0.55)'}
                  fontSize="13"
                  fontWeight="600"
                >
                  {s.ml.toLocaleString()} ml
                </text>
              </g>
            )
          })}
        </svg>
        {/* Centre button — daily water goal. */}
        <button
          type="button"
          onClick={() => setGoalOpen(true)}
          aria-label="每日飲水目標"
          className="pressable absolute top-1/2 left-1/2 flex h-[108px] w-[108px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full bg-[#17140F] ring-1 ring-white/15"
        >
          <PencilSimple size={20} weight="regular" className="text-white/60" />
          <span className="text-sm font-bold text-white/85">你啲樽</span>
        </button>
      </div>

      {/* ---- fine-tune card ---- */}
      <div className="mt-4 rounded-2xl glass-subcard p-4">
        <p className="text-sm font-bold text-white/60">飲咗幾多</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-STEP_ML)}
            disabled={amount <= 0}
            aria-label="減 50 毫升"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl font-bold disabled:opacity-30"
          >
            −
          </button>
          <div className="min-w-0 flex-1 rounded-xl bg-black/25 py-2.5 text-center">
            <span className="text-3xl font-bold tabular-nums">{amount.toLocaleString()}</span>{' '}
            <span className="font-bold text-white/60">ml</span>
          </div>
          <button
            type="button"
            onClick={() => step(STEP_ML)}
            aria-label="加 50 毫升"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl font-bold"
          >
            ＋
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-white/50">
          今日共 {waterTotal.toLocaleString()} ml · 每撳 50 ml
        </p>
      </div>

      <GlassButton
        variant="teal"
        onClick={confirm}
        disabled={amount <= 0}
        className="pressable mt-3 w-full rounded-2xl py-3 text-base"
      >
        加入 {amount.toLocaleString()} ml
      </GlassButton>
      {(waterToday ?? []).length > 0 && (
        <button
          type="button"
          onClick={undoWater}
          className="pressable mt-2 w-full py-1 text-center text-sm font-bold text-white/40"
        >
          撤銷上一筆
        </button>
      )}

      {/* ---- daily goal sheet (shared with the home water card) ---- */}
      <WaterGoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  )
}

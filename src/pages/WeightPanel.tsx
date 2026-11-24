// Weight panel — 上磅
// Realistic black-glass scale + draggable 0.1 kg ruler. The LED readout
// uses the bundled DSEG7 seven-segment font (`.font-led`); the scale
// illustration is pure CSS (diagonal glass glare + CaLoMei mark).
// kg / lb toggle converts the display only — storage stays kg, ruler
// stays kg per spec. Writes to the existing weight_entries table;
// no schema change.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { GlassButton } from '../components/ui'

const MIN_KG = 30
const MAX_KG = 150
const STEP_KG = 0.1
const TICK_W = 8 // px per 0.1 kg — 1 kg = 80 px
const TICK_COUNT = Math.round((MAX_KG - MIN_KG) / STEP_KG) + 1
const KG_TO_LB = 2.20462

/** Memoised ruler track — 1,201 ticks must not rebuild on every scroll. */
const WeightRulerTrack = memo(function WeightRulerTrack({
  onPick,
}: {
  onPick: (v: number) => void
}) {
  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT }, (_, i) => {
        const v = MIN_KG + i * STEP_KG
        const whole = Math.abs(v - Math.round(v)) < 1e-9
        const half = !whole && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9
        return { v, whole, half }
      }),
    [],
  )
  return (
    <div
      className="flex w-max items-start"
      style={{
        paddingLeft: `calc(50% - ${TICK_W / 2}px)`,
        paddingRight: `calc(50% - ${TICK_W / 2}px)`,
      }}
    >
      {ticks.map((t) => (
        <button
          key={t.v.toFixed(1)}
          type="button"
          onClick={() => onPick(t.v)}
          aria-label={`${t.v.toFixed(1)} kg`}
          className="pressable flex w-[8px] shrink-0 flex-col items-center pt-1"
        >
          <span
            className={
              t.whole
                ? 'h-8 w-[2px] rounded bg-white/60'
                : t.half
                  ? 'h-6 w-[2px] rounded bg-white/35'
                  : 'h-4 w-[2px] rounded bg-white/20'
            }
          />
          <span className="mt-1 h-4 text-[10px] text-white/40 tabular-nums">
            {t.whole ? Math.round(t.v) : ''}
          </span>
        </button>
      ))}
    </div>
  )
})

interface Props {
  onDone: (msg: string) => void
  onClose: () => void
}

function fmtDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function WeightPanel({ onDone, onClose }: Props) {
  const latestWeight = useLiveQuery(
    () => db.weight_entries.orderBy('date').last(),
    [],
  )
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [kg, setKg] = useState<number | null>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const suppressRef = useRef(0)
  const touchedRef = useRef(false)
  const defaultedRef = useRef(false)
  const now = useMemo(() => new Date(), [])

  // Default to the last recorded weight; if none arrives (no rows), fall
  // back to 65 kg after a short wait. Never overrides a user drag.
  useEffect(() => {
    if (defaultedRef.current || !latestWeight) return
    defaultedRef.current = true
    setKg(latestWeight.weightKG)
  }, [latestWeight])
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!defaultedRef.current) {
        defaultedRef.current = true
        setKg(65)
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [])

  // Centre the ruler on the default weight (only before the user touches it).
  useEffect(() => {
    if (kg === null || touchedRef.current) return
    const el = rulerRef.current
    if (!el) return
    const idx = Math.round((kg - MIN_KG) / STEP_KG)
    suppressRef.current = Date.now() + 450
    el.scrollTo({ left: idx * TICK_W, behavior: 'auto' })
  }, [kg])

  function pickKg(v: number) {
    touchedRef.current = true
    const clamped = Math.min(MAX_KG, Math.max(MIN_KG, Math.round(v * 10) / 10))
    setKg(clamped)
    const el = rulerRef.current
    if (!el) return
    suppressRef.current = Date.now() + 450
    el.scrollTo({
      left: Math.round((clamped - MIN_KG) / STEP_KG) * TICK_W,
      behavior: 'smooth',
    })
  }
  const onPickKg = useCallback(pickKg, [])

  function onRulerScroll() {
    const el = rulerRef.current
    if (!el) return
    if (Date.now() < suppressRef.current) return
    touchedRef.current = true
    const idx = Math.round(el.scrollLeft / TICK_W)
    const v = Math.min(MAX_KG, Math.max(MIN_KG, MIN_KG + idx * STEP_KG))
    setKg(Math.round(v * 10) / 10)
  }

  async function save() {
    if (kg === null || kg <= 0) return
    const nowMs = Date.now()
    await db.weight_entries.add({
      id: crypto.randomUUID(),
      weightKG: kg,
      date: nowMs,
      createdAt: nowMs,
    })
    onDone(`體重已記錄：${kg} kg`)
    onClose()
  }

  // Ticks are memoised in WeightRulerTrack — scroll state updates must
  // not rebuild 1,201 nodes.
  const displayKg = kg ?? 65
  const displayValue =
    unit === 'kg'
      ? displayKg.toFixed(1)
      : (displayKg * KG_TO_LB).toFixed(1)
  const displayUnit = unit === 'kg' ? 'kg' : 'lb'
  const lastText = latestWeight
    ? `上次 ${latestWeight.weightKG.toFixed(1)} kg · ${fmtDay(latestWeight.date)}`
    : '未有上次記錄'

  return (
    <div>
      {/* Top row: cancel | title + date/time | unit toggle. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="pressable font-bold text-[#FF9F0A]"
        >
          算啦
        </button>
        <div className="text-center">
          <p className="text-lg font-bold">上磅</p>
          <p className="text-xs text-white/50">
            今日 · {fmtTime(now)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUnit((u) => (u === 'kg' ? 'lb' : 'kg'))}
          className="pressable rounded-full bg-white/[0.06] px-3 py-1 font-bold text-[#FF9F0A]"
          aria-label="切換單位"
        >
          {unit} ▾
        </button>
      </div>

      {/* Realistic black-glass scale. */}
      <div className="mx-auto mt-5 w-[210px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#26221e] to-[#0f0d0b] p-4 ring-1 ring-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
          {/* Diagonal glass glare. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 42%, rgba(255,255,255,0.03) 50%, transparent 62%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(115deg, transparent 55%, rgba(255,255,255,0.06) 66%, transparent 76%)',
            }}
          />
          {/* LED display. */}
          <div className="relative mx-auto flex h-[64px] w-[150px] items-center justify-center rounded-xl bg-black ring-1 ring-white/10">
            <span className="font-led text-[34px] leading-none text-[#FFB340] [text-shadow:0_0_12px_rgba(255,159,10,0.55)]">
              {displayValue}
            </span>
            <span className="ml-1 mt-4 text-xs font-bold text-[#FF9F0A]/80">
              {displayUnit}
            </span>
          </div>
          {/* Foot pads. */}
          <div className="relative mt-4 flex justify-between px-2">
            <span className="h-10 w-14 rounded-full bg-black/40 ring-1 ring-white/[0.07]" />
            <span className="h-10 w-14 rounded-full bg-black/40 ring-1 ring-white/[0.07]" />
          </div>
          <p className="relative mt-3 text-center text-[10px] font-bold tracking-[0.3em] text-white/35">
            CaLoMei
          </p>
        </div>
      </div>

      {/* Ruler. */}
      <div className="mt-5">
        <p className="text-center text-sm font-bold text-white/60">
          拉吓把尺 個磅就跟住跳
        </p>
        <div className="relative mt-3">
          <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2">
            <div className="h-11 w-1 rounded-full bg-[#FF9F0A]" />
          </div>
          <div
            ref={rulerRef}
            onScroll={onRulerScroll}
            className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <WeightRulerTrack onPick={onPickKg} />
          </div>
        </div>
        <p className="mt-1 text-center text-sm text-white/50">{lastText}</p>
      </div>

      <GlassButton
        variant="amber"
        onClick={save}
        disabled={kg === null}
        className="pressable mt-4 w-full rounded-2xl py-3 text-base"
      >
        記低
      </GlassButton>
    </div>
  )
}

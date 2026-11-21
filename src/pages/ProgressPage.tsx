// Progress — 進度頁，照原 app
// - 30 日營養圖：7 種營養切換，上限虛線，超標紅柱
// - 身體卡：體重 / 體脂 / 肌肉率 / 內臟脂肪 / BMI（趨勢 + 撳 + 直接記錄）
// - 熱量赤字（近 14 日）：累計 + 日均 + 7,700 kcal ≈ 1 公斤體脂

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type UserProfile } from '../lib/db'
import {
  bmi,
  bmiLabel,
  effectiveTarget,
  type NutritionTarget,
} from '../lib/nutrition'
import {
  dayStartMinutes,
  getDayStart,
  logDayKey,
  todayLogStartMs,
} from '../lib/day'
import { GlassCard } from '../components/ui'

interface Props {
  profile: UserProfile
}

type NutrientKey =
  | 'calories'
  | 'proteinG'
  | 'carbsG'
  | 'fatG'
  | 'sugarG'
  | 'fiberG'
  | 'sodiumMg'

const NUTRIENTS: Array<{
  key: NutrientKey
  label: string
  unit: string
  target: (t: NutritionTarget) => number
}> = [
  { key: 'calories', label: '熱量', unit: 'kcal', target: (t) => t.calories },
  { key: 'proteinG', label: '蛋白質', unit: 'g', target: (t) => t.proteinG },
  { key: 'carbsG', label: '碳水', unit: 'g', target: (t) => t.carbsG },
  { key: 'fatG', label: '脂肪', unit: 'g', target: (t) => t.fatG },
  { key: 'sugarG', label: '糖', unit: 'g', target: (t) => t.sugarCeilingG },
  { key: 'fiberG', label: '纖維', unit: 'g', target: (t) => t.fiberFloorG },
  { key: 'sodiumMg', label: '鈉', unit: 'mg', target: (t) => t.sodiumCeilingMg },
]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function ProgressPage({ profile }: Props) {
  const [dayStart, setDayStart] = useState('00:00')
  const [nutrient, setNutrient] = useState<NutrientKey>('calories')
  const [offset, setOffset] = useState(0) // 0 = 最近 30 日，-30 = 再早 30 日
  const [showBodyForm, setShowBodyForm] = useState(false)
  const [weightKg, setWeightKg] = useState('')
  const [bodyFatPct, setBodyFatPct] = useState('')
  const [musclePct, setMusclePct] = useState('')
  const [visceral, setVisceral] = useState('')
  const [bodyMsg, setBodyMsg] = useState<string | null>(null)

  useEffect(() => {
    getDayStart().then(setDayStart)
  }, [])

  const startMin = dayStartMinutes(dayStart)
  const entries = useLiveQuery(() => db.food_entries.toArray(), [])
  const exercise = useLiveQuery(() => db.exercise_entries.toArray(), [])
  const weights = useLiveQuery(
    () => db.weight_entries.orderBy('date').toArray(),
    [],
  )
  const bodyFats = useLiveQuery(
    () => db.body_fat_entries.orderBy('date').toArray(),
    [],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const target = effectiveTarget(profile, override ?? null)

  // ---- 30-day chart ----
  const windowEnd = todayLogStartMs(startMin) + offset * 86_400_000
  const chartDays = useMemo(() => {
    const days: Array<{ key: string; startMs: number }> = []
    for (let i = 29; i >= 0; i--) {
      const startMs = windowEnd - i * 86_400_000
      days.push({ key: logDayKey(startMs, startMin), startMs })
    }
    return days
  }, [windowEnd, startMin])

  const dayTotals = useMemo(() => {
    const map = new Map<string, Record<NutrientKey, number>>()
    for (const e of entries ?? []) {
      const key = logDayKey(e.date, startMin)
      const cur =
        map.get(key) ??
        ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 } as Record<NutrientKey, number>)
      cur.calories += e.calories
      cur.proteinG += e.proteinG
      cur.carbsG += e.carbsG
      cur.fatG += e.fatG
      cur.sugarG += e.sugarG ?? 0
      cur.fiberG += e.fiberG ?? 0
      cur.sodiumMg += e.sodiumMg ?? 0
      map.set(key, cur)
    }
    return map
  }, [entries, startMin])

  const nutrientDef = NUTRIENTS.find((n) => n.key === nutrient)!
  const limit = nutrientDef.target(target)
  const values = chartDays.map(
    (d) => dayTotals.get(d.key)?.[nutrient] ?? 0,
  )
  const maxVal = Math.max(limit, ...values, 1)
  const windowLabel = `${fmtDate(chartDays[0].startMs)} – ${fmtDate(chartDays[29].startMs)}`

  // ---- body cards ----
  const latestWeight = (weights ?? []).slice(-1)[0]
  const latestBodyFat = (bodyFats ?? []).slice(-1)[0]
  const prevBodyFat = (bodyFats ?? []).slice(-2, -1)[0]
  const latestBmi = latestWeight
    ? bmi(latestWeight.weightKG, profile.heightCM)
    : 0
  const standardWeight = 22.9 * (profile.heightCM / 100) ** 2
  const weightSpark = useMemo(() => {
    const last = (weights ?? []).slice(-14)
    if (last.length < 2) return []
    const min = Math.min(...last.map((w) => w.weightKG))
    const max = Math.max(...last.map((w) => w.weightKG))
    const span = max - min || 1
    return last.map((w) => ({
      date: w.date,
      h: 15 + ((w.weightKG - min) / span) * 85,
    }))
  }, [weights])

  // ---- deficit, last 14 log days ----
  const deficit = useMemo(() => {
    let sum = 0
    const todayStart = todayLogStartMs(startMin)
    for (let i = 0; i < 14; i++) {
      const startMs = todayStart - i * 86_400_000
      const key = logDayKey(startMs, startMin)
      const eaten = dayTotals.get(key)?.calories ?? 0
      const burned = (exercise ?? [])
        .filter((e) => logDayKey(e.date, startMin) === key)
        .reduce((a, e) => a + e.caloriesBurned, 0)
      sum += target.calories - eaten + burned
    }
    return { total: Math.round(sum), avg: Math.round(sum / 14) }
  }, [dayTotals, exercise, startMin, target.calories])

  async function saveBody() {
    const kg = Number(weightKg)
    const bf = bodyFatPct.trim() === '' ? null : Number(bodyFatPct)
    const muscle = musclePct.trim() === '' ? null : Number(musclePct)
    const visc = visceral.trim() === '' ? null : Number(visceral)
    if (!kg || kg <= 0) return
    if ((muscle !== null || visc !== null) && bf === null) {
      setBodyMsg('要填埋體脂，先存到肌肉率／內臟脂肪')
      window.setTimeout(() => setBodyMsg(null), 3000)
      return
    }
    const now = Date.now()
    await db.weight_entries.add({
      id: crypto.randomUUID(),
      weightKG: kg,
      date: now,
      createdAt: now,
    })
    if (bf !== null && bf > 0 && bf < 100) {
      await db.body_fat_entries.add({
        id: crypto.randomUUID(),
        bodyFatPercentage: bf,
        date: now,
        createdAt: now,
        muscleRate: muscle !== null && muscle > 0 && muscle < 100 ? muscle : null,
        visceralFat: visc !== null && visc > 0 ? visc : null,
      })
    }
    setWeightKg('')
    setBodyFatPct('')
    setMusclePct('')
    setVisceral('')
    setShowBodyForm(false)
    setBodyMsg('身體數據已記錄')
    window.setTimeout(() => setBodyMsg(null), 2500)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8 md:max-w-2xl">
      {/* Nutrition chart */}
      <GlassCard className="mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">📊 營養趨勢</h2>
          <span className="text-sm text-white/50">{windowLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {NUTRIENTS.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setNutrient(n.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                nutrient === n.key
                  ? 'glass-cta-amber text-white'
                  : 'bg-white/[0.06] text-white/60'
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="relative mt-4 h-44">
          {/* Limit dashed line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-red-400"
            style={{ bottom: `${(limit / maxVal) * 100}%` }}
          >
            <span className="absolute -top-5 right-0 rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-bold text-red-300">
              上限 {limit}
              {nutrientDef.unit}
            </span>
          </div>
          <div className="flex h-full items-end gap-[2px]">
            {values.map((v, i) => (
              <div
                key={chartDays[i].key}
                className="flex h-full flex-1 flex-col items-center justify-end"
                title={`${fmtDate(chartDays[i].startMs)}：${round1(v)}${nutrientDef.unit}`}
              >
                <div
                  className={`w-full rounded-t-sm ${
                    v > limit ? 'bg-red-400' : 'bg-[#FF9F0A]'
                  }`}
                  style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / maxVal) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-white/40">
          <span>{fmtDate(chartDays[0].startMs)}</span>
          <span>{fmtDate(chartDays[9].startMs)}</span>
          <span>{fmtDate(chartDays[19].startMs)}</span>
          <span>{fmtDate(chartDays[29].startMs)}</span>
        </div>
        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 30)}
            className="rounded-xl bg-white/[0.06] px-3 py-1.5 text-sm font-bold text-white/60"
          >
            ← 早 30 日
          </button>
          <button
            type="button"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 30))}
            className="rounded-xl bg-stone-100 px-3 py-1.5 text-sm font-bold text-stone-600 disabled:opacity-40"
          >
            遲 30 日 →
          </button>
        </div>
        <p className="mt-2 text-xs text-white/40">
          紅柱 = 嗰日超咗上限。撳柱睇數字（長按／hover）。
        </p>
      </GlassCard>

      {/* Body cards */}
      <GlassCard className="mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">🧍 身體</h2>
          <button
            type="button"
            onClick={() => setShowBodyForm((v) => !v)}
            className="rounded-xl glass-cta-amber px-3 py-1.5 text-sm font-bold text-white"
          >
            ＋ 記錄
          </button>
        </div>

        {showBodyForm && (
          <div className="mt-3 rounded-2xl bg-[#FF9F0A]/10 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs font-bold text-white/60">體重 kg *</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="例如 64.0"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">體脂 %</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={bodyFatPct}
                  onChange={(e) => setBodyFatPct(e.target.value)}
                  placeholder="例如 24.0"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">肌肉率 %（可選）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={musclePct}
                  onChange={(e) => setMusclePct(e.target.value)}
                  placeholder="例如 38.5"
                  className="mt-0.5 glass-input"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-white/60">內臟脂肪（可選）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={visceral}
                  onChange={(e) => setVisceral(e.target.value)}
                  placeholder="例如 6"
                  className="mt-0.5 glass-input"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!Number(weightKg)}
              onClick={saveBody}
              className="mt-2 w-full rounded-2xl glass-cta-amber py-2.5 font-bold text-white disabled:opacity-40"
            >
              記錄
            </button>
          </div>
        )}
        {bodyMsg && (
          <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-center text-sm text-green-700">
            {bodyMsg}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl glass-subcard p-3">
            <p className="text-xs text-white/50">體重</p>
            <p className="mt-0.5 text-xl font-bold">
              {latestWeight ? `${latestWeight.weightKG} kg` : '未有記錄'}
            </p>
            {latestWeight && profile.targetWeightKG && (
              <p className="text-xs text-white/50">
                目標 {profile.targetWeightKG} kg · 仲差{' '}
                {round1(latestWeight.weightKG - profile.targetWeightKG)} kg
              </p>
            )}
            {weightSpark.length > 1 && (
              <div className="mt-2 flex h-8 items-end gap-0.5">
                {weightSpark.map((b, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-[#FF9F0A]"
                    style={{ height: `${b.h}%` }}
                    title={fmtDate(b.date)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl glass-subcard p-3">
            <p className="text-xs text-white/50">體脂</p>
            <p className="mt-0.5 text-xl font-bold">
              {latestBodyFat ? `${latestBodyFat.bodyFatPercentage}%` : '未有記錄'}
            </p>
            {latestBodyFat && prevBodyFat ? (
              <p className="text-xs text-white/50">
                {latestBodyFat.bodyFatPercentage > prevBodyFat.bodyFatPercentage
                  ? '↑'
                  : latestBodyFat.bodyFatPercentage < prevBodyFat.bodyFatPercentage
                    ? '↓'
                    : '→'}{' '}
                上次 {prevBodyFat.bodyFatPercentage}% · 再記先有趨勢
              </p>
            ) : (
              <p className="text-xs text-white/50">再記先有趨勢</p>
            )}
          </div>

          <div className="rounded-2xl glass-subcard p-3">
            <p className="text-xs text-white/50">肌肉率</p>
            <p className="mt-0.5 text-xl font-bold">
              {latestBodyFat?.muscleRate ? `${latestBodyFat.muscleRate}%` : '未有記錄'}
            </p>
            <p className="text-xs text-white/50">
              {latestBodyFat?.muscleRate ? '撳卡片睇全圖' : '撳 + 記錄'}
            </p>
          </div>

          <div className="rounded-2xl glass-subcard p-3">
            <p className="text-xs text-white/50">內臟脂肪</p>
            <p className="mt-0.5 text-xl font-bold">
              {latestBodyFat?.visceralFat ? `${latestBodyFat.visceralFat}` : '未有記錄'}
            </p>
            <p className="text-xs text-white/50">
              {latestBodyFat?.visceralFat ? '撳卡片睇全圖' : '撳 + 記錄'}
            </p>
          </div>

          <div className="col-span-2 rounded-2xl glass-subcard p-3">
            <p className="text-xs text-white/50">BMI</p>
            <p className="mt-0.5 text-xl font-bold">
              {latestWeight ? `${round1(latestBmi)} · ${bmiLabel(latestBmi)}` : '未有記錄'}
            </p>
            {latestWeight && latestBmi >= 23 && (
              <p className="text-xs text-white/50">
                再 -{round1(latestWeight.weightKG - standardWeight)} kg 就標準
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Calorie deficit */}
      <GlassCard className="mt-4 p-4">
        <h2 className="text-lg font-bold">🔥 熱量赤字（近 14 日）</h2>
        <p className="mt-2 text-2xl font-bold">
          {deficit.total >= 0 ? `−${deficit.total.toLocaleString()}` : `+${(-deficit.total).toLocaleString()}`}{' '}
          <span className="text-base font-normal text-white/50">kcal 累計</span>
        </p>
        <p className="mt-0.5 text-sm text-white/50">
          日均 {deficit.avg >= 0 ? `−${deficit.avg}` : `+${-deficit.avg}`} kcal
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          {deficit.total > 0
            ? `慳咗 ${deficit.total.toLocaleString()} kcal，連${deficit.total >= 7700 ? '一碗叉燒飯都夠買' : '半碗叉燒飯都未夠'}，咁都叫忍？`
            : deficit.total < 0
              ? `食多咗 ${(-deficit.total).toLocaleString()} kcal，之後嗰 14 日追返佢啦。`
              : '啱啱好打和，繼續保持。'}
        </p>
        <p className="mt-2 text-xs text-white/40">
          約 7,700 kcal 相當於 1 公斤體脂，此為估算值
        </p>
      </GlassCard>
    </div>
  )
}

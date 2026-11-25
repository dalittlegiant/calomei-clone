// Home — 今日總覽，暖黑液態玻璃風（見 DESIGN.md v2）
// 還原原本嗰版嘅結構：火焰圓環主卡、2-slide 營養卡、Roast 喺頂嘅案底卡、原裝文案。
// 只升級材質（暖黑玻璃＋著色玻璃掣）同導航，唔改排版靈魂。
// - Week strip：玻璃膠囊列，static，隨頁面碌走（2026-11-23 唔再 sticky）
// - Scorecard：橫向滑動 carousel，得兩頁
//   第 1 頁：卡路里卡（活動量＋仲剩＋已食／目標＋BMR/TDEE＋火焰圓環）+ 三大營養素
//   第 2 頁：飲水卡（樽制）+ 糖 / 纖維 / 鈉
// - 下面兩粒大掣 + 案底 feed 都係 static，唔跟 carousel 碌走
// - 展開版（md+）：雙欄 Bento——左欄主卡＋操作，右欄案底

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { DUR, easeOutExpo, springPill } from '../motion/presets'
import { AnimatedNumber, fmt1dp } from '../motion/AnimatedNumber'
import { db, type UserProfile } from '../lib/db'
import {
  activityFactor,
  BOTTLE_ML,
  effectiveTarget,
  mifflinBmr,
  WATER_TARGET_ML,
} from '../lib/nutrition'
import {
  dayStartMinutes,
  getDayStart,
  last7LogDays,
  logDayKey,
  todayLogStartMs,
} from '../lib/day'
import { MEAL_LABELS, type MealType } from '../lib/image'
import { allowanceKcalFor } from '../data/exercises'
import {
  ActivityIcon,
  CameraIcon,
  DropletIcon,
} from '../components/icons'
import {
  NUTRIENT_META,
  NutrientIcon,
  type NutrientKey,
} from '../components/nutrients'
import { GlassButton } from '../components/ui'

/** 細圓圈進度環 — 跟大卡路里火焰圓環同一套 SVG 做法（細一號，64px）。
 * 無 icon 就數值喺圓圈中間；主頁營養格傳 icon 入去（圓圈入面係營養素
 * 圖示，數值改放喺下面「值／目標」）。超咗上限（糖／鈉）圓圈變紅色。 */
function MiniRing({
  value,
  goal,
  over = false,
  /** Nutrient icon rendered in the centre instead of the number
   *  (home tiles match the original app: icon in the ring). */
  icon,
  /** Ring colour — the nutrient's semantic colour; over-ceiling
   *  still turns the ring red. */
  color = '#FF9F0A',
}: {
  value: number
  goal: number
  over?: boolean
  icon?: React.ReactNode
  color?: string
}) {
  const r = 26
  const c = 2 * Math.PI * r
  const frac = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0
  const ringColor = over ? '#F87171' : color
  return (
    <div className="relative mx-auto h-16 w-16">
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 -rotate-90"
        style={{ filter: `drop-shadow(0 0 6px ${ringColor}55)` }}
      >
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-white/10"
        />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: DUR.ring, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {icon ?? (
          <span className="text-sm leading-none font-bold tabular-nums">
            <AnimatedNumber value={value} format={fmt1dp} />
          </span>
        )}
      </span>
    </div>
  )
}

interface Props {
  profile: UserProfile
  onOpen: (entryId: string) => void
  /** Open the add sheet （又食嘢？揀個方法認罪）. */
  onAdd: () => void
  /** Open the add sheet straight at the exercise form. */
  onAddExercise: () => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 'YYYY-MM-DD' log-day key shifted by N days (local calendar). */
function shiftLogDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function HomePage({
  profile,
  onOpen,
  onAdd,
  onAddExercise,
}: Props) {
  const [dayStart, setDayStart] = useState('00:00')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [activePage, setActivePage] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getDayStart().then(setDayStart)
  }, [])

  const startMin = dayStartMinutes(dayStart)
  const todayKey = logDayKey(Date.now(), startMin)

  // Feed window: only the 7 log days the date strip can show are loaded —
  // loading every photo data URL at once bloats memory and the DOM after
  // a few hundred meals. The feed itself shows one day only (2026-11-25:
  // default today, pick a date to see that day).
  const feedWindowStartMs = useMemo(() => {
    const [y, m, d] = shiftLogDay(todayKey, -6).split('-').map(Number)
    return new Date(y, m - 1, d).getTime() + startMin * 60_000
  }, [todayKey, startMin])
  const entries = useLiveQuery(
    () =>
      db.food_entries
        .where('date')
        .aboveOrEqual(feedWindowStartMs)
        .toArray()
        .then((rows) => rows.reverse()),
    [feedWindowStartMs],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const target = effectiveTarget(profile, override ?? null)
  const bmr = Math.round(mifflinBmr(profile))
  const tdee = Math.round(mifflinBmr(profile) * activityFactor(profile.activityLevel))

  // The log day on screen: the picked day, or today. EVERY number on this
  // page (ring, macros, water, exercise) is computed from this day.
  // Previously the totals were hard-wired to today while only the feed
  // followed the picker, so picking yesterday showed today's 0s.
  const viewKey = selectedDay ?? todayKey
  const viewStart = useMemo(() => {
    const [y, m, d] = viewKey.split('-').map(Number)
    return new Date(y, m - 1, d).getTime() + startMin * 60_000
  }, [viewKey, startMin])
  const viewEnd = viewStart + 86_400_000

  const dayFood = useMemo(
    () =>
      (entries ?? []).filter(
        (e) =>
          // Unfinished / failed scans have no numbers yet — they must not
          // count towards the day's totals (they still show in the feed
          // as 「分析緊…」).
          e.scanStatus !== 'scanning' &&
          e.scanStatus !== 'failed' &&
          logDayKey(e.date, startMin) === viewKey,
      ),
    [entries, viewKey, startMin],
  )
  const totals = useMemo(() => {
    const t = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    }
    for (const e of dayFood) {
      t.calories += e.calories
      t.proteinG += e.proteinG
      t.carbsG += e.carbsG
      t.fatG += e.fatG
      t.sugarG += e.sugarG ?? 0
      t.fiberG += e.fiberG ?? 0
      t.sodiumMg += e.sodiumMg ?? 0
    }
    return t
  }, [dayFood])

  const dayWater = useLiveQuery(
    () => db.water_entries.where('date').between(viewStart, viewEnd).toArray(),
    [viewStart, viewEnd],
  )
  const waterTotal = (dayWater ?? []).reduce((a, w) => a + w.amountML, 0)

  const dayExercise = useLiveQuery(
    () =>
      db.exercise_entries.where('date').between(viewStart, viewEnd).toArray(),
    [viewStart, viewEnd],
  )
  const exerciseKcal = (dayExercise ?? []).reduce(
    (a, e) => a + e.caloriesBurned,
    0,
  )
  // 今日上限只計運動燒咗嘅 72%（2026-11-24，設定「運動計入額度」關閉
  // 就 +0；逐筆四捨五入，同記運動詳情頁顯示嘅 +數一致）。「運動燒咗」
  // 副標同赤字頁繼續用全數，唔受呢條影響。
  const exerciseCountsRow = useLiveQuery(
    () => db.settings.get('exercise_counts'),
    [],
  )
  const countsTowardAllowance = (() => {
    if (!exerciseCountsRow) return true
    try {
      return JSON.parse(exerciseCountsRow.value) as boolean
    } catch {
      return true
    }
  })()
  // 每日飲水目標（2026-11-24：飲水轉盤「你啲樽」設定，settings
  // `water_goal_ml`；未設定就用原 app 預設 2,000 ml）。
  const waterGoalRow = useLiveQuery(
    () => db.settings.get('water_goal_ml'),
    [],
  )
  const waterGoalMl = (() => {
    if (!waterGoalRow) return WATER_TARGET_ML
    try {
      return JSON.parse(waterGoalRow.value) as number
    } catch {
      return WATER_TARGET_ML
    }
  })()
  const exerciseAllowanceKcal = (dayExercise ?? []).reduce(
    (a, e) => a + allowanceKcalFor(e.caloriesBurned, countsTowardAllowance),
    0,
  )

  const remaining = target.calories - totals.calories + exerciseAllowanceKcal
  const weekDays = last7LogDays(startMin)
  const dayKeysWithEntries = useMemo(
    () => new Set((entries ?? []).map((e) => logDayKey(e.date, startMin))),
    [entries, startMin],
  )

  const feedGroups = useMemo(() => {
    // One day only: the day on screen (default today). Picking a date in
    // the strip swaps the whole feed to that day (2026-11-25).
    const list = (entries ?? []).filter(
      (e) => logDayKey(e.date, startMin) === viewKey,
    )
    const map = new Map<string, typeof list>()
    for (const e of list) {
      const key = logDayKey(e.date, startMin)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [entries, viewKey, startMin])

  function dayLabel(key: string): string {
    if (key === todayKey) return '今日'
    const yesterday = logDayKey(Date.now() - 86_400_000, startMin)
    if (key === yesterday) return '尋日'
    const d = new Date(`${key}T00:00:00`)
    return d.toLocaleDateString('zh-HK', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
  }

  function onCarouselScroll() {
    const el = carouselRef.current
    if (!el) return
    setActivePage(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goToPage(page: number) {
    const el = carouselRef.current
    if (!el) return
    el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' })
  }

  async function addBottle() {
    const now = Date.now()
    // Stamp into the day on screen (same time-of-day as now), so the water
    // total you are looking at moves when you tap +1 樽. Viewing today,
    // this is exactly `now`.
    const stamp = viewStart + (now - todayLogStartMs(startMin))
    await db.water_entries.add({
      id: crypto.randomUUID(),
      amountML: BOTTLE_ML,
      date: stamp,
      createdAt: now,
    })
  }

  const bottles = Math.floor(waterTotal / BOTTLE_ML)
  const targetBottles = Math.round(waterGoalMl / BOTTLE_ML)
  const ringFrac = Math.max(0, Math.min(1, remaining / target.calories))
  const ringC = 2 * Math.PI * 30

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 md:max-w-2xl md:pb-12">
      {/* Week strip — glass capsule row, static: scrolls away with the
          page (2026-11-23, no longer sticky under the header). */}
      <div className="pt-3 pb-3">
        <div className="glass-nav flex items-center rounded-full px-1.5 py-1.5">
          {weekDays.map((d) => {
            const isToday = d.key === todayKey
            // Today reads as selected until the user picks another day
            // (matches the original, where today was amber by default).
            const isSelected =
              selectedDay === d.key || (selectedDay === null && isToday)
            const hasEntries = dayKeysWithEntries.has(d.key)
            return (
              <button
                key={d.key}
                type="button"
                onClick={() =>
                  setSelectedDay(isSelected ? null : d.key)
                }
                className={`pressable relative flex min-w-0 flex-1 flex-col items-center rounded-full py-1 transition-colors ${
                  isSelected
                    ? 'text-white'
                    : isToday
                      ? 'text-white'
                      : 'text-white/50'
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="day-pill"
                    className="absolute inset-0 rounded-full glass-cta-amber"
                    transition={springPill}
                  />
                )}
                <span
                  className={`relative text-[11px] ${
                    isSelected ? 'text-white/90' : 'text-white/40'
                  }`}
                >
                  {d.weekday}
                </span>
                <span className="relative text-base leading-tight font-bold">
                  {d.date.getDate()}
                </span>
                <span
                  className={`relative mt-0.5 h-1 w-1 rounded-full ${
                    hasEntries ? 'bg-white/60' : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Scorecard carousel — exactly 2 pages. */}
          <div
            ref={carouselRef}
            onScroll={onCarouselScroll}
            className="no-scrollbar mt-4 flex snap-x snap-mandatory overflow-x-auto"
          >
            {/* Page 1: calories + macros. */}
            <section className="w-full shrink-0 snap-center px-0.5">
              <div className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/50">
                      活動量 ·{' '}
                      {profile.activityLevel === '久坐'
                        ? '坐定定'
                        : profile.activityLevel}
                    </p>
                    <p className="mt-1 text-3xl font-bold">
                      {remaining >= 0 ? (
                        <>
                          <AnimatedNumber value={remaining} />{' '}
                          <span className="text-lg font-normal text-white/60">
                            仲剩
                          </span>
                        </>
                      ) : (
                        <>
                          <AnimatedNumber value={-remaining} />{' '}
                          <span className="text-lg font-normal text-red-400">
                            超咗
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm whitespace-nowrap text-white/60">
                      {totals.calories} / {target.calories} kcal
                      {exerciseKcal > 0 && ` · 運動燒咗 ${exerciseKcal} kcal`}
                    </p>
                    <p className="mt-2 text-xs whitespace-nowrap text-white/40">
                      BMR {bmr} kcal · TDEE {tdee} kcal
                    </p>
                  </div>
                  {/* Flame ring: remaining proportion, glowing amber. */}
                  <div className="relative h-20 w-20 shrink-0">
                    <svg
                      viewBox="0 0 72 72"
                      className="h-20 w-20 -rotate-90 drop-shadow-[0_0_12px_rgba(255,159,10,0.6)]"
                    >
                      <circle
                        cx="36"
                        cy="36"
                        r="30"
                        fill="none"
                        strokeWidth="6"
                        className="stroke-white/10"
                      />
                      <motion.circle
                        cx="36"
                        cy="36"
                        r="30"
                        fill="none"
                        stroke="#ff9f0a"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={ringC}
                        initial={false}
                        animate={{ strokeDashoffset: ringC * (1 - ringFrac) }}
                        transition={{ duration: DUR.ring, ease: 'easeOut' }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center">
                      <NutrientIcon nutrient="calories" size={28} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    { label: '蛋白質', value: round1(totals.proteinG), goal: target.proteinG, unit: 'g', nutrient: 'proteinG' },
                    { label: '碳水', value: round1(totals.carbsG), goal: target.carbsG, unit: 'g', nutrient: 'carbsG' },
                    { label: '脂肪', value: round1(totals.fatG), goal: target.fatG, unit: 'g', nutrient: 'fatG' },
                  ] as Array<{ label: string; value: number; goal: number; unit: string; nutrient: NutrientKey }>
                ).map((m) => (
                  <div
                    key={m.label}
                    className="glass-subcard p-3 text-center"
                  >
                    <MiniRing
                      value={m.value}
                      goal={m.goal}
                      color={NUTRIENT_META[m.nutrient].color}
                      icon={<NutrientIcon nutrient={m.nutrient} size={22} />}
                    />
                    <p className="mt-1 text-xs text-white/60">{m.label}</p>
                    <p className="text-[11px] whitespace-nowrap text-white/40">
                      {m.value.toLocaleString()}/{m.goal.toLocaleString()}
                      {m.unit}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Page 2: water + sugar / fiber / sodium. */}
            <section className="w-full shrink-0 snap-center px-0.5">
              <div className="glass-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-bold">
                    <DropletIcon size={18} className="text-[#14B8A6]" />
                    飲水
                  </h3>
                  <span className="text-xs whitespace-nowrap text-white/40">
                    目標 {targetBottles} 樽 · {waterGoalMl.toLocaleString()} ml
                  </span>
                </div>
                <div className="relative mt-3 flex items-end justify-between gap-2">
                  {/* 達標微光 — 只驅動 opacity，極克制 */}
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute -inset-2 rounded-3xl bg-[#14B8A6]/15 blur-xl"
                    initial={false}
                    animate={{ opacity: bottles >= targetBottles ? 1 : 0 }}
                    transition={{ duration: 0.5 }}
                  />
                  <div className="relative flex items-end gap-1.5">
                    {Array.from({ length: targetBottles }).map((_, i) => (
                      <span
                        key={i}
                        className={`flex h-10 w-5 items-end justify-center overflow-hidden rounded-b-md rounded-t-sm border-2 ${
                          i < bottles
                            ? 'border-[#14B8A6] bg-[#14B8A6]/70'
                            : 'border-white/20 bg-transparent'
                        }`}
                        aria-label={i < bottles ? '已飲一樽' : '未飲'}
                      >
                        <motion.span
                          className="block h-full w-full bg-white/30"
                          style={{ transformOrigin: 'bottom' }}
                          initial={false}
                          animate={{ scaleY: i < bottles ? 1 : 0 }}
                          transition={{ duration: DUR.fill, ease: 'easeOut' }}
                        />
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addBottle}
                    className="glass-cta-teal pressable relative rounded-full px-4 py-2.5 font-bold whitespace-nowrap text-white"
                  >
                    +1 樽
                  </button>
                </div>
                <p className="mt-2 text-sm whitespace-nowrap text-white/60">
                  {bottles} / {targetBottles} 樽 ·{' '}
                  {waterTotal.toLocaleString()} /{' '}
                  {waterGoalMl.toLocaleString()} ml
                  {waterTotal === 0
                    ? ` · 仲差 ${waterGoalMl.toLocaleString()} · 仙人掌？`
                    : ` · 仲差 ${Math.max(0, waterGoalMl - waterTotal).toLocaleString()} ml`}
                </p>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    { label: '糖', value: round1(totals.sugarG), goal: target.sugarCeilingG, unit: 'g', ceiling: true, nutrient: 'sugarG' },
                    { label: '纖維', value: round1(totals.fiberG), goal: target.fiberFloorG, unit: 'g', ceiling: false, nutrient: 'fiberG' },
                    { label: '鈉', value: Math.round(totals.sodiumMg), goal: target.sodiumCeilingMg, unit: 'mg', ceiling: true, nutrient: 'sodiumMg' },
                  ] as Array<{ label: string; value: number; goal: number; unit: string; ceiling: boolean; nutrient: NutrientKey }>
                ).map((m) => (
                  <div
                    key={m.label}
                    className="glass-subcard p-3 text-center"
                  >
                    <MiniRing
                      value={m.value}
                      goal={m.goal}
                      over={m.ceiling && m.value > m.goal}
                      color={NUTRIENT_META[m.nutrient].color}
                      icon={<NutrientIcon nutrient={m.nutrient} size={22} />}
                    />
                    <p className="mt-1 text-xs text-white/60">{m.label}</p>
                    <p className="text-[11px] whitespace-nowrap text-white/40">
                      {m.value.toLocaleString()}/{m.goal.toLocaleString()}
                      {m.unit}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Dots — 2 pages；琥珀色頁點用 layoutId 平滑滑動（唔動 width）。 */}
          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => goToPage(p)}
                aria-label={`第 ${p + 1} 頁`}
                className="pressable flex h-1.5 w-5 items-center justify-center"
              >
                {activePage === p ? (
                  <motion.span
                    layoutId="carousel-dot"
                    className="h-1.5 w-5 rounded-full bg-[#FF9F0A] shadow-[0_0_8px_rgba(255,159,10,0.6)]"
                    transition={springPill}
                  />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                )}
              </button>
            ))}
          </div>

          {/* Two big tinted-glass buttons — static, below the carousel. */}
          <div className="mt-3 flex gap-3">
            <GlassButton
              variant="amber"
              onClick={onAdd}
              className="pressable flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-base text-white"
            >
              <CameraIcon size={20} />
              又食嘢？加啦
            </GlassButton>
            <GlassButton
              variant="teal"
              onClick={onAddExercise}
              className="pressable flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-base text-white"
            >
              <ActivityIcon size={20} />
              做咗運動？
            </GlassButton>
          </div>

          {/* 案底 feed — 跟住 2-slide 板下面，單欄。 */}
          <div className="mt-6 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">
              案底 · {dayLabel(viewKey)}
            </h2>
            {viewKey !== todayKey && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="pressable text-sm font-bold text-[#FF9F0A]"
              >
                返回今日
              </button>
            )}
          </div>

          {/* 案底 feed — 切日子時輕微淡入＋微移（key 跟 viewKey）。 */}
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slide, ease: easeOutExpo }}
          >
            {feedGroups.length === 0 ? (
              <p className="glass-inset mt-3 p-6 text-center text-sm text-white/50">
                {viewKey === todayKey
                  ? '仲未有案底 — 撳「又食嘢？加啦」認第一餐啦'
                  : '呢日未記過嘢'}
              </p>
            ) : (
              feedGroups.map(([key, list]) => (
            <div key={key} className="mt-4 md:mt-3">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="font-bold">{dayLabel(key)}</h3>
                <span className="text-sm whitespace-nowrap text-white/40">
                  {list.reduce((a, e) => a + e.calories, 0)} kcal
                </span>
              </div>
              <div className="mt-2 space-y-3">
                {list.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.id)}
                    className="glass-card pressable block w-full overflow-hidden text-left"
                  >
                    {e.roastComment && (
                      <span className="glass-roast block px-4 py-2.5 text-sm leading-relaxed text-white/90">
                        {e.roastEmoji ?? '☺️'} {e.roastComment}
                      </span>
                    )}
                    <span className="flex items-center gap-3 p-3">
                      {e.imageDataUrl ? (
                        <img
                          src={e.imageDataUrl}
                          alt=""
                          loading="lazy"
                          className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                        />
                      ) : (
                        <span className="glass-inset flex h-20 w-20 shrink-0 items-center justify-center text-3xl">
                          🍽️
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {e.name}
                        </span>
                        <span className="block text-sm whitespace-nowrap text-white/50">
                          {MEAL_LABELS[e.mealType as MealType] ?? e.mealType} ·{' '}
                          {new Date(e.date).toLocaleTimeString('zh-HK', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {e.scanStatus === 'scanning' ? ' · 分析緊…' : ''}
                        </span>
                        <span className="mt-0.5 block text-sm text-white/60">
                          <span className="whitespace-nowrap">
                            蛋白質 {round1(e.proteinG)}g
                          </span>
                          {' · '}
                          <span className="whitespace-nowrap">
                            碳水 {round1(e.carbsG)}g
                          </span>
                          {' · '}
                          <span className="whitespace-nowrap">
                            脂肪 {round1(e.fatG)}g
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-2xl leading-none font-bold whitespace-nowrap">
                          🔥 {e.calories}
                        </span>
                        <span className="text-xs text-white/40">kcal</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
              ))
            )}
          </motion.div>
    </div>
  )
}

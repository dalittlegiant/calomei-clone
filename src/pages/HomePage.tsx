// Home — 今日總覽，暖黑液態玻璃風（見 DESIGN.md v2）
// 還原原本嗰版嘅結構：火焰圓環主卡、2-slide 營養卡、Roast 喺頂嘅案底卡、原裝文案。
// 只升級材質（暖黑玻璃＋著色玻璃掣）同導航，唔改排版靈魂。
// - Week strip：玻璃膠囊列，sticky 喺 header 下面
// - Scorecard：橫向滑動 carousel，得兩頁
//   第 1 頁：卡路里卡（活動量＋仲剩＋已食／目標＋BMR/TDEE＋火焰圓環）+ 三大營養素
//   第 2 頁：飲水卡（樽制）+ 糖 / 纖維 / 鈉
// - 下面兩粒大掣 + 案底 feed 都係 static，唔跟 carousel 碌走
// - 展開版（md+）：雙欄 Bento——左欄主卡＋操作，右欄案底

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
import {
  ActivityIcon,
  CameraIcon,
  DropletIcon,
  FlameIcon,
} from '../components/icons'
import { GlassButton } from '../components/ui'

/** 細圓圈進度環 — 跟大卡路里火焰圓環同一套 SVG 做法（細一號，64px）。
 * 數值喺圓圈中間；超咗上限（糖／鈉）變紅色。 */
function MiniRing({
  value,
  goal,
  over = false,
}: {
  value: number
  goal: number
  over?: boolean
}) {
  const r = 26
  const c = 2 * Math.PI * r
  const frac = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0
  const color = over ? '#F87171' : '#FF9F0A'
  return (
    <div className="relative mx-auto h-16 w-16">
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 -rotate-90"
        style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
      >
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-white/10"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm leading-none font-bold tabular-nums">
          {value}
        </span>
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
  const entries = useLiveQuery(
    () => db.food_entries.orderBy('date').reverse().toArray(),
    [],
  )
  const override = useLiveQuery(
    () => db.nutrition_target_overrides.get('default'),
    [],
  )
  const target = effectiveTarget(profile, override ?? null)
  const bmr = Math.round(mifflinBmr(profile))
  const tdee = Math.round(mifflinBmr(profile) * activityFactor(profile.activityLevel))

  const todayStart = todayLogStartMs(startMin)
  const todayFood = useMemo(
    () => (entries ?? []).filter((e) => e.date >= todayStart),
    [entries, todayStart],
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
    for (const e of todayFood) {
      t.calories += e.calories
      t.proteinG += e.proteinG
      t.carbsG += e.carbsG
      t.fatG += e.fatG
      t.sugarG += e.sugarG ?? 0
      t.fiberG += e.fiberG ?? 0
      t.sodiumMg += e.sodiumMg ?? 0
    }
    return t
  }, [todayFood])

  const waterToday = useLiveQuery(
    () => db.water_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [todayStart],
  )
  const waterTotal = (waterToday ?? []).reduce((a, w) => a + w.amountML, 0)

  const exerciseToday = useLiveQuery(
    () => db.exercise_entries.where('date').aboveOrEqual(todayStart).toArray(),
    [todayStart],
  )
  const exerciseKcal = (exerciseToday ?? []).reduce(
    (a, e) => a + e.caloriesBurned,
    0,
  )

  const remaining = target.calories - totals.calories + exerciseKcal
  const weekDays = last7LogDays(startMin)
  const todayKey = logDayKey(Date.now(), startMin)
  const dayKeysWithEntries = useMemo(
    () => new Set((entries ?? []).map((e) => logDayKey(e.date, startMin))),
    [entries, startMin],
  )

  const feedGroups = useMemo(() => {
    const list = (entries ?? []).filter(
      (e) => !selectedDay || logDayKey(e.date, startMin) === selectedDay,
    )
    const map = new Map<string, typeof list>()
    for (const e of list) {
      const key = logDayKey(e.date, startMin)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [entries, selectedDay, startMin])

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
    await db.water_entries.add({
      id: crypto.randomUUID(),
      amountML: BOTTLE_ML,
      date: now,
      createdAt: now,
    })
  }

  const bottles = Math.floor(waterTotal / BOTTLE_ML)
  const targetBottles = Math.round(WATER_TARGET_ML / BOTTLE_ML)
  const ringFrac = Math.max(0, Math.min(1, remaining / target.calories))
  const ringC = 2 * Math.PI * 30

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 md:max-w-2xl md:pb-12">
      {/* Week strip — glass capsule row, sticks under the header. */}
      <div className="sticky top-[calc(max(12px,env(safe-area-inset-top))+60px)] z-10 pt-3 pb-3">
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
                className={`flex min-w-0 flex-1 flex-col items-center rounded-full py-1 transition-colors ${
                  isSelected
                    ? 'glass-cta-amber text-white'
                    : isToday
                      ? 'text-white'
                      : 'text-white/50'
                }`}
              >
                <span
                  className={`text-[11px] ${
                    isSelected ? 'text-white/90' : 'text-white/40'
                  }`}
                >
                  {d.weekday}
                </span>
                <span className="text-base leading-tight font-bold">
                  {d.date.getDate()}
                </span>
                <span
                  className={`mt-0.5 h-1 w-1 rounded-full ${
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
                          {remaining}{' '}
                          <span className="text-lg font-normal text-white/60">
                            仲剩
                          </span>
                        </>
                      ) : (
                        <>
                          {-remaining}{' '}
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
                      <circle
                        cx="36"
                        cy="36"
                        r="30"
                        fill="none"
                        stroke="#ff9f0a"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={ringC}
                        strokeDashoffset={ringC * (1 - ringFrac)}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[#FF9F0A]">
                      <FlameIcon size={28} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: '蛋白質', value: round1(totals.proteinG), goal: target.proteinG, unit: 'g' },
                  { label: '碳水', value: round1(totals.carbsG), goal: target.carbsG, unit: 'g' },
                  { label: '脂肪', value: round1(totals.fatG), goal: target.fatG, unit: 'g' },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="glass-subcard p-3 text-center"
                  >
                    <MiniRing value={m.value} goal={m.goal} />
                    <p className="mt-1 text-xs text-white/60">{m.label}</p>
                    <p className="text-[11px] whitespace-nowrap text-white/40">
                      /{m.goal}
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
                    目標 {targetBottles} 樽 · {WATER_TARGET_ML.toLocaleString()} ml
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="flex items-end gap-1.5">
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
                        {i < bottles && (
                          <span className="block h-full w-full bg-white/30" />
                        )}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addBottle}
                    className="glass-cta-teal rounded-full px-4 py-2.5 font-bold whitespace-nowrap text-white"
                  >
                    +1 樽
                  </button>
                </div>
                <p className="mt-2 text-sm whitespace-nowrap text-white/60">
                  {bottles} / {targetBottles} 樽 ·{' '}
                  {waterTotal.toLocaleString()} /{' '}
                  {WATER_TARGET_ML.toLocaleString()} ml
                  {waterTotal === 0
                    ? ' · 仲差 2,000 · 仙人掌？'
                    : ` · 仲差 ${Math.max(0, WATER_TARGET_ML - waterTotal).toLocaleString()} ml`}
                </p>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: '糖', value: round1(totals.sugarG), goal: target.sugarCeilingG, unit: 'g', ceiling: true },
                  { label: '纖維', value: round1(totals.fiberG), goal: target.fiberFloorG, unit: 'g', ceiling: false },
                  { label: '鈉', value: Math.round(totals.sodiumMg), goal: target.sodiumCeilingMg, unit: 'mg', ceiling: true },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="glass-subcard p-3 text-center"
                  >
                    <MiniRing
                      value={m.value}
                      goal={m.goal}
                      over={m.ceiling && m.value > m.goal}
                    />
                    <p className="mt-1 text-xs text-white/60">{m.label}</p>
                    <p className="text-[11px] whitespace-nowrap text-white/40">
                      /{m.goal}
                      {m.unit}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Dots — 2 pages, warm amber. */}
          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => goToPage(p)}
                aria-label={`第 ${p + 1} 頁`}
                className={`page-dot ${activePage === p ? 'page-dot-on' : 'page-dot-off'}`}
              />
            ))}
          </div>

          {/* Two big tinted-glass buttons — static, below the carousel. */}
          <div className="mt-3 flex gap-3">
            <GlassButton
              variant="amber"
              onClick={onAdd}
              className="flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-base text-white"
            >
              <CameraIcon size={20} />
              又食嘢？加啦
            </GlassButton>
            <GlassButton
              variant="teal"
              onClick={onAddExercise}
              className="flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-base text-white"
            >
              <ActivityIcon size={20} />
              做咗運動？
            </GlassButton>
          </div>

          {/* 案底 feed — 跟住 2-slide 板下面，單欄。 */}
          <div className="mt-6 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">
              案底{selectedDay ? ` · ${dayLabel(selectedDay)}` : ''}
            </h2>
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-sm font-bold text-[#FF9F0A]"
              >
                睇返全部
              </button>
            )}
          </div>

          {feedGroups.length === 0 && (
            <p className="glass-inset mt-3 p-6 text-center text-sm text-white/50">
              仲未有案底 — 撳「又食嘢？加啦」認第一餐啦
            </p>
          )}

          {feedGroups.map(([key, list]) => (
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
                    className="glass-card block w-full overflow-hidden text-left"
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
          ))}
    </div>
  )
}

// 熱量赤字詳細頁（見 DESIGN.md §10）
// - 頂部 3 欄玻璃摘要：累計 / 日均 / 相當體脂
// - 圖表卡：每日／累計切換 ＋ 14 日／30 日切換；只喺有記食物嘅日子畫柱／點
// - 日期區間翻頁：< 11月7日 – 11月20日 >（最新一期去到今日，> 會 disable）
// - 每日明細：只列有記數嘅日子，由新到舊
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type UserProfile } from '../lib/db'
import { activityFactor, mifflinBmr } from '../lib/nutrition'
import { dayStartMinutes, getDayStart, todayLogStartMs } from '../lib/day'
import { GlassCard } from '../components/ui'
import {
  computeDeficit,
  fmtDayZh,
  fmtFatKg,
  fmtRangeZh,
  fmtSigned,
} from './deficit'

interface Props {
  profile: UserProfile
  onBack: () => void
}

type ChartMode = 'daily' | 'cumulative'

function barColor(net: number): string {
  if (net < 0) return '#14B8A6' // 赤字（慳咗）= 湖水綠
  if (net >= 1000) return '#F87171' // 大幅超標 = 紅
  return '#FF9F0A' // 盈餘（食凸咗）= 琥珀橙
}

export default function DeficitDetailPage({ profile, onBack }: Props) {
  const [dayStart, setDayStart] = useState('00:00')
  const [mode, setMode] = useState<ChartMode>('daily')
  const [range, setRange] = useState<14 | 30>(14)
  const [periodOffset, setPeriodOffset] = useState(0) // 0 = 最新一期（去到今日）
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    getDayStart().then(setDayStart)
  }, [])

  const startMin = dayStartMinutes(dayStart)
  const entries = useLiveQuery(() => db.food_entries.toArray(), [])
  const exercise = useLiveQuery(() => db.exercise_entries.toArray(), [])
  const tdee = Math.round(
    mifflinBmr(profile) * activityFactor(profile.activityLevel),
  )

  const endStartMs =
    todayLogStartMs(startMin) - periodOffset * range * 86_400_000
  const startMs = endStartMs - (range - 1) * 86_400_000
  const summary = useMemo(
    () =>
      computeDeficit(
        entries ?? [],
        exercise ?? [],
        tdee,
        startMin,
        endStartMs,
        range,
      ),
    [entries, exercise, tdee, startMin, endStartMs, range],
  )

  const selected =
    summary.allDays.find((d) => d.key === selectedKey && d.hasFood) ??
    summary.foodDays.at(-1)
  const maxAbs = Math.max(
    ...summary.foodDays.map((d) => Math.abs(d.net)),
    1,
  )

  // 累計模式：只喺有記食物嘅日子畫點，點與點之間連線（無記數嘅日子留空）。
  const cumPoints = useMemo(() => {
    let cum = 0
    return summary.foodDays.map((d) => {
      cum += d.net
      return { ...d, cum }
    })
  }, [summary.foodDays])
  const cumMin = Math.min(0, ...cumPoints.map((p) => p.cum))
  const cumMax = Math.max(0, ...cumPoints.map((p) => p.cum))
  const cumSpan = cumMax - cumMin || 1
  const pointX = (startMsOfDay: number) =>
    ((startMsOfDay - startMs) / ((range - 1) * 86_400_000)) * 100
  const pointY = (v: number) => 92 - ((v - cumMin) / cumSpan) * 84
  const cumLine =
    cumPoints.length > 1
      ? cumPoints
          .map((p) => `${pointX(p.startMs).toFixed(1)},${pointY(p.cum).toFixed(1)}`)
          .join(' ')
      : ''
  const zeroY = pointY(0)

  const totalColor =
    summary.total < 0
      ? 'text-[#14B8A6]'
      : summary.total > 0
        ? 'text-[#FF9F0A]'
        : 'text-white'

  function changeRange(r: 14 | 30) {
    setRange(r)
    setPeriodOffset(0)
    setSelectedKey(null)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 md:max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mt-3 text-base font-bold text-[#FF9F0A]"
      >
        ← 返回進度
      </button>
      <h1 className="mt-2 text-2xl font-bold">🔥 熱量赤字</h1>

      {/* 3-column summary */}
      <GlassCard className="mt-3 p-4">
        <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
          <div className="px-1">
            <p className="text-xs text-white/50">累計</p>
            <p className={`mt-1 text-xl leading-tight font-bold ${totalColor}`}>
              {summary.daysWithFood === 0 ? '—' : fmtSigned(summary.total)}
            </p>
            <p className="text-xs text-white/40">kcal</p>
          </div>
          <div className="px-1">
            <p className="text-xs text-white/50">日均</p>
            <p className={`mt-1 text-xl leading-tight font-bold ${totalColor}`}>
              {summary.daysWithFood === 0 ? '—' : fmtSigned(summary.avg)}
            </p>
            <p className="text-xs text-white/40">kcal</p>
          </div>
          <div className="px-1">
            <p className="text-xs text-white/50">相當體脂</p>
            <p className={`mt-1 text-xl leading-tight font-bold ${totalColor}`}>
              {summary.daysWithFood === 0 ? '—' : fmtFatKg(summary.total)}
            </p>
            <p className="text-xs text-white/40">kg</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          {summary.daysWithFood === 0
            ? '呢期未有記錄'
            : `呢期 ${summary.daysWithFood} 日有記數 · 約 7,700 kcal 相當於 1 公斤體脂，此為估算值`}
        </p>
      </GlassCard>

      {/* Chart card */}
      <GlassCard className="mt-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-full bg-white/[0.06] p-1">
            {(
              [
                { id: 'daily', label: '每日' },
                { id: 'cumulative', label: '累計' },
              ] as Array<{ id: ChartMode; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap ${
                  mode === t.id
                    ? 'glass-cta-amber text-white'
                    : 'text-white/60'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-white/[0.06] p-1">
            {([14, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => changeRange(r)}
                className={`rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap ${
                  range === r
                    ? 'glass-cta-amber text-white'
                    : 'text-white/60'
                }`}
              >
                {r} 日
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4 h-44">
          {mode === 'daily' ? (
            <div className="flex h-full items-end gap-[2px]">
              {summary.allDays.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  disabled={!d.hasFood}
                  onClick={() => setSelectedKey(d.key)}
                  title={
                    d.hasFood
                      ? `${fmtDayZh(d.startMs)}：食 ${d.eaten.toLocaleString()} · 燒 ${d.burn.toLocaleString()} · 淨 ${fmtSigned(d.net)} kcal`
                      : `${fmtDayZh(d.startMs)}：未有記錄`
                  }
                  className={`flex h-full flex-1 flex-col items-center justify-end rounded-sm ${
                    selected?.key === d.key ? 'bg-white/[0.07]' : ''
                  }`}
                >
                  {d.hasFood && (
                    <div
                      className="w-full max-w-5 rounded-t-sm"
                      style={{
                        height: `${Math.max(3, (Math.abs(d.net) / maxAbs) * 100)}%`,
                        backgroundColor: barColor(d.net),
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              {cumMin < 0 && cumMax > 0 && (
                <line
                  x1="0"
                  x2="100"
                  y1={zeroY}
                  y2={zeroY}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="0.5"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {cumLine && (
                <polyline
                  points={cumLine}
                  fill="none"
                  stroke={summary.total < 0 ? '#14B8A6' : '#FF9F0A'}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {cumPoints.map((p) => (
                <circle
                  key={p.key}
                  cx={pointX(p.startMs)}
                  cy={pointY(p.cum)}
                  r={selected?.key === p.key ? 4 : 3}
                  fill={barColor(p.net)}
                  stroke={selected?.key === p.key ? '#fff' : 'none'}
                  strokeWidth="1"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedKey(p.key)}
                >
                  <title>{`${fmtDayZh(p.startMs)}：累計 ${fmtSigned(p.cum)} kcal`}</title>
                </circle>
              ))}
            </svg>
          )}
        </div>
        <div className="mt-1 flex justify-between text-xs text-white/40">
          <span>{fmtDayZh(startMs)}</span>
          <span>{fmtDayZh(endStartMs)}</span>
        </div>

        {/* Selected day readout */}
        <p className="glass-inset mt-3 p-3 text-center text-sm">
          {selected ? (
            <>
              <span className="font-bold">{fmtDayZh(selected.startMs)}</span>
              {' · '}食 {selected.eaten.toLocaleString()} · 燒{' '}
              {selected.burn.toLocaleString()} · 淨{' '}
              <span
                className={
                  selected.net < 0 ? 'font-bold text-[#14B8A6]' : 'font-bold text-[#FF9F0A]'
                }
              >
                {fmtSigned(selected.net)} kcal
              </span>
            </>
          ) : (
            <span className="text-white/50">
              撳條柱或者個點，睇返嗰日嘅數字
            </span>
          )}
        </p>

        {/* Period navigation */}
        <div className="glass-subcard mt-3 flex items-center justify-between p-2">
          <button
            type="button"
            onClick={() => {
              setPeriodOffset((o) => o + 1)
              setSelectedKey(null)
            }}
            aria-label="上一期"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold text-white/80"
          >
            ‹
          </button>
          <span className="text-sm font-bold whitespace-nowrap">
            {fmtRangeZh(startMs, endStartMs)}
          </span>
          <button
            type="button"
            disabled={periodOffset === 0}
            onClick={() => {
              setPeriodOffset((o) => Math.max(0, o - 1))
              setSelectedKey(null)
            }}
            aria-label="下一期"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold text-white/80 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </GlassCard>

      {/* Daily breakdown — only days with food, newest first */}
      <GlassCard className="mt-4 p-4">
        <h2 className="text-lg font-bold">每日明細</h2>
        {summary.foodDays.length === 0 ? (
          <p className="glass-inset mt-3 p-6 text-center text-sm text-white/50">
            呢期未有記錄
          </p>
        ) : (
          <div className="mt-1 divide-y divide-white/10">
            {[...summary.foodDays].reverse().map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedKey(d.key)}
                className={`flex w-full items-center gap-3 py-3 text-left ${
                  selected?.key === d.key ? 'rounded-2xl bg-white/[0.05] px-2' : ''
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    d.net < 0
                      ? 'bg-[#14B8A6]/20 text-[#14B8A6]'
                      : 'bg-[#FF9F0A]/20 text-[#FF9F0A]'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{fmtDayZh(d.startMs)}</span>
                  <span className="block text-sm text-white/50">
                    食 {d.eaten.toLocaleString()} · 燒 {d.burn.toLocaleString()}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-bold whitespace-nowrap ${
                    d.net < 0 ? 'text-[#14B8A6]' : 'text-[#FF9F0A]'
                  }`}
                >
                  {fmtSigned(d.net)} kcal
                </span>
              </button>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

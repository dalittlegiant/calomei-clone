// 記運動 — 兩步流程（2026-11-24，Kong 規格）。
// 第一步「做咗運動？」：搜尋＋全部／最近／收藏／自訂四個分頁，撳一行入詳情。
// 第二步「記運動」：日期＋開始時間、燒咗 kcal 卡（撳數字可手動改）、
// 水平刻度尺拉分鐘、收藏開關、今日上限結算（燒咗 ×0.72，設定關閉就 +0）、
// 全寬琥珀掣寫入 exercise_entries。
// 舊嘅 AddSheet 手動三格（名＋分鐘＋kcal）由呢個流程取代；自訂運動
// 喺「自訂」分頁加（名＋每 30 分鐘 kcal），最近記錄喺「最近」分頁。
// 唔郁 vision.ts／prompts.ts／foodDb.ts／health.ts。

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CustomExercise } from '../lib/db'
import {
  EXERCISES,
  FALLBACK_WEIGHT_KG,
  allowanceKcalFor,
  findExerciseById,
  findExerciseByName,
  kcalPer30,
  searchExercises,
  type ExerciseDef,
} from '../data/exercises'
import {
  BookmarkSilhouetteIcon,
  ChevronDownIcon,
  ExerciseIcon,
  PlusIcon,
  XIcon,
  type ExerciseIconKey,
} from '../components/icons'

interface Props {
  onBack: () => void
  /** Toast message after a successful save. */
  onDone: (msg: string) => void
}

type Tab = 'all' | 'recent' | 'fav' | 'custom'

interface SelectedExercise {
  id: string
  name: string
  category: string
  icon: ExerciseIconKey
  /** 每 30 分鐘燒幾多 kcal；null = 未知（舊記錄搵唔返對應運動）。 */
  kcalPer30Min: number | null
}

const TICK_W = 14
const MIN_MINUTES = 5
const MAX_MINUTES = 180
const MAJOR_TICKS = new Set([15, 30, 45, 60, 90, 120])

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

function dateLabel(dateStr: string): string {
  const today = toDateStr(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (dateStr === today) return '今日'
  if (dateStr === toDateStr(y)) return '尋日'
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}月${d}日`
}

function parseCounts(row: { value: string } | undefined): boolean {
  if (!row) return true
  try {
    return JSON.parse(row.value) as boolean
  } catch {
    return true
  }
}

function clampMinutes(m: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(m / 5) * 5))
}

export default function ExercisePage({ onBack, onDone }: Props) {
  const [step, setStep] = useState<'select' | 'detail'>('select')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedExercise | null>(null)
  const [minutes, setMinutes] = useState(30)
  const [dateStr, setDateStr] = useState(() => toDateStr(new Date()))
  const [timeStr, setTimeStr] = useState(() =>
    fmtTime(new Date(Date.now() - 30 * 60_000)),
  )
  /** 手動改過嘅 kcal；null = 用刻度尺自動估算。 */
  const [kcalOverride, setKcalOverride] = useState<number | null>(null)
  const [kcalEditing, setKcalEditing] = useState(false)
  const [kcalDraft, setKcalDraft] = useState('')
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchQuery, setSwitchQuery] = useState('')
  const [customName, setCustomName] = useState('')
  const [customKcal, setCustomKcal] = useState('')

  const rulerRef = useRef<HTMLDivElement>(null)
  const suppressScrollRef = useRef(0)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  const profiles = useLiveQuery(() => db.user_profiles.toArray(), [])
  const countsRow = useLiveQuery(() => db.settings.get('exercise_counts'), [])
  const favorites = useLiveQuery(() => db.exercise_favorites.toArray(), [])
  const customs = useLiveQuery(() => db.custom_exercises.toArray(), [])
  const allEntries = useLiveQuery(() => db.exercise_entries.toArray(), [])

  const weight = profiles?.[0]?.weightKG || FALLBACK_WEIGHT_KG
  const countsTowardAllowance = parseCounts(countsRow)

  const favIds = useMemo(
    () => new Set((favorites ?? []).map((f) => f.id)),
    [favorites],
  )

  // 最近：exercise_entries 去重（名），最新 8 款。
  const recentRows = useMemo(() => {
    const rows = [...(allEntries ?? [])].sort((a, b) => b.createdAt - a.createdAt)
    const seen = new Map<
      string,
      { name: string; lastMinutes: number; lastKcal: number }
    >()
    for (const r of rows) {
      if (!seen.has(r.name)) {
        seen.set(r.name, {
          name: r.name,
          lastMinutes: r.durationMinutes,
          lastKcal: r.caloriesBurned,
        })
      }
    }
    return [...seen.values()].slice(0, 8)
  }, [allEntries])

  function fromBuiltin(def: ExerciseDef): SelectedExercise {
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      icon: def.icon,
      kcalPer30Min: kcalPer30(def.met, weight),
    }
  }

  function fromCustom(row: CustomExercise): SelectedExercise {
    return {
      id: row.id,
      name: row.name,
      category: '自訂',
      icon: 'run',
      kcalPer30Min: row.kcalPer30Min,
    }
  }

  function resolveRecent(r: {
    name: string
    lastMinutes: number
    lastKcal: number
  }): SelectedExercise {
    const def = findExerciseByName(r.name)
    if (def) return fromBuiltin(def)
    const custom = (customs ?? []).find((c) => c.name === r.name)
    if (custom) return fromCustom(custom)
    return {
      id: `recent:${r.name}`,
      name: r.name,
      category: '最近',
      icon: 'run',
      kcalPer30Min:
        r.lastMinutes > 0
          ? Math.round((r.lastKcal / r.lastMinutes) * 30)
          : null,
    }
  }

  function resolveFavorite(id: string): SelectedExercise | null {
    const def = findExerciseById(id)
    if (def) return fromBuiltin(def)
    const custom = (customs ?? []).find((c) => c.id === id)
    if (custom) return fromCustom(custom)
    if (id.startsWith('recent:')) {
      const name = id.slice('recent:'.length)
      const r = recentRows.find((x) => x.name === name)
      if (r) return resolveRecent(r)
    }
    return null
  }

  function pickExercise(sel: SelectedExercise) {
    setSelected(sel)
    setMinutes(30)
    setTimeStr(fmtTime(new Date(Date.now() - 30 * 60_000)))
    setDateStr(toDateStr(new Date()))
    setKcalOverride(null)
    setKcalEditing(false)
    setSwitchOpen(false)
    setStep('detail')
  }

  // ---- 刻度尺 ----
  function scrollRulerTo(min: number, smooth = true) {
    const el = rulerRef.current
    if (!el) return
    const idx = Math.round(min / 5) - 1
    suppressScrollRef.current = Date.now() + 450
    el.scrollTo({ left: idx * TICK_W, behavior: smooth ? 'smooth' : 'auto' })
  }

  function pickMinutes(min: number) {
    const m = clampMinutes(min)
    setMinutes(m)
    scrollRulerTo(m)
  }

  function onRulerScroll() {
    const el = rulerRef.current
    if (!el) return
    if (Date.now() < suppressScrollRef.current) return
    const idx = Math.round(el.scrollLeft / TICK_W)
    const m = clampMinutes((idx + 1) * 5)
    setMinutes((prev) => (prev === m ? prev : m))
  }

  // 詳情頁 mount 嗰陣將刻度尺捲去 30 分鐘（唔用動畫）。
  useEffect(() => {
    if (step !== 'detail') return
    const t = window.setTimeout(() => scrollRulerTo(minutes, false), 60)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ---- 計算 ----
  const autoKcal =
    selected?.kcalPer30Min != null
      ? Math.round((selected.kcalPer30Min * minutes) / 30)
      : 0
  const kcal = kcalOverride ?? autoKcal
  const allowance = allowanceKcalFor(kcal, countsTowardAllowance)
  const startDate = new Date(`${dateStr}T${timeStr}:00`)
  const endDate = new Date(startDate.getTime() + minutes * 60_000)
  const isFav = selected ? favIds.has(selected.id) : false

  async function toggleFav() {
    if (!selected) return
    if (isFav) await db.exercise_favorites.delete(selected.id)
    else
      await db.exercise_favorites.add({
        id: selected.id,
        createdAt: Date.now(),
      })
  }

  async function saveExercise() {
    if (!selected) return
    const now = Date.now()
    const startMs = Number.isNaN(startDate.getTime())
      ? now
      : startDate.getTime()
    await db.exercise_entries.add({
      id: crypto.randomUUID(),
      name: selected.name,
      exerciseType: selected.category,
      durationMinutes: minutes,
      caloriesBurned: kcal,
      date: startMs,
      createdAt: now,
    })
    onDone(`運動已記錄：${selected.name} ${minutes} 分鐘`)
    onBack()
  }

  async function addCustom() {
    const name = customName.trim()
    const per30 = Math.round(Number(customKcal))
    if (!name || !per30 || per30 <= 0) return
    const row: CustomExercise = {
      id: crypto.randomUUID(),
      name,
      kcalPer30Min: per30,
      createdAt: Date.now(),
    }
    await db.custom_exercises.add(row)
    setCustomName('')
    setCustomKcal('')
    onDone(`已新增自訂運動：${name}`)
  }

  async function deleteCustom(id: string) {
    await db.custom_exercises.delete(id)
    await db.exercise_favorites.delete(id)
  }

  // ---- 列表內容 ----
  const searching = query.trim().length > 0
  const builtinResults = searching ? searchExercises(query) : EXERCISES
  const customResults = (customs ?? []).filter((c) =>
    searching ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  )
  const favList = (favorites ?? [])
    .map((f) => resolveFavorite(f.id))
    .filter((x): x is SelectedExercise => x !== null)

  function subtitleFor(sel: SelectedExercise): string {
    if (sel.kcalPer30Min == null) return '撳入去手動填卡路里'
    const per30 = sel.kcalPer30Min
    if (countsTowardAllowance) {
      return `+${allowanceKcalFor(per30, true)} 上限 · 每 30 分鐘`
    }
    return `${per30} kcal · 每 30 分鐘`
  }

  function ExerciseRow({
    sel,
    sub,
    onDelete,
  }: {
    sel: SelectedExercise
    sub?: string
    onDelete?: () => void
  }) {
    return (
      <li className="flex items-center gap-3 rounded-2xl glass-subcard p-3">
        <button
          type="button"
          onClick={() => pickExercise(sel)}
          className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17140F] ring-1 ring-white/10">
            <ExerciseIcon
              icon={sel.icon}
              size={24}
              className="text-[#FF9F0A]"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{sel.name}</span>
            <span className="block truncate text-xs text-white/50">
              {sub ?? subtitleFor(sel)}
            </span>
          </span>
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="pressable shrink-0 px-2 text-red-400"
            aria-label={`刪除${sel.name}`}
          >
            <XIcon size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => pickExercise(sel)}
            aria-label={`記錄${sel.name}`}
            className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF9F0A]/15 text-[#FF9F0A]"
          >
            <PlusIcon size={20} />
          </button>
        )}
      </li>
    )
  }

  const switchList = switchQuery.trim()
    ? [
        ...searchExercises(switchQuery).map(fromBuiltin),
        ...(customs ?? [])
          .filter((c) =>
            c.name.toLowerCase().includes(switchQuery.trim().toLowerCase()),
          )
          .map(fromCustom),
      ]
    : [...EXERCISES.map(fromBuiltin), ...(customs ?? []).map(fromCustom)]

  return (
    <div className="mx-auto max-w-lg px-4 pt-2 pb-28 md:max-w-3xl md:px-6">
      {step === 'select' && (
        <>
          <button
            type="button"
            onClick={onBack}
            className="pressable font-bold text-[#FF9F0A]"
          >
            ← 返回
          </button>
          <h2 className="mt-2 text-xl font-bold">做咗運動？</h2>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="做咗咩運動..."
            className="glass-input mt-3"
          />

          {/* 4 個分頁膠囊，琥珀底線指示當前嗰個。 */}
          <div className="mt-3 flex gap-1 border-b border-white/10">
            {(
              [
                ['all', '全部'],
                ['recent', '最近'],
                ['fav', '收藏'],
                ['custom', '自訂'],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`pressable flex-1 border-b-2 pb-2 text-sm font-bold ${
                  tab === id
                    ? 'border-[#FF9F0A] text-white'
                    : 'border-transparent text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'custom' && (
            <div className="mt-3 rounded-2xl glass-subcard p-3">
              <p className="text-sm font-bold">+ 新增自訂運動</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="名稱，例如：打羽毛球熱身"
                  className="min-w-0 flex-1 glass-input"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={customKcal}
                  onChange={(e) => setCustomKcal(e.target.value)}
                  placeholder="每 30 分鐘 kcal"
                  className="w-32 glass-input"
                />
                <button
                  type="button"
                  disabled={!customName.trim() || !Number(customKcal)}
                  onClick={() => void addCustom()}
                  className="pressable shrink-0 rounded-xl glass-cta-amber px-4 py-2 font-bold text-white disabled:opacity-40"
                >
                  新增
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white/40">
                自訂運動嘅卡路里係你填嘅數，唔再按體重換算。
              </p>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {tab === 'all' &&
              (searching
                ? builtinResults.map((d) => (
                    <ExerciseRow key={d.id} sel={fromBuiltin(d)} />
                  ))
                : (['有氧', '球類', '健身房', '日常'] as const).map(
                    (cat) => (
                      <li key={cat}>
                        <p className="mt-2 mb-1.5 text-xs font-bold text-white/40">
                          {cat}
                        </p>
                        <ul className="space-y-2">
                          {EXERCISES.filter((d) => d.category === cat).map(
                            (d) => (
                              <ExerciseRow key={d.id} sel={fromBuiltin(d)} />
                            ),
                          )}
                        </ul>
                      </li>
                    ),
                  ))}
            {tab === 'all' &&
              searching &&
              customResults.map((c) => (
                <ExerciseRow key={c.id} sel={fromCustom(c)} />
              ))}
            {tab === 'all' && searching && builtinResults.length === 0 && customResults.length === 0 && (
              <p className="py-6 text-center text-white/40">
                搵唔到「{query.trim()}」— 試下喺「自訂」加一個。
              </p>
            )}

            {tab === 'recent' &&
              (recentRows.length === 0 ? (
                <p className="py-6 text-center text-white/40">
                  未有運動記錄 — 記一次之後，呢度會列出最近做過嘅運動。
                </p>
              ) : (
                recentRows.map((r) => {
                  const sel = resolveRecent(r)
                  return (
                    <ExerciseRow
                      key={r.name}
                      sel={sel}
                      sub={`上次 ${r.lastMinutes} 分鐘 · ${r.lastKcal} kcal`}
                    />
                  )
                })
              ))}

            {tab === 'fav' &&
              (favList.length === 0 ? (
                <p className="py-6 text-center text-white/40">
                  未收藏任何運動 — 喺詳情頁開返書籤開關就得。
                </p>
              ) : (
                favList.map((sel) => (
                  <ExerciseRow key={sel.id} sel={sel} />
                ))
              ))}

            {tab === 'custom' &&
              ((customs ?? []).length === 0 ? (
                <p className="py-6 text-center text-white/40">
                  未有自訂運動 — 喺上面加一個啦。
                </p>
              ) : (
                (customs ?? []).map((c) => (
                  <ExerciseRow
                    key={c.id}
                    sel={fromCustom(c)}
                    onDelete={() => void deleteCustom(c.id)}
                  />
                ))
              ))}
          </ul>
        </>
      )}

      {step === 'detail' && selected && (
        <>
          <button
            type="button"
            onClick={() => setStep('select')}
            className="pressable font-bold text-[#FF9F0A]"
          >
            ← 返回
          </button>

          {/* 標題列：記運動＋剪影＋名＋轉運動下拉。 */}
          <div className="relative mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#17140F] ring-1 ring-white/10">
              <ExerciseIcon
                icon={selected.icon}
                size={26}
                className="text-[#FF9F0A]"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-white/50">
                記運動
              </span>
              <span className="block truncate text-lg font-bold">
                {selected.name}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSwitchQuery('')
                setSwitchOpen((v) => !v)
              }}
              aria-expanded={switchOpen}
              className="pressable flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-3 py-2 text-sm font-bold"
            >
              轉運動
              <ChevronDownIcon size={14} className="text-white/50" />
            </button>
            {switchOpen && (
              <>
                <button
                  type="button"
                  aria-label="關閉轉運動"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setSwitchOpen(false)}
                />
                <span className="glass-card absolute top-full right-0 z-50 mt-2 block w-72 max-w-[86vw] p-2">
                  <input
                    type="text"
                    value={switchQuery}
                    onChange={(e) => setSwitchQuery(e.target.value)}
                    placeholder="搜尋運動..."
                    className="glass-input"
                  />
                  <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto">
                    {switchList.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => pickExercise(s)}
                          className="pressable flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/[0.06]"
                        >
                          <ExerciseIcon
                            icon={s.icon}
                            size={20}
                            className="shrink-0 text-[#FF9F0A]"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">
                            {s.name}
                          </span>
                          <span className="shrink-0 text-xs text-white/40">
                            {s.kcalPer30Min ?? '—'} kcal / 30分
                          </span>
                        </button>
                      </li>
                    ))}
                    {switchList.length === 0 && (
                      <p className="py-3 text-center text-sm text-white/40">
                        搵唔到
                      </p>
                    )}
                  </ul>
                </span>
              </>
            )}
          </div>

          {/* 日期＋開始時間：並排膠囊，撳開原生 picker。 */}
          <div className="mt-4 flex gap-2">
            <input
              ref={dateInputRef}
              type="date"
              value={dateStr}
              onChange={(e) => e.target.value && setDateStr(e.target.value)}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
            <input
              ref={timeInputRef}
              type="time"
              value={timeStr}
              onChange={(e) => e.target.value && setTimeStr(e.target.value)}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() =>
                dateInputRef.current?.showPicker?.() ??
                dateInputRef.current?.click()
              }
              className="pressable flex-1 rounded-full bg-white/[0.06] py-2.5 text-sm font-bold"
            >
              {dateLabel(dateStr)} ▾
            </button>
            <button
              type="button"
              onClick={() =>
                timeInputRef.current?.showPicker?.() ??
                timeInputRef.current?.click()
              }
              className="pressable flex-1 rounded-full bg-white/[0.06] py-2.5 text-sm font-bold"
            >
              {timeStr} ▾
            </button>
          </div>

          {/* 燒咗卡路里卡片：撳個數可以直接改。 */}
          <div className="mt-3 rounded-2xl glass-subcard p-4">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block font-bold">燒咗</span>
                <span className="mt-0.5 block text-xs text-white/40">
                  照你 {weight} kg 估 · 想改就撳個數
                </span>
              </span>
              {kcalEditing ? (
                <span className="flex shrink-0 items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    value={kcalDraft}
                    onChange={(e) => setKcalDraft(e.target.value)}
                    className="w-24 glass-input text-right text-xl font-bold tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = Math.round(Number(kcalDraft))
                      if (v >= 0) setKcalOverride(v)
                      setKcalEditing(false)
                    }}
                    className="pressable rounded-xl glass-cta-amber px-3 py-2 text-sm font-bold text-white"
                  >
                    完成
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setKcalDraft(String(kcal))
                    setKcalEditing(true)
                  }}
                  className="pressable shrink-0 text-right"
                  aria-label="手動修改卡路里"
                >
                  <span className="text-2xl font-bold tabular-nums">
                    {kcal}
                  </span>{' '}
                  <span className="font-bold text-white/60">kcal</span>
                </button>
              )}
            </div>
            {kcalOverride != null && !kcalEditing && (
              <button
                type="button"
                onClick={() => setKcalOverride(null)}
                className="pressable mt-1 text-xs font-bold text-[#FF9F0A]"
              >
                已手動修改 · 重設為自動估算
              </button>
            )}
          </div>

          {/* 水平刻度尺。 */}
          <div className="mt-4">
            <p className="text-center text-sm font-bold text-white/60">
              做咗幾耐 · 左右拉
            </p>
            <p className="mt-1 text-center text-4xl font-bold tabular-nums">
              {minutes} 分鐘
            </p>
            <p className="mt-0.5 text-center text-sm text-white/50 tabular-nums">
              {fmtTime(startDate)} - {fmtTime(endDate)}
            </p>
            <div className="relative mt-3">
              <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2">
                <div className="h-11 w-1 rounded-full bg-[#14B8A6]" />
              </div>
              <div
                ref={rulerRef}
                onScroll={onRulerScroll}
                className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div
                  className="flex w-max items-start"
                  style={{
                    paddingLeft: 'calc(50% - 7px)',
                    paddingRight: 'calc(50% - 7px)',
                  }}
                >
                  {Array.from({ length: 36 }, (_, i) => {
                    const m = (i + 1) * 5
                    const major = MAJOR_TICKS.has(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => pickMinutes(m)}
                        aria-label={`${m} 分鐘`}
                        className="pressable flex w-[14px] shrink-0 flex-col items-center pt-1"
                      >
                        <span
                          className={
                            major
                              ? 'h-8 w-[2px] rounded bg-white/60'
                              : 'h-4 w-[2px] rounded bg-white/25'
                          }
                        />
                        <span className="mt-1 h-4 text-[10px] text-white/40 tabular-nums">
                          {major ? m : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => pickMinutes(minutes - 5)}
                disabled={minutes <= MIN_MINUTES}
                aria-label="減 5 分鐘"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold disabled:opacity-30"
              >
                −
              </button>
              <span className="text-xs text-white/40">
                撳刻度可以直接跳去嗰個分鐘數
              </span>
              <button
                type="button"
                onClick={() => pickMinutes(minutes + 5)}
                disabled={minutes >= MAX_MINUTES}
                aria-label="加 5 分鐘"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-lg font-bold disabled:opacity-30"
              >
                ＋
              </button>
            </div>
          </div>

          {/* 收藏開關。 */}
          <button
            type="button"
            onClick={() => void toggleFav()}
            aria-pressed={isFav}
            className="pressable mt-4 flex w-full items-center gap-3 rounded-2xl glass-subcard p-4 text-left"
          >
            <BookmarkSilhouetteIcon
              size={22}
              className={isFav ? 'text-[#FF9F0A]' : 'text-white/40'}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">收藏呢個運動</span>
              <span className="block text-xs text-white/40">
                開咗之後會出現喺「收藏」分頁
              </span>
            </span>
            <span
              className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                isFav ? 'justify-end bg-[#14B8A6]' : 'bg-white/15'
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white" />
            </span>
          </button>

          {/* 今日上限結算。 */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl glass-subcard p-4">
            <span>
              <span className="block font-bold">今日上限</span>
              <span className="mt-0.5 block text-xs text-white/40">
                {countsTowardAllowance
                  ? `燒咗 ${kcal} kcal · 運動打折 ×0.72`
                  : '運動唔計入額度（設定已關閉）'}
              </span>
            </span>
            <span className="shrink-0 text-2xl font-bold text-[#14B8A6] tabular-nums">
              +{allowance} kcal
            </span>
          </div>

          <button
            type="button"
            onClick={() => void saveExercise()}
            className="pressable mt-4 w-full rounded-2xl glass-cta-amber py-3.5 text-base font-bold text-white"
          >
            記低佢！
          </button>
        </>
      )}
    </div>
  )
}

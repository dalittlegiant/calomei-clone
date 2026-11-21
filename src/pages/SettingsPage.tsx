import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  DEFAULT_HEALTH_SHORTCUT_NAME,
  getHealthShortcutName,
  getTargetOverride,
  getTheme,
  getTonePromptOverride,
  getVisionConfig,
  PROVIDER_PRESETS,
  resetTonePromptOverride,
  setHealthShortcutName,
  setSetting,
  setTargetOverride,
  setTheme as saveThemeSetting,
  setTonePromptOverride,
  type NutritionTargetOverride,
  type ThemeMode,
  type UserProfile,
  type VisionProvider,
  type VisionProviderConfig,
} from '../lib/db'
import {
  DEFAULT_TONE,
  getToneInfo,
  TONES,
  type ToneMode,
} from '../config/prompts'
import { ACTIVITY_OPTIONS, dailyTarget, effectiveTarget } from '../lib/nutrition'
import { computeStreaks, dayStartMinutes, getDayStart, setDayStart } from '../lib/day'
import { HEALTH_PAYLOAD_FIELDS } from '../lib/health'
import {
  downloadBackup,
  exportBackup,
  importBackup,
} from '../lib/backup'

interface Props {
  profile: UserProfile
  onProfileSaved: (profile: UserProfile) => void
  onVisionSaved: (config: VisionProviderConfig) => void
  onPromptSaved: () => void
  onThemeChange: (theme: ThemeMode) => void
}

export default function SettingsPage({
  profile,
  onProfileSaved,
  onVisionSaved,
  onPromptSaved,
  onThemeChange,
}: Props) {
  const [form, setForm] = useState<UserProfile>(profile)
  const [vision, setVision] = useState<VisionProviderConfig | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [tone, setTone] = useState<ToneMode>(
    (profile.toneMode as ToneMode) || DEFAULT_TONE,
  )
  const [promptText, setPromptText] = useState('')
  const [promptCustom, setPromptCustom] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [includeApiKey, setIncludeApiKey] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [targetForm, setTargetForm] = useState<{
    calories: string
    proteinG: string
    carbsG: string
    fatG: string
    sugarCeilingG: string
    fiberFloorG: string
    sodiumCeilingMg: string
  }>({
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    sugarCeilingG: '',
    fiberFloorG: '',
    sodiumCeilingMg: '',
  })
  const [targetOverride, setTargetOverrideState] =
    useState<NutritionTargetOverride | null>(null)
  const [shortcutName, setShortcutName] = useState(
    DEFAULT_HEALTH_SHORTCUT_NAME,
  )
  const [dayStartInput, setDayStartInput] = useState('00:00')
  const [theme, setThemeState] = useState<ThemeMode>('dark')
  const entries = useLiveQuery(() => db.food_entries.toArray(), [])
  const streaks = computeStreaks(
    entries ?? [],
    dayStartMinutes(dayStartInput),
  )

  useEffect(() => {
    setForm(profile)
    setTone((profile.toneMode as ToneMode) || DEFAULT_TONE)
  }, [profile])

  useEffect(() => {
    getVisionConfig().then(setVision)
    getTargetOverride().then((o) => {
      setTargetOverrideState(o)
      if (o) {
        setTargetForm({
          calories: o.calories?.toString() ?? '',
          proteinG: o.proteinG?.toString() ?? '',
          carbsG: o.carbsG?.toString() ?? '',
          fatG: o.fatG?.toString() ?? '',
          sugarCeilingG: o.sugarCeilingG?.toString() ?? '',
          fiberFloorG: o.fiberFloorG?.toString() ?? '',
          sodiumCeilingMg: o.sodiumCeilingMg?.toString() ?? '',
        })
      }
    })
    getHealthShortcutName().then(setShortcutName)
    getDayStart().then(setDayStartInput)
    getTheme().then(setThemeState)
  }, [])

  useEffect(() => {
    let cancelled = false
    getTonePromptOverride(tone).then((override) => {
      if (cancelled) return
      setPromptCustom(override !== null)
      setPromptText(override ?? getToneInfo(tone).prompt)
    })
    return () => {
      cancelled = true
    }
  }, [tone])

  const target = dailyTarget(form)
  const effective = effectiveTarget(form, targetOverride)

  function flash(msg: string) {
    setSavedMsg(msg)
    window.setTimeout(() => setSavedMsg(null), 2500)
  }

  async function saveProfile() {
    const next = { ...form, toneMode: tone }
    await db.user_profiles.put(next)
    onProfileSaved(next)
    flash('個人檔案已儲存')
  }

  /** Blank input = null = use the Mifflin default for that field. */
  function numOrNull(s: string): number | null {
    const n = Number(s)
    return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n
  }

  async function saveTargets() {
    const next = await setTargetOverride({
      calories: numOrNull(targetForm.calories),
      proteinG: numOrNull(targetForm.proteinG),
      carbsG: numOrNull(targetForm.carbsG),
      fatG: numOrNull(targetForm.fatG),
      sugarCeilingG: numOrNull(targetForm.sugarCeilingG),
      fiberFloorG: numOrNull(targetForm.fiberFloorG),
      sodiumCeilingMg: numOrNull(targetForm.sodiumCeilingMg),
    })
    setTargetOverrideState(next)
    flash('自訂每日目標已儲存')
  }

  async function saveDayStart() {
    await setDayStart(dayStartInput)
    flash('一日開始時間已儲存')
  }

  async function changeTheme(t: ThemeMode) {
    setThemeState(t)
    await saveThemeSetting(t)
    onThemeChange(t)
    flash(t === 'dark' ? '已轉深色主題' : '已轉淺色主題')
  }

  async function saveShortcutName() {
    await setHealthShortcutName(shortcutName)
    flash('捷徑名已儲存')
  }

  async function saveVision() {
    if (!vision) return
    await setSetting('vision', vision)
    onVisionSaved(vision)
    flash('Vision API 設定已儲存')
  }

  function changeProvider(provider: VisionProvider) {
    setVision((v) => {
      if (!v) return v
      const preset = PROVIDER_PRESETS[provider]
      return { ...v, provider, baseUrl: preset.baseUrl, model: preset.model }
    })
  }

  async function savePrompt() {
    await setTonePromptOverride(tone, promptText)
    setPromptCustom(true)
    onPromptSaved()
    flash('語氣 Prompt 已儲存')
  }

  async function resetPrompt() {
    await resetTonePromptOverride(tone)
    setPromptCustom(false)
    setPromptText(getToneInfo(tone).prompt)
    onPromptSaved()
    flash('已回復預設 Prompt')
  }

  async function onExportBackup() {
    const data = await exportBackup(includeApiKey)
    downloadBackup(data)
    flash(
      includeApiKey
        ? '備份已匯出（包括 API Key，請妥善保管）'
        : '備份已匯出（唔包 API Key）',
    )
  }

  async function onImportFile(file: File | undefined) {
    if (!file || importing) return
    setImporting(true)
    try {
      const text = await file.text()
      const result = await importBackup(JSON.parse(text) as unknown)
      if (result.vision) {
        setVision(result.vision)
        onVisionSaved(result.vision)
      }
      onPromptSaved()
      flash(
        `還原完成：${result.counts.entries} 餐記錄、${result.counts.weights} 個體重記錄、${result.counts.water} 筆飲水、${result.counts.exercise} 筆運動、${result.counts.profiles} 個檔案`,
      )
    } catch (e) {
      flash(e instanceof Error ? `還原失敗：${e.message}` : '還原失敗')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  async function clearAllData() {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    await db.food_entries.clear()
    await db.weight_entries.clear()
    await db.water_entries.clear()
    await db.exercise_entries.clear()
    await db.body_fat_entries.clear()
    await db.nutrition_target_overrides.clear()
    setConfirmClear(false)
    flash('記錄已清除')
  }

  const birthdayStr = form.birthday
    ? new Date(form.birthday).toISOString().slice(0, 10)
    : ''

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      {savedMsg && (
        <p className="mt-4 rounded-xl bg-green-100 dark:bg-green-900 px-3 py-2 text-center text-sm font-bold text-green-800 dark:text-green-200">
          {savedMsg}
        </p>
      )}

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🏆 個人戰績</h2>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          <div>
            <p className="text-xl font-bold">{streaks.current}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">連續</p>
          </div>
          <div>
            <p className="text-xl font-bold">{streaks.longest}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">最長</p>
          </div>
          <div>
            <p className="text-xl font-bold">{streaks.logDays}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">受刑日數</p>
          </div>
          <div>
            <p className="text-xl font-bold">{streaks.totalEntries}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">記錄幾多次</p>
          </div>
          <div>
            <p className="text-xl font-bold">{effective.calories}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">你嘅配額</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">👤 個人檔案</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">名</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="你叫咩名？"
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">性別</span>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
            >
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">生日</span>
            <input
              type="date"
              value={birthdayStr}
              onChange={(e) =>
                setForm({
                  ...form,
                  birthday: e.target.value
                    ? new Date(e.target.value).getTime()
                    : 0,
                })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">身高 cm</span>
            <input
              type="number"
              inputMode="decimal"
              value={form.heightCM}
              onChange={(e) =>
                setForm({ ...form, heightCM: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">體重 kg</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.weightKG}
              onChange={(e) =>
                setForm({ ...form, weightKG: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">運動量</span>
            <select
              value={form.activityLevel}
              onChange={(e) =>
                setForm({ ...form, activityLevel: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">目標</span>
            <select
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
            >
              <option value="減脂">減脂</option>
              <option value="維持">維持</option>
              <option value="增肌">增肌</option>
            </select>
          </label>
        </div>
        <div className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-950 p-3 text-sm">
          <p className="font-bold">每日目標（Mifflin-St Jeor）</p>
          <p className="mt-1 text-stone-600 dark:text-stone-300">
            {target.calories} kcal · 蛋白質 {target.proteinG}g · 碳水{' '}
            {target.carbsG}g · 脂肪 {target.fatG}g
          </p>
        </div>
        <button
          type="button"
          onClick={saveProfile}
          className="mt-3 w-full rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
        >
          儲存個人檔案
        </button>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🕐 日常設定</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">
              一日開始時間
            </span>
            <input
              type="time"
              value={dayStartInput}
              onChange={(e) => setDayStartInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
            />
            <span className="mt-1 block text-xs text-stone-400 dark:text-stone-500">
              夜瞓嗰陣，凌晨食嘅嘢計入邊一日
            </span>
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600 dark:text-stone-300">主題</span>
            <select
              value={theme}
              onChange={(e) => changeTheme(e.target.value as ThemeMode)}
              className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
            >
              <option value="dark">深色（預設）</option>
              <option value="light">淺色</option>
            </select>
            <span className="mt-1 block text-xs text-stone-400 dark:text-stone-500">
              跟返原 app 嘅深色底 + 橙色
            </span>
          </label>
        </div>
        <button
          type="button"
          onClick={saveDayStart}
          className="mt-3 w-full rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
        >
          儲存一日開始時間
        </button>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🎯 自訂每日目標</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          留空即係用上面 Mifflin-St Jeor 計出嚟嘅預設值。糖係上限、纖維係下限、鈉係上限。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(
            [
              { key: 'calories', label: '卡路里 kcal', hint: `預設 ${target.calories}` },
              { key: 'proteinG', label: '蛋白質 g', hint: `預設 ${target.proteinG}` },
              { key: 'carbsG', label: '碳水 g', hint: `預設 ${target.carbsG}` },
              { key: 'fatG', label: '脂肪 g', hint: `預設 ${target.fatG}` },
              { key: 'sugarCeilingG', label: '糖上限 g', hint: '預設 50' },
              { key: 'fiberFloorG', label: '纖維下限 g', hint: '預設 25' },
              { key: 'sodiumCeilingMg', label: '鈉上限 mg', hint: '預設 2000' },
            ] as Array<{
              key: keyof typeof targetForm
              label: string
              hint: string
            }>
          ).map((f) => (
            <label key={f.key}>
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                value={targetForm[f.key]}
                onChange={(e) =>
                  setTargetForm({ ...targetForm, [f.key]: e.target.value })
                }
                placeholder={f.hint}
                className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-950 p-3 text-sm">
          <p className="font-bold">而家生效嘅目標</p>
          <p className="mt-1 text-stone-600 dark:text-stone-300">
            {effective.calories} kcal · 蛋白質 {effective.proteinG}g · 碳水{' '}
            {effective.carbsG}g · 脂肪 {effective.fatG}g
          </p>
          <p className="mt-0.5 text-stone-600 dark:text-stone-300">
            糖上限 {effective.sugarCeilingG}g · 纖維下限 {effective.fiberFloorG}
            g · 鈉上限 {effective.sodiumCeilingMg}mg
          </p>
        </div>
        <button
          type="button"
          onClick={saveTargets}
          className="mt-3 w-full rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
        >
          儲存自訂目標
        </button>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🔑 Vision API</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          API Key 只存喺呢部手機，唔會上傳。
        </p>
        {vision && (
          <>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">供應商</span>
              <select
                value={vision.provider}
                onChange={(e) =>
                  changeProvider(e.target.value as VisionProvider)
                }
                className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">Base URL</span>
              <input
                type="text"
                value={vision.baseUrl}
                onChange={(e) =>
                  setVision({ ...vision, baseUrl: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">API Key</span>
              <div className="mt-1 flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={vision.apiKey}
                  onChange={(e) =>
                    setVision({ ...vision, apiKey: e.target.value })
                  }
                  placeholder="sk-… / sk-or-…"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="shrink-0 rounded-xl bg-stone-100 dark:bg-stone-800 px-3 font-bold text-stone-600 dark:text-stone-300"
                >
                  {showKey ? '隱藏' : '顯示'}
                </button>
              </div>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">Model</span>
              <input
                type="text"
                value={vision.model}
                onChange={(e) =>
                  setVision({ ...vision, model: e.target.value })
                }
                placeholder="openai/gpt-4o-mini"
                autoCapitalize="off"
                autoCorrect="off"
                className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
              />
              <span className="mt-2 flex flex-wrap gap-2">
                {[
                  'openai/gpt-4o-mini',
                  'deepseek/deepseek-v4.1-flash',
                  'gemini-2.5-flash',
                ].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setVision({ ...vision, model: m })}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      vision.model === m
                        ? 'bg-amber-500 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 active:bg-amber-100'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </span>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600 dark:text-stone-300">
                思考模式（OpenRouter 適用）
              </span>
              <select
                value={vision.reasoningEffort ?? 'none'}
                onChange={(e) =>
                  setVision({
                    ...vision,
                    reasoningEffort: e.target.value as
                      | 'none'
                      | 'low'
                      | 'default',
                  })
                }
                className="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 outline-none focus:border-amber-400"
              >
                <option value="none">
                  關閉（唔思考，直接出答案）
                </option>
                <option value="low">低（輕量思考）</option>
                <option value="default">
                  跟模型預設（唔傳 reasoning 參數）
                </option>
              </select>
              <span className="mt-1 block text-xs text-stone-400 dark:text-stone-500">
                推理模型嘅思考過程會扣 max_tokens；關閉可以避免「模型無回傳內容」。只對
                OpenRouter 生效；如果模型強制推理、唔接受關閉，App
                會自動移除呢個參數重試一次。
              </span>
            </label>
            <button
              type="button"
              onClick={saveVision}
              className="mt-3 w-full rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
            >
              儲存 API 設定
            </button>
          </>
        )}
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🗣️ 語氣</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">地區：香港（MVP 只有香港）</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTone(t.id)}
              className={`rounded-2xl border-2 p-3 text-left ${
                tone === t.id
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="block font-bold">{t.label}</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                {t.description}
              </span>
            </button>
          ))}
        </div>

        <h3 className="mt-4 font-bold">✏️ 編輯語氣 Prompt</h3>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          而家編輯緊「{getToneInfo(tone).label}」。
          {promptCustom ? '你用緊自訂版本。' : '用緊預設版本。'}
          改完儲存，即刻生效。
        </p>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={12}
          className="mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={savePrompt}
            className="flex-1 rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
          >
            儲存 Prompt
          </button>
          <button
            type="button"
            onClick={resetPrompt}
            className="flex-1 rounded-2xl bg-white dark:bg-stone-900 py-3 font-bold text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 active:bg-amber-50"
          >
            重置預設值
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🍎 Apple Health（經 iOS 捷徑）</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          PWA 寫唔到 HealthKit，所以經你自建嘅 iOS 捷徑寫入。撳「同步去 Apple
          Health」嗰陣，App 會將數據包成 JSON 交畀捷徑。
        </p>
        <label className="mt-3 block">
          <span className="text-sm font-bold text-stone-600 dark:text-stone-300">捷徑名</span>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={shortcutName}
              onChange={(e) => setShortcutName(e.target.value)}
              placeholder="CaLoMeiToHealth"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={saveShortcutName}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 font-bold text-white active:bg-amber-600"
            >
              儲存
            </button>
          </div>
          <span className="mt-1 block text-xs text-stone-400 dark:text-stone-500">
            要同捷徑 App 入面嗰捷徑個名一模一樣。
          </span>
        </label>

        <details className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-950 p-3 text-sm">
          <summary className="cursor-pointer font-bold">
            📖 iOS 捷徑設定教學（撳開睇）
          </summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed">
            <li>
              iPhone 開「捷徑」App → 右上角 <b>＋</b> 新增捷徑，改名做上面填嘅名（預設{' '}
              <code className="rounded bg-white dark:bg-stone-900 px-1">CaLoMeiToHealth</code>）。
            </li>
            <li>
              第一個動作：<b>取得辭典</b>，輸入揀「捷徑輸入」（Shortcut
              Input）。App 傳過嚟嘅 JSON 文字會自動變成辭典。
            </li>
            <li>
              用「取得辭典值」攞 <code className="rounded bg-white dark:bg-stone-900 px-1">type</code>{' '}
              判斷係邊種數據，再用「如果」分三路：
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  <b>meal</b>：用「記錄健康樣本」寫入 7 項 — 膳食能量（kcal）、膳食蛋白質（g）、膳食碳水化合物（g）、膳食脂肪（g）、膳食糖（g）、膳食纖維（g）、膳食鈉（mg）。數值用「取得辭典值」對應嘅欄位名，日期用{' '}
                  <code className="rounded bg-white dark:bg-stone-900 px-1">date</code>。
                </li>
                <li>
                  <b>water</b>：用「記錄健康樣本」寫入「水」，數值係{' '}
                  <code className="rounded bg-white dark:bg-stone-900 px-1">amount_ml</code>（毫升）。
                </li>
                <li>
                  <b>weight</b>：用「記錄健康樣本」寫入「體重」，數值係{' '}
                  <code className="rounded bg-white dark:bg-stone-900 px-1">weight_kg</code>
                  ；有{' '}
                  <code className="rounded bg-white dark:bg-stone-900 px-1">
                    body_fat_percent
                  </code>{' '}
                  就再寫入「體脂百分比」。
                </li>
              </ul>
            </li>
            <li>
              第一次運行嗰陣，iOS 會問你係咪允許捷徑寫入「健康」— 撳「允許」。之後每次撳 App 入面嘅同步掣，就會自動寫入，唔使再確認。
            </li>
            <li>
              測試：喺 App 記錄一餐之後撳「同步呢餐去 Apple
              Health」，然後去「健康」App 睇吓有無多咗一筆膳食能量。
            </li>
          </ol>
          <p className="mt-3 font-bold">傳去捷徑嘅 JSON 欄位：</p>
          {HEALTH_PAYLOAD_FIELDS.map((group) => (
            <div key={group.type} className="mt-2">
              <p className="font-bold">
                <code className="rounded bg-white dark:bg-stone-900 px-1">{group.type}</code>
              </p>
              <table className="mt-1 w-full border-collapse text-xs">
                <tbody>
                  {group.fields.map((f) => (
                    <tr key={f.name} className="border-t border-amber-200/60">
                      <td className="py-1 pr-2 align-top font-bold">
                        <code className="rounded bg-white dark:bg-stone-900 px-1">{f.name}</code>
                      </td>
                      <td className="py-1 text-stone-600 dark:text-stone-300">{f.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
            提示：捷徑入面「取得辭典值」嘅 key 要同上面欄位名完全一致（英文、細階）。date
            係 ISO 時間，捷徑可以直接當日期用。
          </p>
        </details>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">💾 備份／還原</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          備份飲食記錄、飲水、運動、體重／體脂、自訂目標、個人檔案同自訂 Prompt。預設唔包 API
          Key，換手機還原之後要再輸入一次。
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-stone-600 dark:text-stone-300">
          <input
            type="checkbox"
            checked={includeApiKey}
            onChange={(e) => setIncludeApiKey(e.target.checked)}
            className="h-5 w-5 accent-amber-500"
          />
          匯出時包括 API Key（唔好傳畀其他人）
        </label>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onImportFile(e.target.files?.[0])}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onExportBackup}
            className="flex-1 rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
          >
            ⬇️ 匯出備份
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => importRef.current?.click()}
            className="flex-1 rounded-2xl bg-white dark:bg-stone-900 py-3 font-bold text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 disabled:opacity-40 active:bg-amber-50"
          >
            {importing ? '還原緊…' : '⬆️ 匯入備份'}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
          匯入會取代而家全部記錄，匯入前建議先匯出一次做保險。
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-white dark:bg-stone-900 p-4 shadow-sm">
        <h2 className="text-lg font-bold">🗑️ 數據</h2>
        <button
          type="button"
          onClick={clearAllData}
          className={`mt-3 w-full rounded-2xl py-3 font-bold ${
            confirmClear
              ? 'bg-red-600 text-white'
              : 'bg-white dark:bg-stone-900 text-red-600 ring-1 ring-red-200'
          }`}
        >
          {confirmClear ? '再撳一次確認清除全部記錄' : '清除全部飲食記錄'}
        </button>
        <p className="mt-2 text-center text-xs text-stone-400 dark:text-stone-500">
          CaLoMei Clone · 個人自用版 · 資料只存喺呢部手機
        </p>
      </section>
    </div>
  )
}

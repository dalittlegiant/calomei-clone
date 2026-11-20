import { useEffect, useRef, useState } from 'react'
import {
  db,
  getTonePromptOverride,
  getVisionConfig,
  PROVIDER_PRESETS,
  resetTonePromptOverride,
  setSetting,
  setTonePromptOverride,
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
import { ACTIVITY_OPTIONS, dailyTarget } from '../lib/nutrition'
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
}

export default function SettingsPage({
  profile,
  onProfileSaved,
  onVisionSaved,
  onPromptSaved,
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

  useEffect(() => {
    setForm(profile)
    setTone((profile.toneMode as ToneMode) || DEFAULT_TONE)
  }, [profile])

  useEffect(() => {
    getVisionConfig().then(setVision)
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
        `還原完成：${result.counts.entries} 餐記錄、${result.counts.weights} 個體重記錄、${result.counts.profiles} 個檔案`,
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
    setConfirmClear(false)
    flash('記錄已清除')
  }

  const birthdayStr = form.birthday
    ? new Date(form.birthday).toISOString().slice(0, 10)
    : ''

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      {savedMsg && (
        <p className="mt-4 rounded-xl bg-green-100 px-3 py-2 text-center text-sm font-bold text-green-800">
          {savedMsg}
        </p>
      )}

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">👤 個人檔案</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600">名</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="你叫咩名？"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600">性別</span>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 outline-none focus:border-amber-400"
            >
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600">生日</span>
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
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600">身高 cm</span>
            <input
              type="number"
              inputMode="decimal"
              value={form.heightCM}
              onChange={(e) =>
                setForm({ ...form, heightCM: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-stone-600">體重 kg</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.weightKG}
              onChange={(e) =>
                setForm({ ...form, weightKG: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
            />
          </label>
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600">運動量</span>
            <select
              value={form.activityLevel}
              onChange={(e) =>
                setForm({ ...form, activityLevel: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 outline-none focus:border-amber-400"
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            <span className="text-sm font-bold text-stone-600">目標</span>
            <select
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 outline-none focus:border-amber-400"
            >
              <option value="減脂">減脂</option>
              <option value="維持">維持</option>
              <option value="增肌">增肌</option>
            </select>
          </label>
        </div>
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm">
          <p className="font-bold">每日目標（Mifflin-St Jeor）</p>
          <p className="mt-1 text-stone-600">
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

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">🔑 Vision API</h2>
        <p className="mt-1 text-sm text-stone-500">
          API Key 只存喺呢部手機，唔會上傳。
        </p>
        {vision && (
          <>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600">供應商</span>
              <select
                value={vision.provider}
                onChange={(e) =>
                  changeProvider(e.target.value as VisionProvider)
                }
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 outline-none focus:border-amber-400"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600">Base URL</span>
              <input
                type="text"
                value={vision.baseUrl}
                onChange={(e) =>
                  setVision({ ...vision, baseUrl: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600">API Key</span>
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
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="shrink-0 rounded-xl bg-stone-100 px-3 font-bold text-stone-600"
                >
                  {showKey ? '隱藏' : '顯示'}
                </button>
              </div>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-stone-600">Model</span>
              <input
                type="text"
                value={vision.model}
                onChange={(e) =>
                  setVision({ ...vision, model: e.target.value })
                }
                placeholder="openai/gpt-4o-mini"
                autoCapitalize="off"
                autoCorrect="off"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
              />
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

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">🗣️ 語氣</h2>
        <p className="mt-1 text-sm text-stone-500">地區：香港（MVP 只有香港）</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTone(t.id)}
              className={`rounded-2xl border-2 p-3 text-left ${
                tone === t.id
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-stone-200 bg-white'
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="block font-bold">{t.label}</span>
              <span className="block text-xs text-stone-500">
                {t.description}
              </span>
            </button>
          ))}
        </div>

        <h3 className="mt-4 font-bold">✏️ 編輯語氣 Prompt</h3>
        <p className="mt-1 text-sm text-stone-500">
          而家編輯緊「{getToneInfo(tone).label}」。
          {promptCustom ? '你用緊自訂版本。' : '用緊預設版本。'}
          改完儲存，即刻生效。
        </p>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={12}
          className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
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
            className="flex-1 rounded-2xl bg-white py-3 font-bold text-amber-700 ring-1 ring-amber-300 active:bg-amber-50"
          >
            重置預設值
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">💾 備份／還原</h2>
        <p className="mt-1 text-sm text-stone-500">
          備份飲食記錄、體重、個人檔案同自訂 Prompt。預設唔包 API
          Key，換手機還原之後要再輸入一次。
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-stone-600">
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
            className="flex-1 rounded-2xl bg-white py-3 font-bold text-amber-700 ring-1 ring-amber-300 disabled:opacity-40 active:bg-amber-50"
          >
            {importing ? '還原緊…' : '⬆️ 匯入備份'}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          匯入會取代而家全部記錄，匯入前建議先匯出一次做保險。
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">🗑️ 數據</h2>
        <button
          type="button"
          onClick={clearAllData}
          className={`mt-3 w-full rounded-2xl py-3 font-bold ${
            confirmClear
              ? 'bg-red-600 text-white'
              : 'bg-white text-red-600 ring-1 ring-red-200'
          }`}
        >
          {confirmClear ? '再撳一次確認清除全部記錄' : '清除全部飲食記錄'}
        </button>
        <p className="mt-2 text-center text-xs text-stone-400">
          CaLoMei Clone · 個人自用版 · 資料只存喺呢部手機
        </p>
      </section>
    </div>
  )
}

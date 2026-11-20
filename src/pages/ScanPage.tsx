import { useRef, useState } from 'react'
import { db, type UserProfile, type VisionProviderConfig } from '../lib/db'
import { compressImage, inferMealType, MEAL_LABELS, type MealType } from '../lib/image'
import { scanFood } from '../lib/vision'
import { getToneInfo } from '../config/prompts'

interface Props {
  profile: UserProfile
  tonePrompt: string
  visionConfig: VisionProviderConfig
  onScanned: (entryId: string) => void
}

export default function ScanPage({
  profile,
  tonePrompt,
  visionConfig,
  onScanned,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mealType, setMealType] = useState<MealType>(() => inferMealType())
  const [description, setDescription] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const tone = getToneInfo(profile.toneMode)

  function onPick(f: File | undefined) {
    if (!f) return
    setFile(f)
    setError(null)
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result))
    reader.readAsDataURL(f)
  }

  async function onScan() {
    if (!file || scanning) return
    if (!visionConfig.apiKey.trim()) {
      setError('未設定 API Key，請先去「設定」輸入 OpenRouter / OpenAI / Gemini 嘅 key。')
      return
    }
    setScanning(true)
    setError(null)
    const entryId = crypto.randomUUID()
    try {
      const compressed = await compressImage(file)
      const now = Date.now()
      await db.food_entries.add({
        id: entryId,
        name: '掃描中…',
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        servingSize: '',
        mealType,
        date: now,
        createdAt: now,
        imageDataUrl: compressed.dataUrl,
        scanStatus: 'scanning',
      })
      const result = await scanFood(
        {
          image_base64: compressed.base64,
          food_description: description.trim() || null,
          meal_type: mealType,
          region: 'hk',
          tone_mode: tone.apiValue,
        },
        visionConfig,
        tonePrompt,
      )
      const components = result.food_items.map((item) => ({
        nameZH: item.name_zh,
        nameEN: item.name_en,
        portionDescription: item.portion_description,
        calories: item.estimated_calories,
        proteinG: item.protein_g,
        carbsG: item.carbs_g,
        fatG: item.fat_g,
        confidence: item.confidence,
        isExcluded: false,
      }))
      const first = components[0]
      await db.food_entries.update(entryId, {
        name: first?.nameZH ?? '未知食物',
        calories: result.total_calories,
        proteinG: round1(
          components.reduce((a, c) => a + c.proteinG, 0),
        ),
        carbsG: round1(components.reduce((a, c) => a + c.carbsG, 0)),
        fatG: round1(components.reduce((a, c) => a + c.fatG, 0)),
        servingSize: first?.portionDescription ?? '',
        componentsJson: JSON.stringify(components),
        scanStatus: 'done',
        roastComment: result.roast_comment,
        roastEmoji: tone.emoji,
        aiOriginalName: first?.nameZH ?? null,
        aiOriginalComponentsJson: JSON.stringify(components),
      })
      onScanned(entryId)
    } catch (e) {
      await db.food_entries.delete(entryId).catch(() => undefined)
      setError(e instanceof Error ? e.message : '掃描失敗，請再試一次。')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {!preview ? (
        <div className="mt-6 rounded-3xl border-2 border-dashed border-amber-300 bg-white p-8 text-center">
          <div className="text-5xl">📸</div>
          <p className="mt-3 text-lg font-bold">影低你食緊咩</p>
          <p className="mt-1 text-sm text-stone-500">
            AI 會認出食物、計卡路里，再用{tone.label}語氣講句嘢
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex-1 rounded-2xl bg-amber-500 py-3 font-bold text-white active:bg-amber-600"
            >
              📷 影相
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex-1 rounded-2xl bg-white py-3 font-bold text-amber-700 ring-1 ring-amber-300 active:bg-amber-50"
            >
              🖼️ 揀相
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <img
            src={preview}
            alt="食物相片"
            className="w-full rounded-3xl object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setFile(null)
              setPreview(null)
              setError(null)
            }}
            className="mt-2 w-full rounded-xl py-2 text-sm font-bold text-stone-500 active:bg-stone-100"
          >
            換過張相
          </button>
        </div>
      )}

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <label className="text-sm font-bold text-stone-600">邊餐？</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMealType(m)}
              className={`rounded-xl py-2 font-bold ${
                mealType === m
                  ? 'bg-amber-500 text-white'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-bold text-stone-600">
          補充（可選）
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例如：食咗一半、走甜、加飯…"
          className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-amber-400"
        />

        <div className="mt-3 flex items-center justify-between text-sm text-stone-500">
          <span>
            語氣：{tone.emoji} {tone.label}
          </span>
          <span>地區：香港</span>
        </div>

        <button
          type="button"
          disabled={!file || scanning}
          onClick={onScan}
          className="mt-4 w-full rounded-2xl bg-amber-500 py-3 text-lg font-bold text-white disabled:opacity-40 active:bg-amber-600"
        >
          {scanning ? '分析緊…請稍候' : '🔍 分析呢餐'}
        </button>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="mt-3 text-center text-xs text-stone-400">
          相片會壓縮到最長邊 1024px、JPEG 70% 先上傳
        </p>
      </div>
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

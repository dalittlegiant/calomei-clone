import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { db, type UserProfile, type VisionProviderConfig } from '../lib/db'
import { compressImage, inferMealType } from '../lib/image'
import { scanFood, scanNutritionLabel } from '../lib/vision'
import { getToneInfo } from '../config/prompts'
import { GlassButton } from '../components/ui'

// 2026-11-25：模式由出面九宮格掣決定（影相＝food、掃描＝label），
// ScanPage 唔再有 3 模式切換；打字改行 AddSheet 快入彈窗。
type ScanMode = 'food' | 'label'

interface Props {
  profile: UserProfile
  tonePrompt: string
  visionConfig: VisionProviderConfig
  /** From the add sheet: a photo already picked — load it straight away. */
  initialFile?: File | null
  initialMode?: ScanMode
  onScanned: (entryId: string) => void
  onBack: () => void
}

export default function ScanPage({
  profile,
  tonePrompt,
  visionConfig,
  initialFile,
  initialMode,
  onScanned,
  onBack,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  // 模式入嚟嗰陣已經定咗（影相 food／掃描 label），呢頁唔再切換。
  const mode: ScanMode = initialMode ?? 'food'
  // 2026-11-25：早／午／晚餐類型取消——唔再問邊餐，記錄嗰陣按時間
  // 推斷（inferMealType）存入去就算，畫面唔顯示。
  const [description, setDescription] = useState('')
  const [scanning, setScanning] = useState(false)
  // Live progress line while the model works (attempts / retries) — the
  // scan used to show one static 「分析緊…」 for up to ~4 minutes.
  const [scanProgress, setScanProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const initialFileRef = useRef(initialFile ?? null)

  // A file picked in the add sheet arrives here pre-loaded.
  useEffect(() => {
    const f = initialFileRef.current
    if (!f) return
    initialFileRef.current = null
    onPick(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (scanning) return
    if (!visionConfig.apiKey.trim()) {
      setError('未設定 API Key，請先去「設定」輸入 OpenRouter / OpenAI / Gemini 嘅 key。')
      return
    }
    if (!file) return
    setScanning(true)
    setError(null)
    const entryId = crypto.randomUUID()
    try {
      const compressed = await compressImage(file as File)
      const now = Date.now()
      await db.food_entries.add({
        id: entryId,
        name: '掃描中…',
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        sugarG: 0,
        fiberG: 0,
        sodiumMg: 0,
        servingSize: '',
        mealType: inferMealType(),
        date: now,
        createdAt: now,
        imageDataUrl: compressed.dataUrl,
        scanStatus: 'scanning',
        rebuttable: true,
      })
      const request = {
        image_base64: compressed.base64,
        food_description: description.trim() || null,
        meal_type: inferMealType(),
        region: 'hk',
        tone_mode: tone.apiValue,
      }
      // v1.7.0 previous_roasts: today's earlier roasts, so the model does
      // not repeat the same roast. Label mode does not need it.
      let result
      if (mode === 'label') {
        result = await scanNutritionLabel(
          request,
          visionConfig,
          tonePrompt,
          setScanProgress,
        )
      } else {
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const todays = await db.food_entries
          .where('date')
          .aboveOrEqual(startOfToday.getTime())
          .toArray()
        const previousRoasts = todays
          .filter((e) => e.scanStatus === 'done' && e.roastComment)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
          .map((e) => e.roastComment as string)
        result = await scanFood(
          { ...request, previous_roasts: previousRoasts },
          visionConfig,
          tonePrompt,
          setScanProgress,
        )
      }
      const components = result.food_items.map((item) => ({
        nameZH: item.name_zh,
        nameEN: item.name_en,
        portionDescription: item.portion_description,
        calories: item.estimated_calories,
        proteinG: item.protein_g,
        carbsG: item.carbs_g,
        fatG: item.fat_g,
        confidence: item.confidence,
        sugarG: item.sugar_g ?? 0,
        fiberG: item.fiber_g ?? 0,
        sodiumMg: item.sodium_mg ?? 0,
        isExcluded: false,
      }))
      const first = components[0]
      // 2026-11-25：大標題用 AI 起嘅成碟名（dish_name，例如邊爐拼盤），
      // 唔再拎第一樣食材（例如生菜）嚟做；AI 無畀先退返第一樣食材。
      const dishName = result.dish_name?.trim() || undefined
      await db.food_entries.update(entryId, {
        name: dishName ?? first?.nameZH ?? '未知食物',
        calories: result.total_calories,
        proteinG: round1(
          components.reduce((a, c) => a + c.proteinG, 0),
        ),
        carbsG: round1(components.reduce((a, c) => a + c.carbsG, 0)),
        fatG: round1(components.reduce((a, c) => a + c.fatG, 0)),
        sugarG: round1(components.reduce((a, c) => a + (c.sugarG ?? 0), 0)),
        fiberG: round1(components.reduce((a, c) => a + (c.fiberG ?? 0), 0)),
        sodiumMg: Math.round(
          components.reduce((a, c) => a + (c.sodiumMg ?? 0), 0),
        ),
        servingSize: first?.portionDescription ?? '',
        componentsJson: JSON.stringify(components),
        scanStatus: 'done',
        roastComment: result.roast_comment,
        roastEmoji: tone.emoji,
        rebuttable: result.rebuttable ?? true,
        aiOriginalName: dishName ?? first?.nameZH ?? null,
        aiOriginalComponentsJson: JSON.stringify(components),
      })
      onScanned(entryId)
    } catch (e) {
      await db.food_entries.delete(entryId).catch(() => undefined)
      setError(e instanceof Error ? e.message : '掃描失敗，請再試一次。')
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-8">
      <button
        type="button"
        onClick={onBack}
        className="mt-4 font-bold text-[#FF9F0A]"
      >
        ← 返回
      </button>
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
        <div className="mt-6 rounded-3xl border-2 border-dashed border-[#FF9F0A]/40 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
          <div className="text-5xl">{mode === 'label' ? '🏷️' : '📸'}</div>
          <p className="mt-3 text-lg font-bold">
            {mode === 'label' ? '影低營養標籤' : '影低你食緊咩'}
          </p>
          <p className="mt-1 text-sm text-white/50">
            {mode === 'label'
              ? '影包裝背面個營養表，AI 會直接讀數字填好'
              : `AI 會認出食物、計卡路里，再用${tone.label}語氣講句嘢`}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="pressable flex-1 rounded-2xl glass-cta-amber py-3 font-bold text-white"
            >
              📷 影相
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="pressable flex-1 rounded-2xl glass-subcard py-3 font-bold text-[#FF9F0A] ring-1 ring-[#FF9F0A]/40"
            >
              🖼️ 揀相
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="relative overflow-hidden rounded-3xl">
            <img
              src={preview}
              alt="食物相片"
              className="w-full rounded-3xl object-cover"
            />
            {/* 掃描光束 — 分析緊嗰陣喺相片上上下流動；純 transform＋opacity。 */}
            <AnimatePresence>
              {scanning && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 h-[45%] bg-[linear-gradient(180deg,transparent,rgba(255,159,10,0.12)_35%,rgba(255,159,10,0.45)_50%,rgba(255,159,10,0.12)_65%,transparent)]"
                  initial={{ y: '-100%', opacity: 0 }}
                  animate={{ y: '220%', opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    y: {
                      duration: 1.6,
                      repeat: Infinity,
                      repeatType: 'mirror',
                      ease: 'easeInOut',
                    },
                    opacity: { duration: 0.2 },
                  }}
                />
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null)
              setPreview(null)
              setError(null)
            }}
            className="pressable mt-2 w-full rounded-xl py-2 text-sm font-bold text-white/50"
          >
            換過張相
          </button>
        </div>
      )}

      <div className="mt-4 glass-card p-4">
        <label className="block text-sm font-bold text-white/60">
          補充（可選）
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            mode === 'label'
              ? '例如：產品名：出前一丁麻油味'
              : '例如：食咗一半、走甜、加飯…'
          }
          className="mt-1 glass-input"
        />

        <div className="mt-3 flex items-center justify-between text-sm text-white/50">
          <span>
            語氣：{tone.emoji} {tone.label}
          </span>
          <span>地區：香港</span>
        </div>

        <GlassButton
          variant="amber"
          disabled={scanning || !file}
          onClick={onScan}
          className="pressable mt-4 w-full rounded-2xl py-3 text-lg"
        >
          {scanning
            ? '分析緊…請稍候'
            : mode === 'label'
              ? '🔍 讀營養標籤'
              : '🔍 分析呢餐'}
        </GlassButton>

        {error && (
          <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {scanning && scanProgress && (
          <p className="mt-3 text-center text-sm text-white/50">
            {scanProgress}
          </p>
        )}
        <p className="mt-3 text-center text-xs text-white/40">
          相片會壓縮到最長邊 1024px、JPEG 70% 先上傳
        </p>
      </div>
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

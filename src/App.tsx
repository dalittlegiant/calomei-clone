import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  DEFAULT_VISION_CONFIG,
  getOrCreateProfile,
  getTheme,
  getTonePromptOverride,
  getVisionConfig,
  type ThemeMode,
  type UserProfile,
  type VisionProviderConfig,
} from './lib/db'
import { getToneInfo } from './config/prompts'
import { computeStreaks, dayStartMinutes, getDayStart } from './lib/day'
import ScanPage from './pages/ScanPage'
import ResultPage from './pages/ResultPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import HomePage from './pages/HomePage'
import ProgressPage from './pages/ProgressPage'
import AddSheet, { type SheetView } from './pages/AddSheet'

type Tab = 'home' | 'records' | 'progress' | 'settings'

interface ScanFlow {
  mode: 'food' | 'label' | 'text'
  initialFile: File | null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null)
  const [scanFlow, setScanFlow] = useState<ScanFlow | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [vision, setVision] = useState<VisionProviderConfig>(
    DEFAULT_VISION_CONFIG,
  )
  const [tonePrompt, setTonePrompt] = useState('')
  const [promptRefresh, setPromptRefresh] = useState(0)
  const [theme, setThemeState] = useState<ThemeMode>('dark')
  const [dayStart, setDayStart] = useState('00:00')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetView, setSheetView] = useState<SheetView>('menu')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // Live profile (first row) so tab switches always show fresh data.
  const liveProfile = useLiveQuery(() => db.user_profiles.toArray(), [])
  const allEntries = useLiveQuery(() => db.food_entries.toArray(), [])

  useEffect(() => {
    getOrCreateProfile().then(setProfile)
    getVisionConfig().then(setVision)
    getTheme().then(setThemeState)
    getDayStart().then(setDayStart)
  }, [])

  useEffect(() => {
    if (liveProfile && liveProfile.length > 0) setProfile(liveProfile[0])
  }, [liveProfile])

  // Dark theme is the default (matches the original app).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const loadPrompt = useCallback(async (toneMode: string) => {
    const override = await getTonePromptOverride(toneMode)
    setTonePrompt(override ?? getToneInfo(toneMode).prompt)
  }, [])

  useEffect(() => {
    if (profile) loadPrompt(profile.toneMode)
  }, [profile?.toneMode, promptRefresh, loadPrompt])

  const streak = computeStreaks(
    allEntries ?? [],
    dayStartMinutes(dayStart),
  )

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }

  function openSheet(view: SheetView = 'menu') {
    setSheetView(view)
    setSheetOpen(true)
  }

  function goTab(t: Tab) {
    setCurrentEntryId(null)
    setScanFlow(null)
    setTab(t)
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-stone-500">
        載入緊…
      </div>
    )
  }

  const tone = getToneInfo(profile.toneMode)

  return (
    <div className="flex min-h-dvh flex-col bg-[#FFF8F0] text-stone-900 dark:bg-[#12100e] dark:text-stone-100">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center bg-amber-500 text-white shadow-sm dark:bg-[#1c1917] dark:text-amber-400">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 md:max-w-2xl">
          <h1 className="text-xl font-bold">🍜 CaLoMei 卡老味</h1>
          <div className="flex items-center gap-2">
            {streak.current > 0 && (
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-sm font-bold dark:bg-white/10">
                🔥 {streak.current}
              </span>
            )}
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold dark:bg-white/10">
              {tone.emoji} {tone.label}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <main className="min-w-0 flex-1">
          {currentEntryId ? (
            <ResultPage
              entryId={currentEntryId}
              visionConfig={vision}
              tonePrompt={tonePrompt}
              toneApiValue={tone.apiValue}
              onBack={() => setCurrentEntryId(null)}
              onDeleted={() => {
                setCurrentEntryId(null)
                setTab('records')
              }}
            />
          ) : scanFlow ? (
            <ScanPage
              profile={profile}
              tonePrompt={tonePrompt}
              visionConfig={vision}
              initialMode={scanFlow.mode}
              initialFile={scanFlow.initialFile}
              onScanned={(id) => {
                setScanFlow(null)
                setCurrentEntryId(id)
              }}
              onBack={() => setScanFlow(null)}
            />
          ) : tab === 'home' ? (
            <HomePage
              profile={profile}
              onOpen={setCurrentEntryId}
              onAdd={() => openSheet('menu')}
              onAddExercise={() => openSheet('exercise')}
            />
          ) : tab === 'records' ? (
            <HistoryPage profile={profile} onOpen={setCurrentEntryId} />
          ) : tab === 'progress' ? (
            <ProgressPage profile={profile} />
          ) : (
            <SettingsPage
              profile={profile}
              onProfileSaved={setProfile}
              onVisionSaved={setVision}
              onPromptSaved={() => setPromptRefresh((n) => n + 1)}
              onThemeChange={setThemeState}
            />
          )}
        </main>

        {/* Right-side tool band — wide screens only (Duo opened). */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-20 shrink-0 flex-col items-center gap-5 py-6 md:flex">
          <RailButton
            active={tab === 'home' && !currentEntryId && !scanFlow}
            label="主頁"
            icon="🏠"
            onClick={() => goTab('home')}
          />
          <RailButton
            active={tab === 'records' || !!currentEntryId}
            label="記錄"
            icon="📒"
            onClick={() => goTab('records')}
          />
          <RailButton
            active={tab === 'progress'}
            label="進度"
            icon="📈"
            onClick={() => goTab('progress')}
          />
          <RailButton
            active={tab === 'settings'}
            label="設定"
            icon="⚙️"
            onClick={() => goTab('settings')}
          />
          <button
            type="button"
            onClick={() => openSheet('menu')}
            aria-label="新增"
            className="mt-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl font-bold text-white shadow-lg active:bg-amber-600"
          >
            ＋
          </button>
        </aside>
      </div>

      {/* Bottom tab bar — narrow screens only (folded / portrait). */}
      <nav className="pb-safe sticky bottom-0 z-10 border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 md:hidden">
        <div className="mx-auto grid w-full max-w-lg grid-cols-4">
          <NavButton
            active={tab === 'home' && !currentEntryId && !scanFlow}
            label="主頁"
            icon="🏠"
            onClick={() => goTab('home')}
          />
          <NavButton
            active={tab === 'records' || !!currentEntryId}
            label="記錄"
            icon="📒"
            onClick={() => goTab('records')}
          />
          <NavButton
            active={tab === 'progress'}
            label="進度"
            icon="📈"
            onClick={() => goTab('progress')}
          />
          <NavButton
            active={tab === 'settings'}
            label="設定"
            icon="⚙️"
            onClick={() => goTab('settings')}
          />
        </div>
      </nav>

      {/* FAB — narrow screens only. */}
      <button
        type="button"
        onClick={() => openSheet('menu')}
        aria-label="新增"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl font-bold text-white shadow-lg active:bg-amber-600 md:hidden"
      >
        ＋
      </button>

      <AddSheet
        open={sheetOpen}
        initialView={sheetView}
        onClose={() => setSheetOpen(false)}
        onScanFile={(file) => {
          setSheetOpen(false)
          setCurrentEntryId(null)
          setScanFlow({ mode: 'food', initialFile: file })
        }}
        onScanText={() => {
          setSheetOpen(false)
          setCurrentEntryId(null)
          setScanFlow({ mode: 'text', initialFile: null })
        }}
        onDone={showToast}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm font-bold whitespace-nowrap text-white shadow-lg md:bottom-8 dark:bg-stone-100 dark:text-stone-900">
          {toast}
        </div>
      )}
    </div>
  )
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center py-2.5 text-sm font-bold ${
        active
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-stone-400 dark:text-stone-500'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </button>
  )
}

function RailButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 text-xs font-bold ${
        active
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-stone-400 dark:text-stone-500'
      }`}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

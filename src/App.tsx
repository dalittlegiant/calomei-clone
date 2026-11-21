import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  DEFAULT_VISION_CONFIG,
  getOrCreateProfile,
  getTonePromptOverride,
  getVisionConfig,
  type UserProfile,
  type VisionProviderConfig,
} from './lib/db'
import { getToneInfo, TONES } from './config/prompts'
import { computeStreaks, dayStartMinutes, getDayStart } from './lib/day'
import {
  BowlIcon,
  ChevronDownIcon,
  HomeIcon,
  PlusIcon,
  ProgressIcon,
  RecordsIcon,
  SettingsIcon,
} from './components/icons'
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
  const [dayStart, setDayStart] = useState('00:00')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetView, setSheetView] = useState<SheetView>('menu')
  const [toast, setToast] = useState<string | null>(null)
  const [toneMenuOpen, setToneMenuOpen] = useState(false)
  const toastTimer = useRef<number | null>(null)

  // Live profile (first row) so tab switches always show fresh data.
  const liveProfile = useLiveQuery(() => db.user_profiles.toArray(), [])
  const allEntries = useLiveQuery(() => db.food_entries.toArray(), [])

  useEffect(() => {
    getOrCreateProfile().then(setProfile)
    getVisionConfig().then(setVision)
    getDayStart().then(setDayStart)
  }, [])

  useEffect(() => {
    if (liveProfile && liveProfile.length > 0) setProfile(liveProfile[0])
  }, [liveProfile])

  // Warm Obsidian is the single dark identity (DESIGN.md) — always dark.
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

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

  function goBack() {
    setCurrentEntryId(null)
    setScanFlow(null)
  }

  async function changeTone(toneId: string) {
    if (!profile || toneId === profile.toneMode) {
      setToneMenuOpen(false)
      return
    }
    // Same write Settings already uses; liveProfile picks the change up.
    await db.user_profiles.put({ ...profile, toneMode: toneId })
    setToneMenuOpen(false)
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-white/60">
        載入緊…
      </div>
    )
  }

  const tone = getToneInfo(profile.toneMode)
  const inDetail = !!currentEntryId || !!scanFlow
  const homeActive = tab === 'home' && !inDetail
  const recordsActive = tab === 'records' || !!currentEntryId

  return (
    <div className="relative min-h-dvh text-white tabular-nums">
      {/* Fixed warm-charcoal background + ambient glows (see DESIGN.md §2). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,#0A0A0C_0%,#141210_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(560px_380px_at_88%_-5%,rgba(255,159,10,0.10),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(620px_480px_at_-10%_100%,rgba(20,184,166,0.08),transparent_70%)]"
      />

      <div className="relative md:pr-28">
        {/* Open header — no pill frame, just two independent glass capsules. */}
        <header className="sticky top-0 z-30 bg-[#0A0A0C]/60 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:max-w-3xl md:px-6">
            {inDetail ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="返回"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-lg font-bold backdrop-blur-xl"
              >
                ‹
              </button>
            ) : (
              <span className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight">
                <BowlIcon size={22} className="text-[#FF9F0A]" />
                CaLoMei 卡老味
              </span>
            )}

            <span className="flex items-center gap-2">
              {streak.current > 0 && (
                <span className="glass-pill px-3 py-1.5 text-xs font-bold whitespace-nowrap">
                  🔥 {streak.current}日
                </span>
              )}

              {/* Tone pill selector — Hong Kong's 6 tones. */}
              <span className="relative">
                <button
                  type="button"
                  onClick={() => setToneMenuOpen((v) => !v)}
                  aria-expanded={toneMenuOpen}
                  className="flex items-center gap-1 glass-pill px-3 py-1.5 text-xs font-bold whitespace-nowrap"
                >
                  {tone.emoji} {tone.label}
                  <ChevronDownIcon size={12} className="text-white/50" />
                </button>
                {toneMenuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="關閉語氣選單"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setToneMenuOpen(false)}
                    />
                    <span className="glass-card absolute right-0 z-50 mt-2 block w-44 p-1.5">
                      {TONES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => changeTone(t.id)}
                          className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-bold ${
                            t.id === profile.toneMode
                              ? 'bg-[#FF9F0A]/25 text-white'
                              : 'text-white/80'
                          }`}
                        >
                          <span>
                            {t.emoji} {t.label}
                          </span>
                          {t.id === profile.toneMode && (
                            <span className="text-[#FF9F0A]">✓</span>
                          )}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
            </span>
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
              />
            )}
          </main>
        </div>
      </div>

      {/* Right-side floating glass rail — wide screens only (Duo opened). */}
      <aside className="glass-nav fixed top-1/2 right-4 z-20 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full p-2 md:flex">
        <RailButton
          active={homeActive}
          label="主頁"
          icon={<HomeIcon size={20} />}
          onClick={() => goTab('home')}
        />
        <RailButton
          active={recordsActive}
          label="記錄"
          icon={<RecordsIcon size={20} />}
          onClick={() => goTab('records')}
        />
        <RailButton
          active={tab === 'progress'}
          label="進度"
          icon={<ProgressIcon size={20} />}
          onClick={() => goTab('progress')}
        />
        <RailButton
          active={tab === 'settings'}
          label="設定"
          icon={<SettingsIcon size={20} />}
          onClick={() => goTab('settings')}
        />
        <button
          type="button"
          onClick={() => openSheet('menu')}
          aria-label="新增"
          className="glass-cta-amber mt-2 flex h-12 w-12 items-center justify-center rounded-full text-white"
        >
          <PlusIcon size={22} />
        </button>
      </aside>

      {/* Bottom floating glass pill tab bar — narrow screens only (folded). */}
      <nav className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2 md:hidden">
        <div className="glass-nav flex items-center gap-1 rounded-full p-1.5">
          <NavButton
            active={homeActive}
            label="主頁"
            icon={<HomeIcon size={20} />}
            onClick={() => goTab('home')}
          />
          <NavButton
            active={recordsActive}
            label="記錄"
            icon={<RecordsIcon size={20} />}
            onClick={() => goTab('records')}
          />
          <NavButton
            active={tab === 'progress'}
            label="進度"
            icon={<ProgressIcon size={20} />}
            onClick={() => goTab('progress')}
          />
          <NavButton
            active={tab === 'settings'}
            label="設定"
            icon={<SettingsIcon size={20} />}
            onClick={() => goTab('settings')}
          />
        </div>
      </nav>

      {/* FAB — narrow screens only. */}
      <button
        type="button"
        onClick={() => openSheet('menu')}
        aria-label="新增"
        className="glass-cta-amber fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white md:hidden"
      >
        <PlusIcon size={24} />
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
        <div className="glass-nav fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap text-white md:bottom-8">
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
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap transition-colors ${
        active ? 'bg-white/15 text-[#FF9F0A]' : 'text-white/50'
      }`}
    >
      {icon}
      {label}
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
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-full px-3 py-2.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
        active ? 'bg-white/15 text-[#FF9F0A]' : 'text-white/50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

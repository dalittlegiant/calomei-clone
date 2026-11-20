import { useCallback, useEffect, useState } from 'react'
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
import { getToneInfo } from './config/prompts'
import ScanPage from './pages/ScanPage'
import ResultPage from './pages/ResultPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

type Tab = 'scan' | 'history' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('scan')
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [vision, setVision] = useState<VisionProviderConfig>(
    DEFAULT_VISION_CONFIG,
  )
  const [tonePrompt, setTonePrompt] = useState('')
  const [promptRefresh, setPromptRefresh] = useState(0)

  // Live profile (first row) so tab switches always show fresh data.
  const liveProfile = useLiveQuery(() => db.user_profiles.toArray(), [])

  useEffect(() => {
    getOrCreateProfile().then(setProfile)
    getVisionConfig().then(setVision)
  }, [])

  useEffect(() => {
    if (liveProfile && liveProfile.length > 0) setProfile(liveProfile[0])
  }, [liveProfile])

  const loadPrompt = useCallback(async (toneMode: string) => {
    const override = await getTonePromptOverride(toneMode)
    setTonePrompt(override ?? getToneInfo(toneMode).prompt)
  }, [])

  useEffect(() => {
    if (profile) loadPrompt(profile.toneMode)
  }, [profile?.toneMode, promptRefresh, loadPrompt])

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-stone-500">
        載入緊…
      </div>
    )
  }

  const tone = getToneInfo(profile.toneMode)

  return (
    <div className="flex min-h-dvh flex-col bg-[#FFF8F0]">
      <header className="pt-safe sticky top-0 z-10 bg-amber-500 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">🍜 CaLoMei 卡老味</h1>
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
            {tone.emoji} {tone.label}
          </span>
        </div>
      </header>

      <main className="flex-1">
        {currentEntryId ? (
          <ResultPage
            entryId={currentEntryId}
            visionConfig={vision}
            onBack={() => setCurrentEntryId(null)}
            onDeleted={() => {
              setCurrentEntryId(null)
              setTab('history')
            }}
          />
        ) : tab === 'scan' ? (
          <ScanPage
            profile={profile}
            tonePrompt={tonePrompt}
            visionConfig={vision}
            onScanned={(id) => setCurrentEntryId(id)}
          />
        ) : tab === 'history' ? (
          <HistoryPage profile={profile} onOpen={setCurrentEntryId} />
        ) : (
          <SettingsPage
            profile={profile}
            onProfileSaved={setProfile}
            onVisionSaved={setVision}
            onPromptSaved={() => setPromptRefresh((n) => n + 1)}
          />
        )}
      </main>

      <nav className="pb-safe sticky bottom-0 z-10 border-t border-stone-200 bg-white">
        <div className="mx-auto grid w-full max-w-lg grid-cols-3">
          <NavButton
            active={tab === 'scan' && !currentEntryId}
            label="影相"
            icon="📸"
            onClick={() => {
              setCurrentEntryId(null)
              setTab('scan')
            }}
          />
          <NavButton
            active={tab === 'history' || !!currentEntryId}
            label="記錄"
            icon="📒"
            onClick={() => {
              setCurrentEntryId(null)
              setTab('history')
            }}
          />
          <NavButton
            active={tab === 'settings'}
            label="設定"
            icon="⚙️"
            onClick={() => {
              setCurrentEntryId(null)
              setTab('settings')
            }}
          />
        </div>
      </nav>
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
        active ? 'text-amber-600' : 'text-stone-400'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </button>
  )
}

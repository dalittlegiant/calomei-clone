// Lucide-style monochrome line icons (24×24, stroke = currentColor).
// Hand-written SVG paths matching Lucide's stroke style — no emoji, no icon font.
import type { ReactNode } from 'react'

function Svg({
  size = 20,
  className,
  children,
}: {
  size?: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function HomeIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  )
}

export function RecordsIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </Svg>
  )
}

export function ProgressIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Svg>
  )
}

export function SettingsIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function PlusIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Svg>
  )
}

export function FlameIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </Svg>
  )
}

export function DropletIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </Svg>
  )
}

export function CameraIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Svg>
  )
}

export function ActivityIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Svg>
  )
}

/** Brand mark: a small steaming bowl, drawn in the same line style. */
export function BowlIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 12h16a8 8 0 0 1-16 0Z" />
      <path d="M9 8.5c0-1.5 1-1.5 1-3" />
      <path d="M14 8.5c0-1.5 1-1.5 1-3" />
    </Svg>
  )
}

export function ChevronDownIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  )
}

export function ChevronRightIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polyline points="9 18 15 12 9 6" />
    </Svg>
  )
}

export function StarIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  )
}

export function HeartIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </Svg>
  )
}

export function TrashIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </Svg>
  )
}

export function PencilIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Svg>
  )
}

export function SparklesIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </Svg>
  )
}

export function XIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  )
}

export function RotateCcwIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  )
}

/** Lucide chef-hat — Meal Planner 「煮飯」分頁。 */
export function ChefHatIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" />
      <path d="M6 17h12" />
    </Svg>
  )
}

/** Lucide timer — 下廚計時。 */
export function TimerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </Svg>
  )
}

/** Lucide volume-2 — 廣東話朗讀。 */
export function VolumeIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Svg>
  )
}

/** Lucide shopping-basket — 買餸。 */
export function ShoppingBagIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="m5 11 4-7" />
      <path d="m19 11-4-7" />
      <path d="M2 11h20" />
      <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
      <path d="m9 11 1 9" />
      <path d="m15 11-1 9" />
    </Svg>
  )
}

/** Lucide check — 圓形剔格用。 */
export function CheckIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  )
}

/** Lucide clock — 烹調時間。 */
export function ClockIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Svg>
  )
}

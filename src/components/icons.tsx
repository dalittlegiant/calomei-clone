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

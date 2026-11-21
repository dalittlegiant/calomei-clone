// 共用動效規範 — 唯一真相來源（見 DESIGN.md §Motion）。
// iOS 克制原則（impeccable animate / polish）：
// - 只准驅動 GPU 屬性：transform、opacity、SVG stroke-dashoffset。
//   絕不動畫化 backdrop-filter、width、height、box-shadow。
// - 轉場俐落：180–350ms 為主，圓環 400ms；無 bounce、無 elastic。
// - ease-out 為預設曲線；Sheet 用 iOS spring 物理。
// - <MotionConfig reducedMotion="user"> 包住根元件，系統「減少動態」
//   開咗就自動變即時／淡入。
import type { Transition } from 'motion/react'

/** iOS 底部 Sheet 滑上／滑落（Kong 指定參數）。 */
export const springSheet: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 34,
}

/** 滑動膠囊（日期／導航／切換掣）— 快而無過衝。 */
export const springPill: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 40,
}

/** 預設 ease-out（expo）— 淡入／滑入用。 */
export const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** 標準時長（秒）。 */
export const DUR = {
  /** 按鈕／膠囊／淡入淡出 */
  quick: 0.2,
  /** 頁面／列表過渡 */
  slide: 0.25,
  /** 數字滾動 */
  number: 0.25,
  /** 圓環進度 */
  ring: 0.4,
  /** 水樽填滿 */
  fill: 0.35,
} as const

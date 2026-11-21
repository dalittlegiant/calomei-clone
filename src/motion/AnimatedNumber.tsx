// 輕量數字滾動 — 主要數字（例如 仲剩 kcal）變化時平滑滾向新值，約 250ms。
// 用 motion value + animate()，只改文字，唔郁 layout。
import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'

/** 整數（預設）：555 → 1110 滾過去。 */
export const fmtInt = (v: number): string => String(Math.round(v))

/** 1 位小數：24.5（MiniRing 營養數值用）。 */
export const fmt1dp = (v: number): string =>
  String(Math.round(v * 10) / 10)

export function AnimatedNumber({
  value,
  format = fmtInt,
  className,
}: {
  value: number
  format?: (v: number) => string
  className?: string
}) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.25, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, mv])
  return <motion.span className={className}>{text}</motion.span>
}

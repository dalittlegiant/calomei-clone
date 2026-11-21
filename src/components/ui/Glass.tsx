// Shared glass primitives — every new screen reuses these (see DESIGN.md).
// Pure CSS Liquid Glass; no SVG feDisplacementMap anywhere.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DUR, easeOutExpo, springSheet } from '../../motion/presets'

type DivProps = HTMLAttributes<HTMLDivElement>
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

function cx(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Main frosted-glass card (`.glass-card`). */
export function GlassCard({ className, ...rest }: DivProps) {
  return <div className={cx('glass-card', className)} {...rest} />
}

/** Smaller nested glass card (`.glass-subcard`). */
export function GlassSubcard({ className, ...rest }: DivProps) {
  return <div className={cx('glass-subcard', className)} {...rest} />
}

/** Tinted-glass CTA button. `amber` = core action, `teal` = exercise/water,
 *  `glass` = quiet secondary action. Radius comes from the caller. */
export function GlassButton({
  variant = 'amber',
  className,
  ...rest
}: ButtonProps & { variant?: 'amber' | 'teal' | 'glass' }) {
  const variantClass =
    variant === 'amber'
      ? 'glass-cta-amber text-white'
      : variant === 'teal'
        ? 'glass-cta-teal text-white'
        : 'glass-subcard text-white'
  return (
    <button
      type="button"
      className={cx(variantClass, 'font-bold disabled:opacity-40', className)}
      {...rest}
    />
  )
}

/** Overlay shell for modals and the bottom add sheet.
 *  `sheet` = bottom-anchored panel (mobile) / centred on desktop;
 *  `dialog` = centred card. Backdrop click closes.
 *  Motion: AnimatePresence lives inside here, so every caller gets the
 *  enter/exit animation for free — backdrop fades (200ms), sheet slides
 *  up/down on the iOS spring (stiffness 380, damping 34), dialog fades
 *  in from scale 0.96. Nothing disappears abruptly on close. */
export function GlassModal({
  open,
  onClose,
  variant = 'sheet',
  children,
}: {
  open: boolean
  onClose: () => void
  variant?: 'sheet' | 'dialog'
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <div
          key="modal"
          className={`fixed inset-0 z-50 flex justify-center ${
            variant === 'sheet'
              ? 'items-end md:items-center'
              : 'items-center p-4'
          }`}
        >
          <motion.button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.quick, ease: easeOutExpo }}
          />
          {variant === 'sheet' ? (
            <motion.div
              className="glass-sheet no-scrollbar relative max-h-[85dvh] w-full max-w-lg overflow-y-auto p-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springSheet}
            >
              {children}
            </motion.div>
          ) : (
            <motion.div
              className="glass-card relative max-h-[85dvh] w-full max-w-lg overflow-y-auto p-4"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: DUR.quick, ease: easeOutExpo }}
            >
              {children}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  )
}

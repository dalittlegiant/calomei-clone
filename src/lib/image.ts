// Photo compression — exactly the original app's pipeline (u7/n0.smali,
// method a([B)[B): decode the image, scale it down proportionally so the
// longest side is 1024px (only when it is larger), JPEG quality 70, then
// Base64 with NO_WRAP (no line breaks).

export interface CompressedImage {
  /** data:image/jpeg;base64,... */
  dataUrl: string
  /** Raw base64 without the data: prefix (what goes into image_base64). */
  base64: string
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

const MAX_SIDE = 1024
const JPEG_QUALITY = 0.7

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const originalBytes = file.size
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('JPEG encoding failed')

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsDataURL(blob)
  })
  const base64 = dataUrl.split(',')[1] ?? ''
  return {
    dataUrl,
    base64,
    width,
    height,
    originalBytes,
    compressedBytes: blob.size,
  }
}

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

/** Conventional meal windows (VISION_API_DESIGN.md §6). */
export function inferMealType(date = new Date()): MealType {
  const h = date.getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  return 'dinner'
}

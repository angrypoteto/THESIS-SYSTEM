// Browser-side file preparation before upload (Build Plan 12.5: shrink photos to ~300 KB
// so the 1 GB free storage holds ~800 applicants).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const MAX_SIDE = 1800 // px; keeps certificate text readable for OCR
const TARGET_BYTES = 350 * 1024

/** Re-encode photos as JPEG, longest side <= 1800 px, lowering quality until ~350 KB. PDFs pass through. */
export async function prepareUpload(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG, WEBP photo or a PDF.')
  if (file.type === 'application/pdf') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('PDF is larger than 10 MB.')
    return file
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let quality = 0.85
  let blob = await toJpeg(canvas, quality)
  while (blob.size > TARGET_BYTES && quality > 0.5) {
    quality -= 0.1
    blob = await toJpeg(canvas, quality)
  }
  return blob
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality),
  )
}

/** SHA-256 of the uploaded bytes: used to spot the same image reused across applicants (Plan 8.3 layer 3). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

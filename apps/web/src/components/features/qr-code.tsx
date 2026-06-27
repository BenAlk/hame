import { useMemo } from 'react'
import { encodeQr } from '@/lib/qr/qr-encode'
import { cn } from '@/lib/utils'

interface QrCodeProps {
  /** The text to encode (e.g. a WiFi join payload). */
  value: string
  /** Modules of quiet zone around the code — the spec minimum is 4. */
  quietZone?: number
  className?: string
  /** Accessible label for the image. */
  title?: string
}

/**
 * Render a QR code as crisp, scalable SVG from our in-tree encoder
 * ({@link encodeQr}). Pure black on white for reliable scanning, regardless of
 * the surrounding theme; the caller sizes it via `className`.
 */
export function QrCode({ value, quietZone = 4, className, title }: QrCodeProps) {
  const { path, dim } = useMemo(() => {
    const modules = encodeQr(value)
    const size = modules.length
    const dim = size + quietZone * 2
    // One SVG path of 1×1 squares for every dark module — far fewer DOM nodes
    // than a <rect> each.
    let path = ''
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) path += `M${c + quietZone} ${r + quietZone}h1v1h-1z`
      }
    }
    return { path, dim }
  }, [value, quietZone])

  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      className={cn('block', className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? 'QR code'}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

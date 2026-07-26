/**
 * Barcode decoding via the browser's native `BarcodeDetector` (spec §10 Phase 14).
 *
 * No decoding library is bundled: `BarcodeDetector` is built into Chrome on
 * Android, which is what this feature is for, and a wasm decoder would cost
 * every user bundle weight to serve browsers that mostly can't grant camera
 * access anyway. Support is feature-detected and the UI falls back to typing a
 * code by hand, so an unsupported browser (notably iOS Safari) degrades rather
 * than showing a dead button.
 */

/** The retail formats worth decoding — everything a UK grocery item carries. */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: readonly string[] }): BarcodeDetectorLike
}

function getConstructor(): BarcodeDetectorConstructor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

/** True when this browser can decode barcodes *and* reach a camera. */
export function isScanningSupported(): boolean {
  return getConstructor() !== null && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function createDetector(): BarcodeDetectorLike | null {
  const Ctor = getConstructor()
  return Ctor ? new Ctor({ formats: BARCODE_FORMATS }) : null
}

/**
 * How long the same code is ignored after being accepted. The camera reports a
 * held-still barcode many times a second, which would otherwise pile up dozens
 * of rows — but scanning the same product twice on purpose *should* make two
 * entries (two jars, two expiry dates, spec §8.4), so this is a short cooldown
 * rather than a set of codes already seen.
 */
export const RESCAN_COOLDOWN_MS = 2500

/**
 * Whether a freshly decoded code should be accepted, given the last one taken.
 * Pure, so the debounce is testable without a camera.
 */
export function shouldAcceptScan(
  code: string,
  last: { code: string; at: number } | null,
  now: number,
): boolean {
  if (!last || last.code !== code) return true
  return now - last.at >= RESCAN_COOLDOWN_MS
}

/** Ask for the rear-facing camera; the caller owns stopping the tracks. */
export function requestCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

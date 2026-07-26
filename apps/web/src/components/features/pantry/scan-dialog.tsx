import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useResolveBarcode, useLinkBarcode } from '@/api/barcodes'
import { useCreatePantryEntries } from '@/api/pantry'
import { useItems } from '@/api/items'
import { useStorageLocations } from '@/api/storage-locations'
import {
  createDetector,
  isScanningSupported,
  requestCameraStream,
  shouldAcceptScan,
  stopStream,
} from '@/lib/barcode-scanner'
import {
  isRowComplete,
  rowFromResolution,
  toBarcodeLinks,
  toPantryEntries,
  type ScannedRow,
} from '@/lib/scan-batch'

const DETECT_INTERVAL_MS = 250

interface ScanDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Batch-scan the shopping into the pantry (spec §10 Phase 14): scan freely, then
 * review every row once — location set for the batch, expiry per row — and
 * commit in a single transaction. Deliberately not a dialog per scan: twenty
 * items should not be twenty interruptions while your hands are full.
 */
export function ScanDialog({ open, onClose }: ScanDialogProps) {
  const { data: locations } = useStorageLocations()
  const resolve = useResolveBarcode()
  const linkBarcode = useLinkBarcode()
  const stock = useCreatePantryEntries()

  const [rows, setRows] = useState<ScannedRow[]>([])
  const [locationId, setLocationId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lookupOff, setLookupOff] = useState(false)

  const resolvedLocation = locationId || locations?.[0]?.id || ''
  const completeRows = rows.filter(isRowComplete)

  const addScan = useCallback(
    async (code: string) => {
      setError(null)
      try {
        const resolution = await resolve.mutateAsync(code)
        if (!resolution.lookupEnabled) setLookupOff(true)
        setRows((current) => [
          ...current,
          rowFromResolution(resolution, `${code}-${Date.now()}-${current.length}`),
        ])
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not look that barcode up.')
      }
    },
    [resolve],
  )

  function updateRow(key: string, patch: Partial<ScannedRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((r) => r.key !== key))
  }

  function reset() {
    setRows([])
    setError(null)
    onClose()
  }

  async function onCommit() {
    if (!resolvedLocation || completeRows.length === 0) return
    setError(null)
    try {
      // Teach the codes first, so a failure here doesn't leave stock recorded
      // against barcodes the household still doesn't recognise.
      for (const link of toBarcodeLinks(rows)) {
        await linkBarcode.mutateAsync(link)
      }
      await stock.mutateAsync({ entries: toPantryEntries(rows, resolvedLocation) })
      reset()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stock those items.')
    }
  }

  const pending = stock.isPending || linkBarcode.isPending

  return (
    <Modal open={open} onClose={reset} title="Scan shopping in" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <ScannerPanel active={open} onScan={(code) => void addScan(code)} />

        {lookupOff && (
          <p className="text-xs text-muted-foreground">
            Barcode lookup is off, so unknown codes need naming by hand. Turn it on under Settings →
            Pantry.
          </p>
        )}

        {locations && locations.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scan-location">Stock into</Label>
            <select
              id="scan-location"
              value={resolvedLocation}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-warning">Add a storage location before scanning stock in.</p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing scanned yet. Point the camera at a barcode, or type one in above.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <ScannedRowEditor
                key={row.key}
                row={row}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
              />
            ))}
          </div>
        )}

        {error && <p className="text-sm text-warning">{error}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-muted-foreground">
            {completeRows.length} of {rows.length} ready
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button
              onClick={() => void onCommit()}
              disabled={pending || completeRows.length === 0 || !resolvedLocation}
            >
              {pending ? 'Stocking…' : `Stock ${completeRows.length}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * The camera half. Support is feature-detected rather than assumed, and manual
 * entry is always present — on a browser without `BarcodeDetector` (iOS Safari)
 * it is the whole feature rather than a dead end.
 */
function ScannerPanel({ active, onScan }: { active: boolean; onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastScan = useRef<{ code: string; at: number } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const supported = isScanningSupported()

  // Held in a ref so the camera effect doesn't depend on the callback's
  // identity: every accepted scan re-renders the parent with a new one, and a
  // dependency on it would tear the stream down and restart the camera
  // mid-session — once per scan.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!active || !scanning) return
    let stream: MediaStream | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    async function start() {
      try {
        stream = await requestCameraStream()
        if (cancelled) return stopStream(stream)
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const detector = createDetector()
        if (!detector) return
        interval = setInterval(() => {
          void (async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return
            try {
              const found = await detector.detect(videoRef.current)
              const code = found[0]?.rawValue
              if (!code) return
              const now = Date.now()
              if (!shouldAcceptScan(code, lastScan.current, now)) return
              lastScan.current = { code, at: now }
              onScanRef.current(code)
            } catch {
              // A dropped frame is not worth surfacing; the next tick retries.
            }
          })()
        }, DETECT_INTERVAL_MS)
      } catch {
        setCameraError('Could not open the camera. Check permissions, or type the code in.')
        setScanning(false)
      }
    }
    void start()

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      stopStream(stream)
    }
  }, [active, scanning])

  function submitManual(e: React.FormEvent) {
    e.preventDefault()
    const code = manual.trim()
    if (!/^\d{8,14}$/.test(code)) return
    onScan(code)
    setManual('')
  }

  return (
    <div className="flex flex-col gap-3">
      {supported && (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={scanning ? 'outline' : 'default'}
              size="sm"
              onClick={() => setScanning((s) => !s)}
            >
              {scanning ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {scanning ? 'Stop camera' : 'Start camera'}
            </Button>
          </div>
          {scanning && (
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full rounded-inner border border-line bg-black object-cover"
            />
          )}
        </>
      )}

      {!supported && (
        <p className="text-xs text-muted-foreground">
          This browser can't decode barcodes, so codes are typed in. Camera scanning works in Chrome
          on Android.
        </p>
      )}

      {cameraError && <p className="text-sm text-warning">{cameraError}</p>}

      <form onSubmit={submitManual} className="flex gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type a barcode…"
          inputMode="numeric"
          aria-label="Barcode"
          className="min-w-0"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Add
        </Button>
      </form>
    </div>
  )
}

/** One review row: what it is, how much, and the use-by date a barcode can't know. */
function ScannedRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: ScannedRow
  onChange: (patch: Partial<ScannedRow>) => void
  onRemove: () => void
}) {
  const { data: items } = useItems()
  const listId = `scan-items-${row.key}`

  return (
    <div className="flex flex-wrap items-end gap-2 py-3">
      <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
        <Label htmlFor={`item-${row.key}`}>
          Item
          {!row.linked && row.label && (
            <span className="ml-2 font-normal text-muted-foreground">from {row.label}</span>
          )}
        </Label>
        <Input
          id={`item-${row.key}`}
          value={row.itemName}
          list={listId}
          placeholder="Name this product"
          onChange={(e) => {
            // Typing an existing item's name matches it rather than minting a
            // duplicate — keeping Item generic is what protects recipe linking
            // and the low-stock maths.
            const name = e.target.value
            const match = items?.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())
            onChange({ itemName: name, itemId: match?.id ?? null, linked: false })
          }}
        />
        <datalist id={listId}>
          {items?.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
      </div>

      <div className="flex w-20 flex-col gap-1.5">
        <Label htmlFor={`qty-${row.key}`}>Qty</Label>
        <Input
          id={`qty-${row.key}`}
          type="number"
          min="0"
          step="any"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) })}
        />
      </div>

      <div className="flex w-20 flex-col gap-1.5">
        <Label htmlFor={`unit-${row.key}`}>Unit</Label>
        <Input
          id={`unit-${row.key}`}
          value={row.unit ?? ''}
          placeholder="g, ml…"
          onChange={(e) => onChange({ unit: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`expiry-${row.key}`}>Expiry</Label>
        <Input
          id={`expiry-${row.key}`}
          type="date"
          value={row.expiry}
          onChange={(e) => onChange({ expiry: e.target.value })}
          className="w-40"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.itemName || row.code}`}
        className="mb-1 rounded-control p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

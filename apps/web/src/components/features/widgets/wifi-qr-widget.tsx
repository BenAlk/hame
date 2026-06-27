import { buildWifiQrPayload } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { QrCode } from '@/components/features/qr-code'
import { useWifiConfig } from '@/api/wifi'

/**
 * A scan-to-join WiFi QR code (spec §8.12, §10 Phase 7.2). Renders only when an
 * admin has set up and enabled a network *and* the viewer is on the local
 * network (spec §11) — the dashboard gates it the same way, so it's never
 * offered, shown or left blank otherwise.
 */
export function WifiQrWidget() {
  const { data: wifi } = useWifiConfig()
  if (!wifi || !wifi.configured || !wifi.isActive || !wifi.isLocalClient) return null

  const payload = buildWifiQrPayload(wifi)

  return (
    <WidgetCard title="WiFi">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-card bg-white p-3">
          <QrCode value={payload} className="size-40" title={`Join the ${wifi.ssid} network`} />
        </div>
        <div className="text-center">
          <p className="font-serif text-lg text-ink">{wifi.ssid}</p>
          <p className="text-xs text-muted-foreground">Scan with your camera to join</p>
        </div>
      </div>
    </WidgetCard>
  )
}

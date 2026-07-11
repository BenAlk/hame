import { useSearchParams } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { caldavCollectionUrl, davx5SetupUrl } from '@/lib/caldav'

/**
 * Public landing page a phone reaches by scanning the CalDAV QR (an `https` link,
 * so any camera opens it). It offers a one-tap deep link into DAVx5 — the camera
 * itself can't launch a `davx5://` scheme, but a browser can once the user taps.
 * Carries no secret: just the server origin and the member's username; the app
 * password is still entered by hand in DAVx5.
 */
export function CalDavSetupPage() {
  const [params] = useSearchParams()
  const username = params.get('u') ?? ''
  const serverUrl = window.location.origin
  const deepLink = username ? davx5SetupUrl(serverUrl, username) : null
  // The direct collection URL — the value to type into DAVx5's "Login with URL"
  // if the deep link doesn't fire.
  const collectionUrl = caldavCollectionUrl(serverUrl)

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-card border border-line bg-card p-6 text-ink">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-2xl font-medium">Add to DAVx5</h1>
          <p className="text-sm text-muted-foreground">
            This opens DAVx5 with your Hame calendar server and username filled in. Then enter the
            app password you generated in Hame.
          </p>
        </div>

        {deepLink ? (
          <a href={deepLink} className={buttonVariants({ className: 'w-full' })}>
            Open in DAVx5
          </a>
        ) : (
          <p className="text-sm text-warning">
            This link is missing its username. Re-open the QR code from Hame.
          </p>
        )}

        <div className="flex flex-col gap-1 rounded-control border border-line bg-bg p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            No DAVx5, or the button did nothing? Install DAVx5, then add an account by hand with:
          </p>
          <span className="mt-1 text-muted-foreground">Server URL</span>
          <code className="break-all font-mono">{collectionUrl}</code>
          {username && (
            <>
              <span className="mt-1 text-muted-foreground">Username</span>
              <code className="font-mono">{username}</code>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { version as currentVersion } from '../package.json'
import { PLAY_STORE_URL, checkForUpdate, isNativeApp } from '../lib/appUpdate.js'

/* A newer published release is available.
 *
 * Web listeners reload into the new deploy; the Android build cannot reload
 * itself into a new APK, so it sends them to the store listing instead. LATER
 * hides the strip until the next launch — the player never blocks playback for
 * an update. */
function UpdateNotice() {
  const [latest, setLatest] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const native = isNativeApp()

  useEffect(() => {
    let live = true
    checkForUpdate({ current: currentVersion }).then((next) => {
      if (live) setLatest(next)
    })
    return () => {
      live = false
    }
  }, [])

  if (!latest || dismissed) return null

  return (
    <div className="update-notice" role="status" aria-live="polite">
      <span className="update-notice-text">
        <span className="update-notice-key">New version</span>
        <span className="update-notice-versions">
          v{latest} · you have v{currentVersion}
        </span>
      </span>
      <span className="update-notice-actions">
        {native ? (
          <a
            className="update-notice-btn update-notice-btn--primary"
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Play Store
          </a>
        ) : (
          <button
            type="button"
            className="update-notice-btn update-notice-btn--primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        )}
        <button
          type="button"
          className="update-notice-btn"
          onClick={() => setDismissed(true)}
        >
          Later
        </button>
      </span>
    </div>
  )
}

export default UpdateNotice

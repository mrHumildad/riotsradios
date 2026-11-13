// Metallic finish for one element, driven by metallicss@4.0.3.
//
// The package's own boot only scans `.metallicss` elements present at
// DOMContentLoaded — React mounts after that — and its auto-init also writes
// inline colour, text-shadow and box-shadow onto the host, which would
// override this app's amber type. So the exported renderer is called per
// surface instead, and re-run when the box changes: 4.0.3 attaches its resize
// observer only on the auto-init path.
//
// CSS owns the look (--metal, --convexity). Only those two properties exist in
// 4.0.3; the angle/intensity/resolution controls in the lab are 5.0.0.

import { useEffect } from 'react'
import { metallicss } from 'metallicss'

/* Re-render this long after the last resize, so a drag does not queue a
   render per frame. */
const RESIZE_SETTLE_MS = 150

export function useMetalSurface(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    let timer = null
    const draw = () => {
      timer = null
      /* Skips its own work when the element has no box yet. */
      metallicss(el)
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(draw, RESIZE_SETTLE_MS)
    }

    draw()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(el)

    return () => {
      if (timer) clearTimeout(timer)
      observer?.disconnect()
      el.querySelector(':scope > canvas.metal')?.remove()
    }
  }, [ref])
}

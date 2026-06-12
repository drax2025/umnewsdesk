import * as React from "react"

const MOBILE_BREAKPOINT = 768

// matchMedia-backed subscription so useSyncExternalStore drives the value
// without firing setState inside an effect.
function getServerSnapshot(): boolean {
  return false
}

function subscribe(notify: () => void) {
  if (typeof window === "undefined") return () => {}
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", notify)
  return () => mql.removeEventListener("change", notify)
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

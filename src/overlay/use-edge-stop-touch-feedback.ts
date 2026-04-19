import { useEffect, useRef, useState } from "react"

import type { EdgeStopFeedback } from "@/config/runtime"
import { getAutoClickerStatus } from "@/lib/auto-clicker"
import { isTauri } from "@/lib/tauri"

const EDGE_STOP_STATUS_POLL_MS = 60
const EDGE_STOP_BLOOM_MS = 720

export function useEdgeStopTouchFeedback(enabled: boolean) {
  const [feedback, setFeedback] = useState<EdgeStopFeedback | null>(null)
  const feedbackIdRef = useRef<number | null>(null)
  const clearTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current !== null) {
        window.clearTimeout(clearTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled || !isTauri()) {
      setFeedback(null)
      if (clearTimeoutRef.current !== null) {
        window.clearTimeout(clearTimeoutRef.current)
        clearTimeoutRef.current = null
      }
      return undefined
    }

    let cancelled = false
    let timeoutId: number | null = null

    async function pollStatus() {
      try {
        const status = await getAutoClickerStatus()
        if (cancelled) {
          return
        }

        const nextFeedback = status.edgeStopFeedback
        if (
          nextFeedback !== null &&
          nextFeedback.id !== feedbackIdRef.current
        ) {
          feedbackIdRef.current = nextFeedback.id
          setFeedback(nextFeedback)

          if (clearTimeoutRef.current !== null) {
            window.clearTimeout(clearTimeoutRef.current)
          }

          clearTimeoutRef.current = window.setTimeout(() => {
            clearTimeoutRef.current = null
            setFeedback((current) =>
              current?.id === nextFeedback.id ? null : current,
            )
          }, EDGE_STOP_BLOOM_MS)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to poll auto clicker status", error)
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void pollStatus()
          }, EDGE_STOP_STATUS_POLL_MS)
        }
      }
    }

    void pollStatus()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (clearTimeoutRef.current !== null) {
        window.clearTimeout(clearTimeoutRef.current)
        clearTimeoutRef.current = null
      }
      setFeedback(null)
    }
  }, [enabled])

  return feedback
}

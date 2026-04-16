"use client"

import { useEffect } from "react"

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}

function shouldBlockShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const hasModifier = event.ctrlKey || event.metaKey

  if (event.key === "F5") {
    return true
  }

  if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    return true
  }

  if (!hasModifier) {
    return false
  }

  return key === "r" || key === "p" || key === "s"
}

export function DesktopAppGuard() {
  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      event.preventDefault()
    }

    function handleSelectStart(event: Event) {
      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
    }

    function handleDragStart(event: DragEvent) {
      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return
      }

      if (!shouldBlockShortcut(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("selectstart", handleSelectStart)
    document.addEventListener("dragstart", handleDragStart)
    window.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("selectstart", handleSelectStart)
      document.removeEventListener("dragstart", handleDragStart)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [])

  return null
}

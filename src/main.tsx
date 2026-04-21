import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { UniversalOverlayApp } from "@/overlay";
import { isLinuxDesktop } from "@/lib/browser";
import { isTauri, trackedInvoke } from "@/lib/tauri";
import { ThemeProvider } from "@tauri-ui/components/theme-provider.tsx";
import { DesktopAppGuard } from "@tauri-ui/components/desktop-app-guard.tsx";
import { ExternalLinkGuard } from "@tauri-ui/components/external-link-guard.tsx";

const LINUX_MAIN_WINDOW_READY_FALLBACK_MS = 450;

function isClickPositionOverlayWindow() {
  if (typeof window === "undefined") {
    return false;
  }

  if (isTauri()) {
    try {
      return getCurrentWebviewWindow().label === "click-position-overlay";
    } catch (error) {
      console.warn("Unable to read current webview label", error);
    }
  }

  const url = new URL(window.location.href);
  return (
    url.pathname.endsWith("/overlay.html") ||
    url.pathname.endsWith("\\overlay.html") ||
    url.searchParams.get("overlay") === "click-position"
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey={null}>
      {isClickPositionOverlayWindow() ? (
        <UniversalOverlayApp />
      ) : (
        <AppErrorBoundary>
          <DesktopAppGuard />
          <ExternalLinkGuard />
          <main data-ui-scroll-container>
            <App />
          </main>
        </AppErrorBoundary>
      )}
    </ThemeProvider>
  </StrictMode>,
);

if (isTauri()) {
  const notifyReady = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isClickPositionOverlayWindow()) {
          void trackedInvoke<void>("notify_webview_ready").catch((error) => {
            console.error("Unable to show ready webview", error);
          });
          return;
        }

        if (!isLinuxDesktop()) {
          return;
        }

        window.setTimeout(() => {
          void trackedInvoke<void>("notify_webview_ready").catch((error) => {
            console.error("Unable to show ready webview", error);
          });
        }, LINUX_MAIN_WINDOW_READY_FALLBACK_MS);
      });
    });
  };

  if (document.readyState === "complete") {
    notifyReady();
  } else {
    window.addEventListener("load", notifyReady, { once: true });
  }
}

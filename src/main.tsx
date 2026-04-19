import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import "./index.css";
import App from "./App.tsx";
import { UniversalOverlayApp } from "@/overlay";
import { isTauri, trackedInvoke } from "@/lib/tauri";
import { ThemeProvider } from "@tauri-ui/components/theme-provider.tsx";
import { DesktopAppGuard } from "@tauri-ui/components/desktop-app-guard.tsx";
import { ExternalLinkGuard } from "@tauri-ui/components/external-link-guard.tsx";

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
        <>
          <DesktopAppGuard />
          <ExternalLinkGuard />
          <main data-ui-scroll-container>
            <App />
          </main>
        </>
      )}
    </ThemeProvider>
  </StrictMode>,
);

if (isTauri()) {
  const notifyReady = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isClickPositionOverlayWindow()) {
          return;
        }

        void trackedInvoke<void>("notify_webview_ready").catch((error) => {
          console.error("Unable to show ready webview", error);
        });
      });
    });
  };

  if (document.readyState === "complete") {
    notifyReady();
  } else {
    window.addEventListener("load", notifyReady, { once: true });
  }
}

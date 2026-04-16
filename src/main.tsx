import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@tauri-ui/components/theme-provider.tsx"
import { DesktopAppGuard } from "@tauri-ui/components/desktop-app-guard.tsx"
import { ExternalLinkGuard } from "@tauri-ui/components/external-link-guard.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <DesktopAppGuard />
      <ExternalLinkGuard />
      <main data-ui-scroll-container><App /></main>
    </ThemeProvider>
  </StrictMode>
)

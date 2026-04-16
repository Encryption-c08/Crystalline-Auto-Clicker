import path from "path"
import { createRequire } from "module"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const frontendRoot = __dirname
const repoRoot = path.resolve(frontendRoot, "..")
const sourceRoot = path.resolve(repoRoot, "src")
const tauriUiRoot = path.resolve(frontendRoot, "tauri-ui")
const resolveFromFrontendRoot = createRequire(path.resolve(frontendRoot, "package.json"))

function resolveFromFrontendPackage(id: string) {
  if (
    id.startsWith(".") ||
    path.isAbsolute(id) ||
    id.startsWith("\0") ||
    id.startsWith("@/") ||
    id.startsWith("@tauri-ui/")
  ) {
    return null
  }

  try {
    return resolveFromFrontendRoot.resolve(id)
  } catch {
    return null
  }
}

// https://vite.dev/config/
export default defineConfig({
  root: frontendRoot,
  publicDir: false,
  cacheDir: path.resolve(frontendRoot, "node_modules/.vite"),
  plugins: [
    {
      name: "resolve-external-source-deps",
      enforce: "pre",
      resolveId(id) {
        return resolveFromFrontendPackage(id)
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": sourceRoot,
      "@tauri-ui": tauriUiRoot,
    },
  },
  build: {
    outDir: path.resolve(frontendRoot, "dist"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [frontendRoot, repoRoot],
    },
    port: 1420,
    strictPort: true,
  },
})

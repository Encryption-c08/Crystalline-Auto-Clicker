function isOverlayWindow() {
  const url = new URL(window.location.href);

  return (
    url.pathname.endsWith("/overlay.html") ||
    url.pathname.endsWith("\\overlay.html") ||
    url.searchParams.get("overlay") === "click-position"
  );
}

document.documentElement.style.margin = "0";
document.body.style.margin = "0";

if (isOverlayWindow()) {
  document.documentElement.dataset.overlayWindow = "click-position";
} else {
  document.documentElement.style.background = "#111111";
  document.documentElement.style.colorScheme = "dark";
  document.body.style.background = "#111111";
  const root = document.getElementById("root");
  if (root) {
    root.style.background = "#111111";
  }
}

import "../src/main.tsx";

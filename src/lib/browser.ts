export function getSafeStorageItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSafeStorageItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some Linux WebKit environments can deny storage access during startup.
  }
}

export function listenToMediaQuery(
  mediaQuery: MediaQueryList,
  listener: () => void,
) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

export function isLinuxDesktop() {
  return typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent);
}

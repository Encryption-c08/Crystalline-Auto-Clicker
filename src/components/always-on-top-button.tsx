import { useEffect, useState } from "react";

import { PinIcon, PinOffIcon } from "lucide-react";

import {
  isMainWindowAlwaysOnTop,
  setMainWindowAlwaysOnTop,
} from "@/lib/main-window";
import { isTauri } from "@/lib/tauri";
import { cn } from "@tauri-ui/lib/utils";

export function AlwaysOnTopButton({
  windowOpacity,
}: {
  windowOpacity: number;
}) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setHasLoadedState(true);
      return;
    }

    let cancelled = false;

    void isMainWindowAlwaysOnTop()
      .then((value) => {
        if (!cancelled) {
          setAlwaysOnTop(value);
        }
      })
      .catch((error) => {
        console.error("Unable to read always-on-top state", error);
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedState(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleAlwaysOnTop() {
    if (!isTauri() || !hasLoadedState || isUpdating) {
      return;
    }

    const nextAlwaysOnTop = !alwaysOnTop;
    setIsUpdating(true);

    try {
      await setMainWindowAlwaysOnTop(nextAlwaysOnTop, windowOpacity);
      setAlwaysOnTop(nextAlwaysOnTop);
    } catch (error) {
      console.error("Unable to update always-on-top state", error);
    } finally {
      setIsUpdating(false);
    }
  }

  const Icon = alwaysOnTop ? PinIcon : PinOffIcon;

  return (
    <button
      aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
      aria-pressed={alwaysOnTop}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
        alwaysOnTop
          ? "border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/18"
          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background/85 hover:text-foreground",
        (!hasLoadedState || isUpdating) && "opacity-70",
      )}
      data-window-control
      disabled={!hasLoadedState || isUpdating}
      onClick={() => void toggleAlwaysOnTop()}
      type="button"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

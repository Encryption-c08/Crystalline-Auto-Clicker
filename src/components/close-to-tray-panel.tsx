import type { Dispatch, SetStateAction } from "react";

import type { AutoClickerSettings } from "@/config/settings";
import { Checkbox } from "@tauri-ui/components/ui/checkbox";

type CloseToTrayPanelProps = {
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function CloseToTrayPanel({
  settings,
  setSettings,
}: CloseToTrayPanelProps) {
  return (
    <label className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/35 px-3 py-2 transition-colors hover:bg-card/45">
      <div className="min-w-0 pr-2">
        <p className="text-base font-semibold text-foreground">Close to Tray</p>
        <p className="text-sm text-muted-foreground">
          Hide the app to the system tray when it is minimized.
        </p>
      </div>

      <Checkbox
        aria-label="Enable close to tray"
        checked={settings.closeToTray}
        className="shrink-0"
        onCheckedChange={(checked) => {
          setSettings((current) => ({
            ...current,
            closeToTray: checked === true,
          }));
        }}
      />
    </label>
  );
}

import type {
  ClickPosition,
  ClickPositionNonIntrusiveTarget,
} from "@/config/settings";

import { isTauri, trackedInvoke } from "@/lib/tauri";

export type PickNonIntrusiveClickPositionTargetResult = {
  positions: ClickPosition[];
  target: ClickPositionNonIntrusiveTarget;
};

export async function pickClickPositionNonIntrusiveTargetFromClick(
  positions: ClickPosition[],
) {
  if (!isTauri()) {
    return null;
  }

  return trackedInvoke<PickNonIntrusiveClickPositionTargetResult | null>(
    "pick_click_position_non_intrusive_target_from_click",
    {
      positions,
    },
  );
}

export async function mapClickPositionsToNonIntrusivePositions(
  target: ClickPositionNonIntrusiveTarget,
  positions: ClickPosition[],
) {
  if (!isTauri()) {
    return [];
  }

  return trackedInvoke<ClickPosition[]>(
    "map_click_positions_to_non_intrusive_positions",
    {
      positions,
      target,
    },
  );
}

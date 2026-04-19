import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { ChevronDownIcon } from "lucide-react";

import {
  hexToRgb,
  hsvToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsv,
  tryNormalizeHexColor,
} from "@/lib/color";
import { Input } from "@tauri-ui/components/ui/input";
import { cn } from "@tauri-ui/lib/utils";

const PICKER_SIZE = 172;
const HUE_SLIDER_HEIGHT = 14;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type CustomColorPickerProps = {
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  value: string;
};

type PickerLayout = {
  left: number;
  top: number;
};

const PICKER_GAP = 8;
const VIEWPORT_PADDING = 12;

export function CustomColorPicker({
  onChange,
  onOpenChange,
  value,
}: CustomColorPickerProps) {
  const pickerId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const normalizedValue = normalizeHexColor(value);
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<PickerLayout | null>(null);
  const [hexInput, setHexInput] = useState(normalizedValue.slice(1));
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(normalizedValue)));

  useEffect(() => {
    const nextHsv = rgbToHsv(hexToRgb(normalizedValue));
    setHsv(nextHsv);
    setHexInput(normalizedValue.slice(1));
  }, [normalizedValue]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setLayout(null);
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const targetNode = event.target as Node;
      if (
        containerRef.current?.contains(targetNode) ||
        popoverRef.current?.contains(targetNode)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) {
      return undefined;
    }

    function updateLayout() {
      if (!triggerRef.current || !popoverRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const availableRight =
        window.innerWidth - VIEWPORT_PADDING - popoverRect.width;
      const alignedLeft = Math.min(
        triggerRect.left,
        triggerRect.right - popoverRect.width,
      );
      const left = clampNumber(
        triggerRect.left <= availableRight ? triggerRect.left : alignedLeft,
        VIEWPORT_PADDING,
        Math.max(VIEWPORT_PADDING, availableRight),
      );
      const belowTop = triggerRect.bottom + PICKER_GAP;
      const aboveTop = triggerRect.top - popoverRect.height - PICKER_GAP;
      const fitsBelow =
        belowTop + popoverRect.height <= window.innerHeight - VIEWPORT_PADDING;
      const fitsAbove = aboveTop >= VIEWPORT_PADDING;
      const top = fitsBelow
        ? belowTop
        : fitsAbove
          ? aboveTop
          : clampNumber(
              belowTop,
              VIEWPORT_PADDING,
              Math.max(
                VIEWPORT_PADDING,
                window.innerHeight - VIEWPORT_PADDING - popoverRect.height,
              ),
            );

      setLayout((current) =>
        current?.left === left && current?.top === top
          ? current
          : { left, top },
      );
    }

    updateLayout();

    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [isOpen]);

  function commitColor(nextHsv: typeof hsv) {
    const nextHex = rgbToHex(hsvToRgb(nextHsv));
    setHsv(nextHsv);
    setHexInput(nextHex.slice(1));
    onChange(nextHex);
  }

  function updateSaturationValue(clientX: number, clientY: number) {
    if (!saturationRef.current) {
      return;
    }

    const bounds = saturationRef.current.getBoundingClientRect();
    const saturation = clampNumber(
      (clientX - bounds.left) / bounds.width,
      0,
      1,
    );
    const valueLevel =
      1 - clampNumber((clientY - bounds.top) / bounds.height, 0, 1);

    commitColor({
      h: hsv.h,
      s: saturation,
      v: valueLevel,
    });
  }

  function updateHue(clientX: number) {
    if (!hueRef.current) {
      return;
    }

    const bounds = hueRef.current.getBoundingClientRect();
    const hue = clampNumber((clientX - bounds.left) / bounds.width, 0, 1) * 360;

    commitColor({
      h: hue,
      s: hsv.s,
      v: hsv.v,
    });
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    handler: (clientX: number, clientY: number) => void,
  ) {
    event.preventDefault();
    handler(event.clientX, event.clientY);

    function handlePointerMove(moveEvent: PointerEvent) {
      handler(moveEvent.clientX, moveEvent.clientY);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const saturationCursorLeft = `${hsv.s * 100}%`;
  const saturationCursorTop = `${(1 - hsv.v) * 100}%`;
  const hueCursorLeft = `${(hsv.h / 360) * 100}%`;
  const pickerPopover =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[320] w-[18rem] rounded-xl border border-border/70 bg-card/95 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.24)] backdrop-blur-sm"
            id={pickerId}
            ref={popoverRef}
            style={{
              left: layout?.left ?? VIEWPORT_PADDING,
              top: layout?.top ?? VIEWPORT_PADDING,
              visibility: layout ? "visible" : "hidden",
            }}
          >
            <div className="grid gap-3">
              <div
                className="relative overflow-hidden rounded-xl border border-border/70"
                onPointerDown={(event) =>
                  beginDrag(event, (clientX, clientY) => {
                    updateSaturationValue(clientX, clientY);
                  })
                }
                ref={saturationRef}
                style={{
                  backgroundColor: `hsl(${hsv.h} 100% 50%)`,
                  height: PICKER_SIZE,
                  width: "100%",
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#FFFFFF,rgba(255,255,255,0))]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_top,#000000,rgba(0,0,0,0))]" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.32)]"
                  style={{
                    backgroundColor: normalizedValue,
                    left: saturationCursorLeft,
                    top: saturationCursorTop,
                  }}
                />
              </div>

              <div className="grid gap-2">
                <div
                  className="relative overflow-hidden rounded-full border border-border/70 bg-[linear-gradient(90deg,#FF0000_0%,#FFFF00_16.6%,#00FF00_33.2%,#00FFFF_49.8%,#0000FF_66.4%,#FF00FF_83%,#FF0000_100%)]"
                  onPointerDown={(event) =>
                    beginDrag(event, (clientX) => {
                      updateHue(clientX);
                    })
                  }
                  ref={hueRef}
                  style={{ height: HUE_SLIDER_HEIGHT }}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.32)]"
                    style={{ left: hueCursorLeft }}
                  />
                </div>

                <div className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Hex
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      #
                    </span>
                    <Input
                      className="h-9 bg-background/65 font-mono text-sm tracking-[0.12em] uppercase"
                      maxLength={6}
                      onBlur={() => {
                        const nextHex = tryNormalizeHexColor(hexInput);
                        if (nextHex) {
                          onChange(nextHex);
                          setHexInput(nextHex.slice(1));
                          return;
                        }

                        setHexInput(normalizedValue.slice(1));
                      }}
                      onChange={(event) => {
                        const nextValue = event.target.value
                          .replace(/[^0-9a-f]/gi, "")
                          .slice(0, 6)
                          .toUpperCase();
                        setHexInput(nextValue);

                        const nextHex = tryNormalizeHexColor(nextValue);
                        if (!nextHex) {
                          return;
                        }

                        onChange(nextHex);
                      }}
                      spellCheck={false}
                      type="text"
                      value={hexInput}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={pickerId}
        aria-expanded={isOpen}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-border/70 bg-background/55 px-3 text-left transition-colors hover:bg-background/80 focus-visible:outline-none focus-visible:ring-0",
          isOpen && "bg-background/80",
        )}
        ref={triggerRef}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded-md border border-border/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
            style={{ backgroundColor: normalizedValue }}
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {normalizedValue}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {pickerPopover}
    </div>
  );
}

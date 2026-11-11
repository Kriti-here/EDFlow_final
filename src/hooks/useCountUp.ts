import { useEffect, useRef, useState } from "react";

type UseCountUpOptions = {
  /** Animation length in milliseconds. */
  durationMs?: number;
  /** Decimal places to keep while animating. */
  decimals?: number;
};

/** True when the user has asked the OS to minimise motion. */
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animates a number from 0 up to `target` once, on mount, and returns the
 * current value. Honours `prefers-reduced-motion` (and non-finite targets) by
 * seeding the final value straight away so nothing animates.
 */
export function useCountUp(target: number, options: UseCountUpOptions = {}) {
  const { durationMs = 900, decimals = 0 } = options;
  const [value, setValue] = useState(() =>
    prefersReducedMotion() || !Number.isFinite(target) ? target : 0,
  );
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      return;
    }

    const start = performance.now();
    const factor = 10 ** decimals;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased * factor) / factor);
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, decimals]);

  return value;
}

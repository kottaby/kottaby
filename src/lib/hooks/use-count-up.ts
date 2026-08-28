"use client";

import * as React from "react";

/**
 * useCountUp — animates a number from 0 → target when `inView` becomes true.
 * Uses an easing curve and respects prefers-reduced-motion.
 * Runs only once per target.
 */
export function useCountUp(target: number, inView: boolean, durationMs = 1600) {
  const [value, setValue] = React.useState(0);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, durationMs]);

  return value;
}

/**
 * useInView — sets `true` once the referenced element scrolls into view.
 * `once` defaults to true (only fires the first time).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  once?: boolean;
}) {
  const { threshold = 0.3, once = true } = options ?? {};
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        });
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  return { ref, inView };
}

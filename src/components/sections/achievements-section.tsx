"use client";

import * as React from "react";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";

function useCountUp(target: number, inView: boolean, durationMs = 1600) {
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

function AchievementTile({
  target,
  suffix,
  label,
}: {
  target: number;
  suffix: string;
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setInView(true)),
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const value = useCountUp(target, inView);

  return (
    <div
      ref={ref}
      className="flex flex-col items-center text-center gap-1.5 rounded-2xl border border-border bg-card/50 p-5 transition-all hover:border-copper/40 hover:-translate-y-1"
    >
      <span className="text-3xl md:text-4xl font-extrabold text-copper tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </span>
      <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function AchievementsSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="achievements"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Achievements"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.achievements.badge}
          title={t.achievements.title}
          subtitle={t.achievements.subtitle}
        />

        <div className="mt-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {t.achievements.items.map((item, i) => (
            <AchievementTile
              key={i}
              target={item.value}
              suffix={item.suffix}
              label={item.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import * as React from "react";
import {
  CalendarCheck,
  Award,
  Clock,
  Smile,
  Globe,
  BookMarked,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";
import { useCountUp, useInView } from "@/lib/hooks/use-count-up";

const achievementIcons: React.ComponentType<{ className?: string }>[] = [
  CalendarCheck,
  Award,
  Clock,
  Smile,
  Globe,
  BookMarked,
];

function AchievementTile({
  target,
  suffix,
  label,
  icon: Icon,
  delay,
}: {
  target: number;
  suffix: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  delay: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const value = useCountUp(target, inView);

  return (
    <div
      ref={ref}
      className="group relative overflow-hidden flex flex-col items-center text-center gap-2 rounded-2xl border border-border bg-card/50 p-5 transition-all hover:border-copper/40 hover:-translate-y-1 hover:shadow-[0_8px_25px_-8px_rgba(224,152,92,0.2)]"
    >
      {/* Hover copper glow */}
      <span
        className="pointer-events-none absolute -top-12 -end-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(224,152,92,0.18) 0%, transparent 70%)" }}
        aria-hidden
      />
      {/* Icon */}
      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-copper/10 border border-copper/20 text-copper transition-all group-hover:bg-copper/20 group-hover:scale-105">
        <Icon className="h-4 w-4" />
      </div>
      <span className="relative text-2xl md:text-3xl font-extrabold text-copper tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </span>
      <span className="relative text-[11px] md:text-xs text-muted-foreground leading-tight">{label}</span>
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
              icon={achievementIcons[i % achievementIcons.length]}
              delay={i * 0.08}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

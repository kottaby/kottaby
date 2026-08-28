"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { curriculumIcons } from "@/lib/data";
import { SectionHeader } from "./section-header";

export function CurriculumSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="curriculum"
      dir={dir}
      className="relative py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background overflow-hidden"
      aria-label="Curriculum"
    >
      {/* Ambient copper glow for depth */}
      <div
        className="pointer-events-none absolute top-1/3 -start-32 h-96 w-96 rounded-full opacity-[0.06] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.curriculum.badge}
          title={t.curriculum.title}
          subtitle={t.curriculum.subtitle}
        />

        <div className="mt-14 max-w-4xl mx-auto">
          <div className="relative">
            {/* Vertical connecting line — copper gradient */}
            <div
              className="absolute top-6 bottom-6 start-5 w-0.5 bg-gradient-to-b from-copper/20 via-copper/60 to-copper/20 rounded-full"
              aria-hidden
            />

            <ol className="space-y-6">
              {t.curriculum.items.map((item, i) => {
                const Icon = curriculumIcons[i] ?? curriculumIcons[0];
                const isLast = i === t.curriculum.items.length - 1;
                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: dir === "rtl" ? 16 : -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.4, delay: i * 0.07 }}
                    className="group relative flex items-start gap-5 ps-0"
                  >
                    {/* Numbered icon node — glows on hover */}
                    <div className="relative z-10 shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-copper/40 bg-card text-copper shadow-sm transition-all group-hover:border-copper group-hover:bg-copper/10 group-hover:shadow-[0_0_18px_rgba(224,152,92,0.35)] group-hover:scale-105">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="absolute -top-2 -end-2 flex h-5 w-5 items-center justify-center rounded-full bg-copper text-[10px] font-bold text-copper-foreground shadow">
                        {i + 1}
                      </span>
                      {/* Pulsing dot for the final Ijazah step */}
                      {isLast && (
                        <span className="absolute inset-0 rounded-full border border-copper/40 animate-ping" aria-hidden />
                      )}
                    </div>

                    {/* Card — lifts + border glows on hover */}
                    <div className="flex-1 rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5 transition-all hover:-translate-y-0.5 hover:border-copper/40 hover:shadow-[0_8px_25px_-8px_rgba(224,152,92,0.2)]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-base font-semibold transition-colors group-hover:text-copper">
                          {item.title}
                        </h3>
                        {isLast && (
                          <span className="inline-flex items-center rounded-full bg-copper/15 border border-copper/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-copper">
                            {t.common.popular}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

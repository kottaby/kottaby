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
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Curriculum"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.curriculum.badge}
          title={t.curriculum.title}
          subtitle={t.curriculum.subtitle}
        />

        <div className="mt-14 max-w-4xl mx-auto">
          <div className="relative">
            {/* Vertical connecting line */}
            <div
              className="absolute top-6 bottom-6 start-5 w-px border-s-2 border-dashed border-copper/30"
              aria-hidden
            />

            <ol className="space-y-8">
              {t.curriculum.items.map((item, i) => {
                const Icon = curriculumIcons[i] ?? curriculumIcons[0];
                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: dir === "rtl" ? 16 : -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.4, delay: i * 0.07 }}
                    className="relative flex items-start gap-5 ps-0"
                  >
                    {/* Numbered icon node */}
                    <div className="relative z-10 shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-copper/40 bg-card text-copper shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="absolute -top-2 -end-2 flex h-5 w-5 items-center justify-center rounded-full bg-copper text-[10px] font-bold text-copper-foreground">
                        {i + 1}
                      </span>
                    </div>

                    {/* Card */}
                    <div className="flex-1 rounded-2xl border border-border bg-card p-5 transition-all hover:border-copper/40 hover:shadow-md">
                      <h3 className="text-base font-semibold mb-1.5">{item.title}</h3>
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

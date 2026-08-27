"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { howItWorksIcons } from "@/lib/data";
import { SectionHeader } from "./section-header";

export function HowItWorksSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="how-it-works"
      dir={dir}
      className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden"
      aria-label="How it works"
    >
      {/* Ambient copper glow */}
      <div
        className="pointer-events-none absolute top-1/4 -end-32 h-96 w-96 rounded-full opacity-[0.05] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.howItWorks.badge}
          title={t.howItWorks.title}
          subtitle={t.howItWorks.subtitle}
        />

        <div className="mt-14 relative">
          {/* Animated gradient connecting line (desktop) */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="hidden md:block absolute top-12 start-[16%] end-[16%] h-0.5 origin-center rounded-full bg-gradient-to-r from-transparent via-copper/40 to-transparent"
            aria-hidden
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
            {t.howItWorks.steps.map((step, i) => {
              const Icon = howItWorksIcons[i] ?? howItWorksIcons[0];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="group relative flex flex-col items-center text-center gap-4"
                >
                  {/* Number badge + icon — glows on hover */}
                  <div className="relative">
                    {/* Pulsing ring */}
                    <span className="absolute inset-0 rounded-full border border-copper/20 animate-ping opacity-0 group-hover:opacity-100" aria-hidden />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-copper/30 bg-background transition-all group-hover:border-copper group-hover:bg-copper/5 group-hover:shadow-[0_0_25px_rgba(224,152,92,0.25)]">
                      <span className="absolute -top-2 -end-2 flex h-7 w-7 items-center justify-center rounded-full bg-copper text-xs font-bold text-copper-foreground shadow-[0_0_12px_rgba(224,152,92,0.4)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-10 w-10 text-copper transition-transform group-hover:scale-110" />
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold transition-colors group-hover:text-copper">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {step.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

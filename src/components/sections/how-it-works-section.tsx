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
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="How it works"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.howItWorks.badge}
          title={t.howItWorks.title}
          subtitle={t.howItWorks.subtitle}
        />

        <div className="mt-14 relative">
          {/* Dotted connecting line */}
          <div
            className="hidden md:block absolute top-12 start-[16%] end-[16%] border-t-2 border-dashed border-copper/30"
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
                  className="relative flex flex-col items-center text-center gap-4"
                >
                  {/* Number badge + icon */}
                  <div className="relative">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-copper/30 bg-background">
                      <span className="absolute -top-2 -end-2 flex h-7 w-7 items-center justify-center rounded-full bg-copper text-xs font-bold text-copper-foreground shadow-[0_0_12px_rgba(224,152,92,0.4)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-10 w-10 text-copper" />
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold">{step.title}</h3>
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

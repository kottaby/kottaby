"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, Apple, Play } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";

export function MobileAppSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="mobile-app"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Mobile app"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text column */}
          <motion.div
            initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-5"
          >
            <SectionHeader
              badge={t.mobileApp.badge}
              title={t.mobileApp.title}
              subtitle={t.mobileApp.subtitle}
              align="start"
            />

            <ul className="space-y-3 mt-2">
              {t.mobileApp.features.map((feature, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-copper/15 text-copper shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-foreground/90">{feature}</span>
                </motion.li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3 mt-4">
              <Button
                variant="outline"
                className="h-11 px-5 hover:border-copper hover:text-copper"
              >
                <Apple className="h-4 w-4" />
                {t.common.downloadAppStore}
              </Button>
              <Button
                variant="outline"
                className="h-11 px-5 hover:border-copper hover:text-copper"
              >
                <Play className="h-4 w-4 fill-current" />
                {t.common.downloadPlayStore}
              </Button>
            </div>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative flex justify-center items-center"
          >
            {/* Copper glow behind phone */}
            <div
              className="pointer-events-none absolute h-72 w-72 rounded-full opacity-30 blur-2xl"
              style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
              aria-hidden
            />

            {/* Phone */}
            <div className="relative w-[260px] h-[540px] rounded-[2.5rem] border-[6px] border-[#0A1422] bg-card shadow-2xl overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 inset-x-0 flex justify-center">
                <div className="h-6 w-32 bg-[#0A1422] rounded-b-2xl" />
              </div>

              {/* Screen */}
              <div className="absolute inset-0 pt-8 px-3 pb-3 flex flex-col gap-2 bg-gradient-to-b from-surface-high/40 to-surface-base/40">
                {/* Mini header */}
                <div className="flex items-center justify-between rounded-xl bg-card/80 px-3 py-2 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-copper" />
                    <span className="text-[10px] font-bold">Kottaby</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">Today</span>
                </div>

                {/* Mini stat tiles */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-card/80 p-2.5 flex flex-col gap-0.5">
                    <span className="text-[8px] text-muted-foreground">Streak</span>
                    <span className="text-base font-bold text-copper">12d</span>
                  </div>
                  <div className="rounded-xl bg-card/80 p-2.5 flex flex-col gap-0.5">
                    <span className="text-[8px] text-muted-foreground">Memorised</span>
                    <span className="text-base font-bold text-copper">3 juz</span>
                  </div>
                </div>

                {/* Next session card */}
                <div className="rounded-xl bg-copper/15 border border-copper/30 p-3">
                  <span className="text-[8px] uppercase tracking-wider text-copper font-semibold">
                    Next session
                  </span>
                  <p className="text-[11px] font-bold mt-1">
                    Hifz — Surah Al-Kahf
                  </p>
                  <p className="text-[9px] text-muted-foreground">Sheikh Abdullah · 16:00</p>
                  <div className="mt-2 h-1 rounded-full bg-copper/20">
                    <div className="h-full w-2/3 rounded-full bg-copper" />
                  </div>
                </div>

                {/* Mini progress list */}
                <div className="flex flex-col gap-1.5 flex-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-card/60 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-copper/60" />
                        <span className="text-[9px] text-foreground/80">
                          {["Fajr recitation", "Tajweed rule", "Muraja", "Hifz"][i]}
                        </span>
                      </div>
                      <span className="text-[8px] text-muted-foreground">
                        {["7am", "9am", "1pm", "4pm"][i]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Tab bar */}
                <div className="flex items-center justify-around rounded-xl bg-card/80 px-2 py-1.5">
                  {["Home", "Learn", "Track", "Me"].map((tab, i) => (
                    <span
                      key={tab}
                      className={`text-[9px] ${
                        i === 0 ? "text-copper font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {tab}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

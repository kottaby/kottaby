"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MoonStar, ArrowRight, Sparkles } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  const { t, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowRight : ArrowRight;

  return (
    <section
      id="hero"
      dir={dir}
      className="relative overflow-hidden"
      aria-label="Hero"
    >
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {/* Radial copper glow top-right */}
        <div
          className="absolute -top-32 right-0 h-[32rem] w-[32rem] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 60%)" }}
        />
        {/* Faint Islamic geometric pattern */}
        <div className="absolute inset-0 bg-islamic-pattern" />
        {/* Subtle navy gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
        <div className="max-w-3xl flex flex-col items-center text-center gap-6 mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-copper/30 bg-copper/10 px-4 py-1.5 text-sm font-medium text-copper"
          >
            <MoonStar className="h-4 w-4" />
            {t.hero.badge}
          </motion.div>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: "easeOut" }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-balance leading-[1.1]"
          >
            {t.hero.titleLead}{" "}
            <span className="bg-gradient-to-r from-copper via-[#E0985C] to-[#B87333] bg-clip-text text-transparent">
              {t.hero.titleAccent}
            </span>
            {t.hero.titleTail}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: "easeOut" }}
            className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl text-balance"
          >
            {t.hero.subtitle}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <Button
              size="lg"
              className="bg-copper text-copper-foreground hover:bg-copper/90 shadow-[0_8px_30px_rgba(224,152,92,0.25)] h-12 px-7 text-base"
            >
              <Sparkles className="h-4 w-4" />
              {t.hero.ctaPrimary}
              <Arrow className="h-4 w-4 rtl:rotate-0 ltr:rotate-0" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base border-border hover:border-copper hover:text-copper"
            >
              {t.hero.ctaSecondary}
            </Button>
          </motion.div>

          {/* Live indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-500"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {t.hero.liveIndicator}
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 md:mt-24 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8"
        >
          {t.hero.stats.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center gap-1 rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-5 transition-all hover:border-copper/40 hover:-translate-y-1"
            >
              <span className="text-3xl md:text-4xl font-extrabold text-copper tabular-nums">
                {stat.value}
              </span>
              <span className="text-xs md:text-sm text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

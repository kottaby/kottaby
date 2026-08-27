"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";

export function FinalCtaSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="final-cta"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Call to action"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-copper/30 bg-gradient-to-br from-[#0F1A2A] via-[#101E33] to-[#1B3358] p-10 md:p-16 lg:p-20 text-center"
        >
          {/* Animated copper glow — drifts slowly across the banner */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-32 h-96 w-96 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
            animate={{ left: ["0%", "100%", "0%"] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 left-0 h-96 w-96 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
            aria-hidden
          />
          {/* Faint Islamic geometric watermark */}
          <div className="pointer-events-none absolute inset-0 bg-islamic-pattern opacity-50" aria-hidden />

          {/* Shimmer sweep — a diagonal light band that sweeps across once on view */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="absolute inset-y-0 -start-1/3 w-1/3"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
                transform: "skewX(-20deg)",
              }}
              initial={{ left: "-33%" }}
              whileInView={{ left: "133%" }}
              viewport={{ once: true }}
              transition={{ duration: 2.2, delay: 0.4, ease: "easeInOut" }}
            />
          </motion.div>

          <div className="relative mx-auto max-w-2xl flex flex-col items-center gap-6">
            {/* Small badge above the title */}
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-copper/40 bg-copper/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-copper"
            >
              <Sparkles className="h-3 w-3" />
              {t.hero.badge}
            </motion.span>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance text-white">
              {t.finalCta.title}
            </h2>
            <p className="text-base md:text-lg text-white/70 leading-relaxed max-w-xl text-balance">
              {t.finalCta.subtitle}
            </p>
            <Button
              size="lg"
              className="mt-2 h-12 px-8 text-base bg-copper text-copper-foreground hover:bg-copper/90 shadow-[0_8px_30px_rgba(224,152,92,0.4)]"
            >
              <Sparkles className="h-4 w-4" />
              {t.finalCta.cta}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

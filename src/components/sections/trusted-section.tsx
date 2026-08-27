"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";

export function TrustedSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="trusted"
      dir={dir}
      className="py-16 md:py-20 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Trusted by"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.trusted.badge}
          title={t.trusted.title}
          subtitle={t.trusted.subtitle}
        />

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {t.trusted.partners.map((partner, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="group flex items-center justify-center rounded-xl border border-border bg-card/50 p-4 text-center grayscale transition-all hover:grayscale-0 hover:border-copper/40 hover:-translate-y-0.5"
            >
              <span
                className="text-xs md:text-sm font-semibold text-muted-foreground group-hover:text-copper transition-colors text-center"
                style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
              >
                {partner}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";

/** A decorative monogram logo for each partner (CSS-only, no external images). */
function PartnerMonogram({ name, index }: { name: string; index: number }) {
  // Derive a 2-3 letter monogram from the partner name
  const words = name.trim().split(/\s+/);
  const monogram = words.length >= 2
    ? (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")
    : (name.slice(0, 2));
  // Alternate between copper-tinted and primary-tinted monogram backgrounds
  const isCopper = index % 2 === 0;
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl border text-lg font-bold transition-all ${
        isCopper
          ? "border-copper/30 bg-copper/10 text-copper/70 group-hover:text-copper group-hover:border-copper/50"
          : "border-primary/30 bg-primary/10 text-primary/70 group-hover:text-primary group-hover:border-primary/50"
      }`}
      style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
      aria-hidden
    >
      {monogram}
    </div>
  );
}

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
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card/50 p-4 text-center transition-all hover:border-copper/40 hover:-translate-y-1 hover:shadow-[0_8px_20px_-8px_rgba(224,152,92,0.2)]"
            >
              <PartnerMonogram name={partner} index={i} />
              <span
                className="text-[11px] md:text-xs font-semibold text-muted-foreground group-hover:text-copper transition-colors text-center leading-tight"
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

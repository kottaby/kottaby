"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/locale-context";
import { featureIcons } from "@/lib/data";
import { SectionHeader } from "./section-header";

export function FeaturesSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="features"
      dir={dir}
      className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden"
      aria-label="Features"
    >
      {/* Ambient background layer — gives the glassmorphism cards something to blur */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {/* Two large copper radial glows that sit behind the grid */}
        <div
          className="absolute -top-20 start-1/4 h-96 w-96 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 end-1/4 h-96 w-96 rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
        />
        {/* Subtle dot grid for texture */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.features.badge}
          title={t.features.title}
          subtitle={t.features.subtitle}
        />

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.features.items.map((feature, i) => {
            const Icon = featureIcons[i] ?? featureIcons[0];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 transition-all hover:-translate-y-1.5 hover:shadow-lg hover:border-copper/40 hover:shadow-[0_0_30px_rgba(224,152,92,0.12)]"
              >
                {/* Glassmorphism sheen — top-left highlight */}
                <span
                  className="pointer-events-none absolute -top-px -start-px h-20 w-20 rounded-tl-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle at top left, rgba(224,152,92,0.18) 0%, transparent 70%)",
                  }}
                  aria-hidden
                />

                {/* Icon */}
                <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-copper/10 border border-copper/20 text-copper transition-all group-hover:bg-copper/20 group-hover:scale-110 group-hover:shadow-[0_0_18px_rgba(224,152,92,0.35)]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="relative text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="relative text-sm text-muted-foreground leading-relaxed">
                  {feature.body}
                </p>

                {/* Hover border accent */}
                <span className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-copper/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

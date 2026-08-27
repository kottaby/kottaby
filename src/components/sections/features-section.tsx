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
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Features"
    >
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
                className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:border-copper/40 hover:shadow-[0_0_30px_rgba(224,152,92,0.08)]"
              >
                {/* Icon */}
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-copper/10 border border-copper/20 text-copper transition-all group-hover:bg-copper/20 group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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

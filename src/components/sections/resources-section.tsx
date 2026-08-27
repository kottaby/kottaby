"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calendar } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";

export function ResourcesSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="resources"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Resources"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.resources.badge}
          title={t.resources.title}
          subtitle={t.resources.subtitle}
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.resources.items.map((article, i) => (
            <motion.article
              key={i}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-copper/40 hover:shadow-lg hover:shadow-[0_0_25px_rgba(224,152,92,0.1)]"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-copper/15 border border-copper/30 px-2.5 py-0.5 text-[10px] font-semibold text-copper">
                  {article.category}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {article.date}
                </span>
              </div>

              <h3 className="text-lg font-semibold leading-tight group-hover:text-copper transition-colors">
                {article.title}
              </h3>

              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {article.excerpt}
              </p>

              <a
                href="#"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper hover:gap-2.5 transition-all"
              >
                {t.common.readMore}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </a>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

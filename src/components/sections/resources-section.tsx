"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, BookOpen, Brain, Award } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { SectionHeader } from "./section-header";

/** Map resource category → icon (bilingual-safe, matches both AR + EN category names). */
const categoryIcons: React.ComponentType<{ className?: string }>[] = [BookOpen, Brain, Award];

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
          {t.resources.items.map((article, i) => {
            const CategoryIcon = categoryIcons[i % categoryIcons.length];
            return (
              <motion.article
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1.5 hover:border-copper/40 hover:shadow-[0_12px_35px_-12px_rgba(224,152,92,0.2)]"
              >
                {/* Hover copper glow */}
                <span
                  className="pointer-events-none absolute -top-12 -end-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: "radial-gradient(circle, rgba(224,152,92,0.18) 0%, transparent 70%)" }}
                  aria-hidden
                />

                {/* Category icon + badges */}
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-copper/10 border border-copper/20 text-copper transition-all group-hover:bg-copper/20 group-hover:scale-105">
                      <CategoryIcon className="h-4 w-4" />
                    </div>
                    <span className="inline-flex items-center rounded-full bg-copper/15 border border-copper/30 px-2.5 py-0.5 text-[10px] font-semibold text-copper">
                      {article.category}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {article.date}
                  </span>
                </div>

                <h3 className="relative text-lg font-semibold leading-tight group-hover:text-copper transition-colors">
                  {article.title}
                </h3>

                <p className="relative text-sm text-muted-foreground leading-relaxed flex-1">
                  {article.excerpt}
                </p>

                <a
                  href="#"
                  className="relative inline-flex items-center gap-1.5 text-sm font-semibold text-copper hover:gap-2.5 transition-all mt-1"
                >
                  {t.common.readMore}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform" />
                </a>

                {/* Bottom accent line */}
                <span className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-copper/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

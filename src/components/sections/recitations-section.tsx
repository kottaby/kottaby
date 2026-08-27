"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Search, Star } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "./section-header";

export function RecitationsSection() {
  const { t, dir } = useLocale();
  const [query, setQuery] = React.useState("");

  const items = t.recitations.items;
  const filtered = items.filter((it) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      it.name.toLowerCase().includes(q) ||
      it.translit.toLowerCase().includes(q) ||
      it.narrator.toLowerCase().includes(q)
    );
  });

  return (
    <section
      id="recitations"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Recitations"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.recitations.badge}
          title={t.recitations.title}
          subtitle={t.recitations.subtitle}
        />

        {/* Search */}
        <div className="mt-10 mx-auto max-w-md">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.recitations.searchPlaceholder}
              className="ps-9 h-11 bg-card border-border focus-visible:border-copper focus-visible:ring-copper/20"
              aria-label="Search recitations"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((rec, i) => (
            <motion.article
              key={i}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
              className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-copper/40 hover:shadow-[0_0_25px_rgba(224,152,92,0.1)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3
                    className="text-2xl font-bold leading-tight"
                    style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
                    lang={dir === "rtl" ? "ar" : "en"}
                  >
                    {rec.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5 italic">
                    {rec.translit}
                  </p>
                </div>
                {rec.popular && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-copper/40 bg-copper/15 px-2 py-0.5 text-[10px] font-semibold text-copper">
                    <Star className="h-3 w-3 fill-copper stroke-copper" />
                    {t.recitations.popular}
                  </span>
                )}
              </div>

              <div className="border-t border-border/60 pt-3 mt-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                  {t.recitations.narrator}
                </p>
                <p className="text-sm text-foreground/90">{rec.narrator}</p>
              </div>
            </motion.article>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            {dir === "rtl" ? "لا نتائج مطابقة." : "No matching recitations."}
          </p>
        )}
      </div>
    </section>
  );
}

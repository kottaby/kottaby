"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { rolesIcons } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";

export function RolesSection() {
  const { t, dir } = useLocale();

  return (
    <section
      id="roles"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Roles"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.roles.badge}
          title={t.roles.title}
          subtitle={t.roles.subtitle}
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.roles.items.map((role, i) => {
            const Icon = rolesIcons[i] ?? rolesIcons[0];
            const isTeacher = i === 1; // Teacher card highlighted
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-7 transition-all hover:-translate-y-1.5 ${
                  isTeacher
                    ? "border-copper/60 shadow-[0_0_30px_rgba(224,152,92,0.18)] md:scale-[1.03]"
                    : "border-border hover:border-copper/40 hover:shadow-lg"
                }`}
              >
                {/* Decorative copper glow that appears on hover */}
                <span
                  className="pointer-events-none absolute -top-16 -end-16 h-40 w-40 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(224,152,92,0.2) 0%, transparent 70%)",
                  }}
                  aria-hidden
                />

                {isTeacher && (
                  <span className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 rtl:left-auto rtl:right-1/2 rounded-full bg-copper px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-copper-foreground shadow">
                    {t.common.mostPopular}
                  </span>
                )}

                {/* Icon — scales + glows on hover */}
                <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-copper/10 border border-copper/20 text-copper transition-all group-hover:bg-copper/20 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(224,152,92,0.3)]">
                  <Icon className="h-7 w-7" />
                </div>

                <h3 className="relative text-xl font-semibold transition-colors group-hover:text-copper">
                  {role.title}
                </h3>
                <p className="relative text-sm text-muted-foreground leading-relaxed flex-1">
                  {role.body}
                </p>

                {/* Bottom accent line — appears on hover */}
                <span className="absolute inset-x-7 -bottom-px h-px bg-gradient-to-r from-transparent via-copper/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <Button
                  variant={isTeacher ? "default" : "outline"}
                  className={`relative mt-2 w-full ${
                    isTeacher
                      ? "bg-copper text-copper-foreground hover:bg-copper/90"
                      : "hover:border-copper hover:text-copper"
                  }`}
                >
                  {role.cta}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

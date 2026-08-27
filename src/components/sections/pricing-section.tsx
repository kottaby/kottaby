"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";

export function PricingSection() {
  const { t, dir } = useLocale();
  const [cycle, setCycle] = React.useState<"monthly" | "yearly">("monthly");

  return (
    <section
      id="pricing"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Pricing"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.pricing.badge}
          title={t.pricing.title}
          subtitle={t.pricing.subtitle}
        />

        {/* Toggle */}
        <div className="mt-8 flex items-center justify-center">
          <Tabs value={cycle} onValueChange={(v) => setCycle(v as "monthly" | "yearly")}>
            <TabsList className="bg-card border border-border h-10 p-1">
              <TabsTrigger
                value="monthly"
                className="data-[state=active]:bg-copper data-[state=active]:text-copper-foreground rounded-md px-4"
              >
                {t.common.monthly}
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="data-[state=active]:bg-copper data-[state=active]:text-copper-foreground rounded-md px-4 gap-2"
              >
                {t.common.yearly}
                <span className="inline-flex items-center rounded-full bg-copper/20 px-1.5 py-0.5 text-[10px] font-bold text-copper">
                  {t.pricing.save}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Plans */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {t.pricing.plans.map((plan, i) => {
            const isPopular = i === 1;
            const price = cycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className={`relative flex flex-col gap-5 rounded-2xl border bg-card p-7 transition-all ${
                  isPopular
                    ? "border-copper/60 shadow-[0_0_40px_rgba(224,152,92,0.18)] md:scale-[1.04] md:-translate-y-1"
                    : "border-border hover:border-copper/40 hover:shadow-lg"
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 rtl:left-auto rtl:right-1/2 rounded-full bg-copper px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-copper-foreground shadow">
                    {t.common.mostPopular}
                  </span>
                )}

                {/* Plan name */}
                <h3 className="text-lg font-semibold">{plan.name}</h3>

                {/* Price */}
                <div className="flex items-end gap-1">
                  {price === 0 ? (
                    <span className="text-4xl font-extrabold">{t.common.free}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-extrabold tabular-nums">${price}</span>
                      <span className="text-sm text-muted-foreground mb-1.5">
                        {t.common.perMonth}
                      </span>
                    </>
                  )}
                </div>

                <p className="text-xs text-muted-foreground -mt-2">{plan.tagline}</p>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-copper/15 text-copper shrink-0">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isPopular ? "default" : "outline"}
                  className={`w-full h-11 ${
                    isPopular
                      ? "bg-copper text-copper-foreground hover:bg-copper/90 shadow-[0_4px_20px_rgba(224,152,92,0.3)]"
                      : "hover:border-copper hover:text-copper"
                  }`}
                >
                  {plan.cta}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

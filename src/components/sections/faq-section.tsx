"use client";

import * as React from "react";
import { Plus, Minus, HelpCircle } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";
import { motion } from "framer-motion";

export function FaqSection() {
  const { t, dir } = useLocale();
  const [allOpen, setAllOpen] = React.useState(false);
  const [openItems, setOpenItems] = React.useState<string[]>([]);

  // Reset open items when toggling "expand all"
  React.useEffect(() => {
    if (allOpen) {
      setOpenItems(t.faq.items.map((_, i) => `item-${i}`));
    } else {
      setOpenItems([]);
    }
  }, [allOpen, t.faq.items.length]);

  const toggleAll = () => setAllOpen((v) => !v);

  return (
    <section
      id="faq"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="FAQ"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.faq.badge}
          title={t.faq.title}
          subtitle={t.faq.subtitle}
        />

        {/* Expand / collapse all */}
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            className="hover:border-copper hover:text-copper"
          >
            {allOpen ? (
              <>
                <Minus className="h-4 w-4" />
                {t.common.collapseAll}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {t.common.expandAll}
              </>
            )}
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.45 }}
          className="mt-8 rounded-2xl border border-border bg-card p-2 sm:p-4"
        >
          <Accordion
            type="multiple"
            value={openItems}
            onValueChange={setOpenItems}
            className="w-full"
          >
            {t.faq.items.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="px-2 sm:px-4">
                <AccordionTrigger className="text-start text-base hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        {/* "Still have questions?" helper card → contact */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="mt-8 relative overflow-hidden rounded-2xl border border-copper/30 bg-gradient-to-br from-copper/10 via-card to-card p-6 sm:p-8 text-center"
        >
          <div
            className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
            aria-hidden
          />
          <div className="relative flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-copper/15 text-copper">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{t.faq.stillHaveQuestions}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t.faq.stillHaveQuestionsBody}
            </p>
            <Button
              asChild
              size="sm"
              className="mt-1 bg-copper text-copper-foreground hover:bg-copper/90"
            >
              <a href="#contact">{t.faq.contactUs}</a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

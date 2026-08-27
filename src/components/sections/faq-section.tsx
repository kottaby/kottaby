"use client";

import * as React from "react";
import { Plus, Minus } from "lucide-react";
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
      </div>
    </section>
  );
}

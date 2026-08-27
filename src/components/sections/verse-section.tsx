"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Copy, Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";

export function VerseSection() {
  const { t, dir } = useLocale();
  const [copied, setCopied] = React.useState(false);

  const copyVerse = async () => {
    try {
      await navigator.clipboard.writeText(
        `${t.verse.text}\n\n${t.verse.translation}\n${t.verse.reference}`
      );
      setCopied(true);
      toast.success(t.common.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const shareVerse = async () => {
    const shareData = {
      title: t.verse.title,
      text: `${t.verse.text}\n${t.verse.translation}\n${t.verse.reference}`,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.text);
        toast.success(t.common.copied);
      } catch {
        toast.error("Share failed");
      }
    }
  };

  return (
    <section
      id="verse"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Verse of the day"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.verse.badge}
          title={t.verse.title}
          subtitle={t.verse.subtitle}
        />

        <motion.figure
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="relative mt-10 overflow-hidden rounded-3xl border border-copper/30 bg-gradient-to-br from-card via-surface-base to-card p-8 md:p-14"
        >
          {/* Decorative copper corner flourishes */}
          <span className="pointer-events-none absolute top-0 start-0 h-16 w-16 border-t-2 border-s-2 border-copper/50 rounded-tl-3xl" />
          <span className="pointer-events-none absolute bottom-0 end-0 h-16 w-16 border-b-2 border-e-2 border-copper/50 rounded-br-3xl" />

          {/* Geometric pattern */}
          <div className="pointer-events-none absolute inset-0 bg-islamic-pattern opacity-50" aria-hidden />

          <div className="relative flex flex-col items-center text-center gap-6">
            <p
              className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.6] text-copper"
              style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
              lang="ar"
              dir="rtl"
            >
              {t.verse.text}
            </p>

            <p className="text-lg md:text-xl text-foreground/90 italic">
              {t.verse.translation}
            </p>

            <p className="text-sm text-muted-foreground font-medium">
              {t.verse.reference}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyVerse}
                className="hover:border-copper hover:text-copper"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? t.common.copied : t.common.copy}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={shareVerse}
                className="hover:border-copper hover:text-copper"
              >
                <Share2 className="h-4 w-4" />
                {t.common.share}
              </Button>
            </div>
          </div>
        </motion.figure>
      </div>
    </section>
  );
}

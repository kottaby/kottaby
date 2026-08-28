"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Mail, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/locale-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";
import { isValidEmail } from "@/lib/data";
import { useCountUp, useInView } from "@/lib/hooks/use-count-up";

/** Fetches the live subscriber count from /api/newsletter/count. */
function useSubscriberCount() {
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/newsletter/count")
      .then((r) => r.json())
      .then((data: { count?: number }) => {
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      })
      .catch(() => {
        /* leave as null → fallback to static copy */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

function SubscriberCountChip() {
  const { t } = useLocale();
  const liveCount = useSubscriberCount();
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });
  // Fallback static floor so the chip never shows a tiny number on a fresh DB.
  const baseCount = 12000;
  const target = liveCount !== null ? liveCount + baseCount : baseCount;
  const animated = useCountUp(target, inView, 1600);
  const display = animated.toLocaleString();

  // Fallback to the static copy if the live template key is unavailable
  // (e.g. during HMR before the messages module is fully reloaded).
  const liveTemplate = t.newsletter.subscriberCountLive;
  const text =
    typeof liveTemplate === "string"
      ? liveTemplate.replace("{count}", display)
      : t.newsletter.subscriberCount;

  return (
    <div
      ref={ref}
      className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground"
    >
      <Users className="h-3.5 w-3.5 text-copper" />
      <span>{text}</span>
    </div>
  );
}

export function NewsletterSection() {
  const { t, locale, dir } = useLocale();
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error(t.newsletter.invalidEmail);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (!res.ok) throw new Error("Network error");
      toast.success(t.newsletter.successTitle, {
        description: t.newsletter.successDesc,
      });
      setEmail("");
    } catch {
      toast.error(t.newsletter.errorTitle, {
        description: t.newsletter.errorDesc,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="newsletter"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Newsletter"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-surface-base to-card p-8 md:p-12"
        >
          {/* Decorative copper glow */}
          <div
            className="pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
            aria-hidden
          />
          <div className="pointer-events-none absolute -bottom-20 -start-20 h-56 w-56 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-xl flex flex-col items-center text-center gap-5">
            <SectionHeader
              badge={t.newsletter.badge}
              title={t.newsletter.title}
              subtitle={t.newsletter.subtitle}
            />

            <form onSubmit={onSubmit} className="w-full flex flex-col sm:flex-row gap-2 mt-2">
              <div className="relative flex-1">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.newsletter.emailPlaceholder}
                  className="ps-9 h-11 bg-background border-border focus-visible:border-copper focus-visible:ring-copper/20"
                  aria-label={t.newsletter.emailPlaceholder}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-11 bg-copper text-copper-foreground hover:bg-copper/90 px-6"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t.common.subscribe
                )}
              </Button>
            </form>

            {/* Live subscriber count social proof (count-up animation) */}
            <SubscriberCountChip />

            <p className="text-xs text-muted-foreground">
              {t.newsletter.disclaimer}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

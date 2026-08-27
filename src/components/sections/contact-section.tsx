"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, CheckCircle2, Ticket, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/locale-context";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";
import { isValidEmail } from "@/lib/data";

export function ContactSection() {
  const { t, locale, dir } = useLocale();
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ticket, setTicket] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error(t.contact.invalidEmail);
      return;
    }
    if (message.trim().length < 10) {
      toast.error(t.contact.shortMessage);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, locale }),
      });
      const data: { ok?: boolean; ticket?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error("Network error");
      setTicket(data.ticket ?? null);
      toast.success(t.contact.successTitle, {
        description: t.contact.successDesc,
      });
      setEmail("");
      setMessage("");
    } catch {
      toast.error(t.contact.errorTitle, {
        description: t.contact.errorDesc,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => setTicket(null);

  return (
    <section
      id="contact"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20 bg-gradient-to-b from-background via-surface-lowest to-background"
      aria-label="Contact"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.contact.badge}
          title={t.contact.title}
          subtitle={t.contact.subtitle}
        />

        <div className="relative mt-10">
          {/* Form */}
          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.45 }}
            className="rounded-2xl border border-border bg-card p-6 md:p-8 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-email" className="text-sm font-medium">
                {t.contact.emailPlaceholder}
              </label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.contact.emailPlaceholder}
                className="h-11 bg-background border-border focus-visible:border-copper focus-visible:ring-copper/20"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-message" className="text-sm font-medium">
                {t.common.sendMessage}
              </label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.contact.messagePlaceholder}
                className="min-h-32 bg-background border-border focus-visible:border-copper focus-visible:ring-copper/20 resize-y"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="self-start h-11 bg-copper text-copper-foreground hover:bg-copper/90 px-6"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 rtl:-scale-x-100" />
                  {t.common.sendMessage}
                </>
              )}
            </Button>
          </motion.form>

          {/* Success state overlay — replaces the form with a confirmation card */}
          <AnimatePresence>
            {ticket && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0 rounded-2xl border border-copper/40 bg-gradient-to-br from-copper/10 via-card to-card p-8 md:p-10 flex flex-col items-center justify-center text-center gap-5 shadow-lg"
              >
                {/* Decorative copper glow */}
                <div
                  className="pointer-events-none absolute -top-20 -end-20 h-48 w-48 rounded-full opacity-20"
                  style={{
                    background:
                      "radial-gradient(circle, var(--copper) 0%, transparent 70%)",
                  }}
                  aria-hidden
                />

                {/* Success check icon with copper ring */}
                <div className="relative">
                  <span className="absolute inset-0 rounded-full bg-copper/20 animate-ping" aria-hidden />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-copper/15 border-2 border-copper text-copper">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                </div>

                <div className="relative space-y-1.5">
                  <h3 className="text-xl font-bold text-copper">
                    {t.contact.successTitle}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t.contact.successDesc}
                  </p>
                </div>

                {/* Ticket number card */}
                <div className="relative flex items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-3">
                  <Ticket className="h-5 w-5 text-copper" />
                  <div className="text-start">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.contact.successTicketPrefix}
                    </p>
                    <p className="text-base font-bold font-mono tabular-nums tracking-wider text-foreground">
                      {ticket}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetForm}
                  className="relative hover:border-copper hover:text-copper"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t.contact.successSendAnother}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

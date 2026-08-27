"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";
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
      if (!res.ok) throw new Error("Network error");
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

        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.45 }}
          className="mt-10 rounded-2xl border border-border bg-card p-6 md:p-8 flex flex-col gap-4"
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
      </div>
    </section>
  );
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Gift, Sparkles, Check, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/locale-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";
import { isValidEmail } from "@/lib/data";

/**
 * DEV1-004 — Free Trial Section
 *
 * Showcases the free-trial-session-provisioning feature: every new student
 * receives one free trial session automatically upon registration (grant-once
 * invariant enforced at the SQL level via a guarded conditional UPDATE).
 *
 * The registration form POSTs to /api/register which:
 *  1. Creates the student record
 *  2. Grants the trial credit atomically inside the same transaction (REQ-011/018)
 *  3. Returns the studentId + trialGranted flag
 */
export function FreeTrialSection() {
  const { t, locale, dir } = useLocale();
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{
    studentId: string;
    trialGranted: boolean;
  } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error(locale === "ar" ? "الاسم قصير جدًا" : "Name is too short");
      return;
    }
    if (!isValidEmail(email)) {
      toast.error(t.contact.invalidEmail);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, role: "student", locale }),
      });
      const data: {
        ok?: boolean;
        studentId?: string;
        trialGranted?: boolean;
        code?: string;
        error?: string;
      } = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Registration failed");
      }
      setResult({
        studentId: data.studentId ?? "",
        trialGranted: data.trialGranted ?? false,
      });
      toast.success(t.trial.grantedTitle, { description: t.trial.grantedDesc });
      setEmail("");
      setFullName("");
    } catch (err) {
      toast.error(t.contact.errorTitle, {
        description: err instanceof Error ? err.message : t.contact.errorDesc,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="free-trial"
      dir={dir}
      className="relative py-20 md:py-28 scroll-mt-20 overflow-hidden"
      aria-label="Free trial"
    >
      {/* Ambient copper glow background */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute top-0 start-1/3 h-96 w-96 rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 end-1/3 h-80 w-80 rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: explanation + contract notes */}
          <motion.div
            initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-5"
          >
            <SectionHeader
              badge={t.trial.badge}
              title={t.trial.title}
              subtitle={t.trial.subtitle}
              align="start"
            />

            {/* Contract highlights */}
            <ul className="space-y-3 mt-2">
              {[
                t.trial.subtitle,
                t.trial.eligibilityNote,
                locale === "ar"
                  ? "تُمنح مرة واحدة فقط لكل طالب — مضمونة على مستوى قاعدة البيانات."
                  : "Granted exactly once per student — enforced at the database level.",
              ].map((line, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-copper/15 text-copper shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-foreground/90">{line}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Right: registration card or success state */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            {/* Gift icon glow */}
            <div
              className="pointer-events-none absolute -top-12 -end-12 h-40 w-40 rounded-full opacity-20 blur-2xl"
              style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
              aria-hidden
            />

            {result ? (
              <SuccessCard
                result={result}
                onReset={() => setResult(null)}
              />
            ) : (
              <form
                onSubmit={onSubmit}
                className="relative rounded-2xl border border-copper/30 bg-gradient-to-br from-card via-surface-base to-card p-6 md:p-8 flex flex-col gap-4 shadow-lg"
              >
                {/* Gift badge */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-copper/15 border border-copper/30 text-copper">
                    <Gift className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-copper">
                      {t.trial.grantedTitle}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t.trial.grantedDesc}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="trial-fullname" className="text-sm font-medium">
                    {locale === "ar" ? "الاسم الكامل" : "Full name"}
                  </label>
                  <Input
                    id="trial-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={locale === "ar" ? "اسمك الكامل" : "Your full name"}
                    className="h-11 bg-background border-border focus-visible:border-copper focus-visible:ring-copper/20"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="trial-email" className="text-sm font-medium">
                    {t.contact.emailPlaceholder}
                  </label>
                  <Input
                    id="trial-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.contact.emailPlaceholder}
                    className="h-11 bg-background border-border focus-visible:border-copper focus-visible:ring-copper/20"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-copper text-copper-foreground hover:bg-copper/90 shadow-[0_4px_20px_rgba(224,152,92,0.3)]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t.trial.cta}
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-muted-foreground text-center">
                  {t.trial.eligibilityNote}
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Success card — shown after registration + trial grant. */
function SuccessCard({
  result,
  onReset,
}: {
  result: { studentId: string; trialGranted: boolean };
  onReset: () => void;
}) {
  const { t, locale } = useLocale();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative rounded-2xl border border-copper/40 bg-gradient-to-br from-copper/10 via-card to-card p-8 flex flex-col items-center text-center gap-4 shadow-lg"
    >
      {/* Pinging check icon */}
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-copper/20 animate-ping" aria-hidden />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-copper/15 border-2 border-copper text-copper">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
      </div>

      <h3 className="text-xl font-bold text-copper">{t.trial.grantedTitle}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{t.trial.grantedDesc}</p>

      {/* Trial balance card */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-3">
        <Gift className="h-5 w-5 text-copper" />
        <div className="text-start">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t.trial.balanceLabel}
          </p>
          <p className="text-base font-bold tabular-nums text-foreground">
            1 {t.trial.sessionsUnit}
          </p>
        </div>
      </div>

      {/* Student ID (debug/contract reference) */}
      <p className="text-[10px] text-muted-foreground/60 font-mono">
        {locale === "ar" ? "معرّف الطالب" : "Student ID"}: {result.studentId.slice(0, 12)}…
      </p>

      <Button variant="outline" size="sm" onClick={onReset} className="hover:border-copper hover:text-copper">
        {locale === "ar" ? "تسجيل طالب آخر" : "Register another student"}
      </Button>
    </motion.div>
  );
}

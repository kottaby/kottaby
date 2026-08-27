"use client";

import * as React from "react";
import Link from "next/link";
import {
  Twitter,
  Youtube,
  Instagram,
  Send,
  Facebook,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";

interface FooterLink {
  href: string;
  label: string;
}

const socials = [
  { icon: Twitter, label: "X" },
  { icon: Youtube, label: "YouTube" },
  { icon: Instagram, label: "Instagram" },
  { icon: Send, label: "Telegram" },
  { icon: Facebook, label: "Facebook" },
];

export function SiteFooter() {
  const { t, dir } = useLocale();

  const columns: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: t.footer.columnsTitle.product,
      links: t.footer.columns.product.map((label, i) => ({
        label,
        href: ["#features", "#recitations", "#pricing"][i] ?? "#",
      })),
    },
    {
      title: t.footer.columnsTitle.company,
      links: t.footer.columns.company.map((label, i) => ({
        label,
        href: ["#", "#", "#contact"][i] ?? "#",
      })),
    },
    {
      title: t.footer.columnsTitle.legal,
      links: t.footer.columns.legal.map((label) => ({ label, href: "#" })),
    },
  ];

  return (
    <footer
      dir={dir}
      className="relative mt-auto w-full bg-[var(--footer-bg)] text-foreground overflow-hidden"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">{t.common.brand}</h2>
      {/* Top copper border + inset glow */}
      <div className="h-[3px] bg-gradient-to-r from-transparent via-copper to-transparent" />
      <div className="absolute inset-x-0 top-0 h-px shadow-[0_0_18px_rgba(224,152,92,0.35)]" />

      {/* Decorative radial copper glow top-right */}
      <div
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, var(--copper) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2 space-y-5">
            <Link href="#" className="inline-flex items-center gap-2.5" aria-label={t.common.brand}>
              <span className="relative flex h-8 w-8 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-copper/20" />
                <span className="relative h-3 w-3 rounded-full bg-copper glow-copper" />
              </span>
              <span className="font-extrabold text-lg" style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}>
                {t.common.brand}
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {t.footer.tagline}
            </p>
            <div className="flex items-center gap-2">
              {socials.map(({ icon: Icon, label }) => (
                <Link
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all hover:text-copper hover:border-copper hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(224,152,92,0.25)]"
                >
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
            <ServiceStatusChip />
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title} className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-copper border-b border-copper/30 pb-2 inline-block">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border/60 pt-6">
          <p className="text-center text-xs text-muted-foreground">
            {t.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}

function ServiceStatusChip() {
  const { t } = useLocale();
  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then(() => !cancelled && setOk(true))
      .catch(() => !cancelled && setOk(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
            ok === false ? "bg-destructive" : "bg-green-500"
          } ${ok === null ? "animate-pulse" : "animate-ping"}`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            ok === false ? "bg-destructive" : "bg-green-500"
          }`}
        />
      </span>
      <span className="text-muted-foreground">{t.common.allSystemsOperational}</span>
    </div>
  );
}

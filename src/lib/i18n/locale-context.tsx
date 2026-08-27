"use client";

import * as React from "react";
import { messages, type Locale, type LocaleMessages } from "./messages";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: LocaleMessages;
  dir: "rtl" | "ltr";
}

const LocaleContext = React.createContext<LocaleContextValue | undefined>(undefined);

const STORAGE_KEY = "kottaby-locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("ar");

  // Load persisted locale on mount (client-only)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "ar" || stored === "en") {
        setLocaleState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  // Apply dir/lang to <html> + persist
  React.useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
      // Persist as cookie for server-side reads (if ever needed)
      document.cookie = `${STORAGE_KEY}=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
    } catch {
      // ignore
    }
  }, [locale]);

  const setLocale = React.useCallback((l: Locale) => setLocaleState(l), []);
  const dir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";
  // Note: `messages[locale]` is read on every render (not memoized) so that
  // HMR updates to messages.ts propagate immediately without a locale change.
  const value: LocaleContextValue = { locale, setLocale, t: messages[locale], dir };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}

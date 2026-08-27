"use client";

import * as React from "react";
import { useLocale } from "@/lib/i18n/locale-context";
import { cairoPrayerTimes, type PrayerTime } from "@/lib/data";

// Simple Umm al-Qura approximation: (date-fns not strictly needed; we use a
// known epoch offset and an arithmetic Hijri conversion based on the Kuwaiti
// algorithm — good enough for display purposes, ~1-day accuracy.)
function toHijri(date: Date): { day: number; month: number; year: number; monthNameEn: string; monthNameAr: string } {
  const monthsEn = [
    "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani",
    "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
    "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
  ];
  const monthsAr = [
    "محرم", "صفر", "ربيع الأول", "ربيع الثاني",
    "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
    "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
  ];

  const jd = Math.floor(
    (date.getTime() - new Date(Date.UTC(1, 0, 1)).getTime()) / 86400000
  ) + 1721426;
  const l1 = jd - 1948440 + 10632;
  const n = Math.floor((l1 - 1) / 10631);
  const l2 = l1 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * (Math.floor((50 * l2) / 17719)) +
    Math.floor(l2 / 5670) * (Math.floor((43 * l2) / 15238));
  const l3 = l2 - Math.floor((30 - j) / 15) * (Math.floor((17719 * j) / 50)) -
    Math.floor(j / 16) * (Math.floor((15238 * j) / 43)) + 29;
  const m = Math.floor((24 * l3) / 709);
  const d = l3 - Math.floor((709 * m) / 24);
  const y = 30 * n + j - 30;

  const monthIdx = Math.min(Math.max(m - 1, 0), 11);
  return {
    day: d,
    month: m,
    year: y,
    monthNameEn: monthsEn[monthIdx],
    monthNameAr: monthsAr[monthIdx],
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

interface NextPrayerInfo {
  prayer: PrayerTime;
  diffMs: number;
}

function getNextPrayer(now: Date): NextPrayerInfo {
  const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
  const today = cairoPrayerTimes.map((p) => ({ prayer: p, ms: p.h * 3600000 + p.m * 60000 }));
  for (const item of today) {
    if (item.ms > nowMs) {
      return { prayer: item.prayer, diffMs: item.ms - nowMs };
    }
  }
  // Wrap to next day's first prayer (Fajr)
  const nextDay = today[0];
  return { prayer: nextDay.prayer, diffMs: 86400000 - nowMs + nextDay.ms };
}

function formatCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export function TopUtilityStrip() {
  const { t, locale, dir } = useLocale();
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    // Update every 10s for a live clock feel (the countdown updates on the same tick)
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  const hijri = now ? toHijri(now) : null;
  const next = now ? getNextPrayer(now) : null;
  const clock = now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "—";

  const prayerLabels: Record<PrayerTime["key"], string> = {
    fajr: t.utility.fajr,
    sunrise: t.utility.sunrise,
    dhuhr: t.utility.dhuhr,
    asr: t.utility.asr,
    maghrib: t.utility.maghrib,
    isha: t.utility.isha,
  };

  return (
    <div
      dir={dir}
      className="w-full border-b border-copper/20 bg-[var(--header-bg)]"
      aria-label="Top utility strip"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 py-1.5 text-xs text-muted-foreground">
          {/* Hijri date + live clock */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-copper">
              {hijri
                ? locale === "ar"
                  ? `${hijri.day} ${hijri.monthNameAr} ${hijri.year} هـ`
                  : `${hijri.day} ${hijri.monthNameEn} ${hijri.year} AH`
                : "—"}
            </span>
            <span className="hidden sm:inline opacity-60">·</span>
            {/* Live clock */}
            <span className="hidden sm:inline-flex items-center gap-1 tabular-nums opacity-80">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {clock}
            </span>
          </div>

          {/* Prayer times */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="opacity-80">{t.utility.prayersLabel}</span>
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap justify-center">
              {cairoPrayerTimes.map((p) => {
                const isNext = next?.prayer.key === p.key;
                return (
                  <div
                    key={p.key}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                      isNext
                        ? "bg-copper/15 border border-copper/40 text-copper"
                        : ""
                    }`}
                  >
                    <span className="font-medium">{prayerLabels[p.key]}</span>
                    <span className="tabular-nums">
                      {pad(p.h)}:{pad(p.m)}
                    </span>
                    {isNext && next && (
                      <span className="font-semibold ms-1">
                        {t.utility.inTime} {formatCountdown(next.diffMs)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

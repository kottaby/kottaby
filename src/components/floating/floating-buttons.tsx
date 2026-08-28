"use client";

import * as React from "react";
import { Phone, ArrowUp } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FloatingButtons() {
  const { t, dir } = useLocale();
  const [showTop, setShowTop] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let ticking = false;
    const update = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      const pct = height > 0 ? Math.min(100, Math.max(0, (scrollTop / height) * 100)) : 0;
      setProgress(pct);
      setShowTop(scrollTop > 400);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // SVG circle progress ring geometry
  const size = 44;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div
      dir={dir}
      className="fixed bottom-5 end-5 z-40 flex flex-col items-center gap-3 print:hidden"
    >
      {/* Back to top with scroll-percentage ring */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label={t.common.backToTop}
        className={`group relative flex h-11 w-11 items-center justify-center rounded-full border border-copper/40 bg-background/80 backdrop-blur-md text-copper shadow-md transition-all hover:border-copper hover:shadow-[0_0_15px_rgba(224,152,92,0.4)] hover:-translate-y-0.5 ${
          showTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* SVG progress ring */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-copper/15"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="text-copper transition-[stroke-dashoffset] duration-150 ease-out"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <ArrowUp className="relative h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
        {/* Percentage label — appears on hover */}
        <span className="pointer-events-none absolute -start-12 rounded-md bg-card border border-border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-copper opacity-0 transition-opacity group-hover:opacity-100">
          {Math.round(progress)}%
        </span>
      </button>

      {/* WhatsApp */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.common.chatWhatsapp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[0_4px_20px_rgba(37,211,102,0.4)] transition-all hover:-translate-y-0.5 hover:scale-105"
            >
              <Phone className="h-5 w-5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side={dir === "rtl" ? "left" : "right"}>
            {t.common.chatWhatsapp}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

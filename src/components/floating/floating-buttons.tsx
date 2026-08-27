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

  React.useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      dir={dir}
      className="fixed bottom-5 end-5 z-40 flex flex-col items-center gap-3 print:hidden"
    >
      {/* Back to top */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label={t.common.backToTop}
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-copper/40 bg-background/80 backdrop-blur-md text-copper shadow-md transition-all hover:border-copper hover:shadow-[0_0_15px_rgba(224,152,92,0.4)] hover:-translate-y-0.5 ${
          showTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <ArrowUp className="h-4 w-4" />
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

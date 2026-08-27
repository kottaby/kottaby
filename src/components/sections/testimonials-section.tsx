"use client";

import * as React from "react";
import { Star, Quote } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";
import { SectionHeader } from "./section-header";
import { getInitials } from "@/lib/data";
import { motion } from "framer-motion";

export function TestimonialsSection() {
  const { t, dir } = useLocale();
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  // Auto-advance every 6s, pauses on hover or when tab is hidden.
  React.useEffect(() => {
    if (!api || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      api.scrollNext();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [api, paused]);

  return (
    <section
      id="testimonials"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Testimonials"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.testimonials.badge}
          title={t.testimonials.title}
          subtitle={t.testimonials.subtitle}
        />

        <div
          className="mt-14 max-w-3xl mx-auto px-4 sm:px-12"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Carousel
            setApi={setApi}
            opts={{ loop: true, align: "center", direction: dir === "rtl" ? "rtl" : "ltr" }}
          >
            <CarouselContent>
              {t.testimonials.items.map((testimonial, i) => (
                <CarouselItem key={i}>
                  <motion.blockquote
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="relative flex flex-col gap-5 rounded-3xl border border-border bg-card p-8 md:p-10 shadow-sm"
                  >
                    {/* Large quote mark */}
                    <Quote
                      className="h-10 w-10 text-copper/30"
                      aria-hidden
                    />

                    {/* 5 stars */}
                    <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                      {[0, 1, 2, 3, 4].map((s) => (
                        <Star key={s} className="h-5 w-5 fill-copper stroke-copper" />
                      ))}
                    </div>

                    {/* Quote */}
                    <p className="text-base md:text-lg leading-relaxed text-foreground/90">
                      “{testimonial.quote}”
                    </p>

                    {/* Author */}
                    <footer className="flex items-center gap-3 border-t border-border/60 pt-4 mt-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BA0] to-[#E0985C] text-sm font-bold text-white">
                        {getInitials(testimonial.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </footer>
                  </motion.blockquote>
                </CarouselItem>
              ))}
            </CarouselContent>

            <CarouselPrevious className="hidden sm:inline-flex hover:border-copper hover:text-copper" />
            <CarouselNext className="hidden sm:inline-flex hover:border-copper hover:text-copper" />
          </Carousel>

          {/* Dots */}
          {count > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === current ? "w-8 bg-copper" : "w-2 bg-border hover:bg-copper/50"
                  }`}
                  onClick={() => api?.scrollTo(i)}
                />
              ))}
            </div>
          )}

          {/* Mobile swipe hint */}
          {count > 1 && (
            <p className="mt-3 text-center text-[10px] text-muted-foreground/60 sm:hidden">
              ← Swipe →
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

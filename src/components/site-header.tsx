"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Globe,
  Sun,
  Moon,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { useLocale } from "@/lib/i18n/locale-context";
import { sectionIds } from "@/lib/data";

export function SiteHeader() {
  const { locale, setLocale, t, dir } = useLocale();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy with IntersectionObserver
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.1, 0.3, 0.5, 1] }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  const toggleLocale = () => setLocale(locale === "ar" ? "en" : "ar");

  const navItems = sectionIds.map((id) => ({
    href: `#${id}`,
    label: t.nav[id],
    id,
  }));

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-[var(--header-bg)]/80 backdrop-blur-xl border-b border-border shadow-sm"
          : "bg-transparent"
      }`}
      dir={dir}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="#" className="flex items-center gap-2.5 group shrink-0" aria-label={t.common.brand}>
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-copper/20 group-hover:bg-copper/30 transition-colors" />
              <span className="relative h-3 w-3 rounded-full bg-copper glow-copper" />
            </span>
            <span className="font-extrabold text-base tracking-tight" style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}>
              {t.common.brand}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`relative px-3 py-2 text-sm font-medium rounded-md transition-colors hover:text-copper ${
                  activeSection === item.id ? "text-copper" : "text-muted-foreground"
                }`}
              >
                {item.label}
                {activeSection === item.id && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-copper" />
                )}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLocale}
              aria-label="Toggle language"
              className="text-muted-foreground hover:text-copper"
            >
              <Globe className="h-[1.1rem] w-[1.1rem]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="text-muted-foreground hover:text-copper"
            >
              {mounted && theme === "dark" ? (
                <Sun className="h-[1.1rem] w-[1.1rem]" />
              ) : (
                <Moon className="h-[1.1rem] w-[1.1rem]" />
              )}
            </Button>

            <div className="hidden md:flex items-center gap-2 ms-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {t.common.signIn}
              </Button>
              <Button
                size="sm"
                className="bg-copper text-copper-foreground hover:bg-copper/90 shadow-sm"
              >
                {t.common.getStarted}
              </Button>
            </div>

            {/* Mobile menu */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-full max-w-xs p-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                  <SheetTitle className="flex items-center gap-2.5">
                    <span className="relative flex h-8 w-8 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-copper/20" />
                      <span className="relative h-3 w-3 rounded-full bg-copper" />
                    </span>
                    <span className="font-extrabold">{t.common.brand}</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-4" aria-label="Mobile navigation">
                  {navItems.map((item) => (
                    <SheetClose asChild key={item.id}>
                      <Link
                        href={item.href}
                        className={`px-4 py-2.5 rounded-md text-sm font-medium transition-colors hover:bg-accent ${
                          activeSection === item.id ? "text-copper bg-accent/50" : "text-foreground"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="px-4 pb-6 mt-auto space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={toggleLocale}
                    >
                      <Globe className="h-4 w-4" />
                      {locale === "ar" ? "English" : "العربية"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={toggleTheme}
                    >
                      {mounted && theme === "dark" ? (
                        <>
                          <Sun className="h-4 w-4" /> Light
                        </>
                      ) : (
                        <>
                          <Moon className="h-4 w-4" /> Dark
                        </>
                      )}
                    </Button>
                  </div>
                  <Button variant="ghost" className="w-full">
                    {t.common.signIn}
                  </Button>
                  <SheetClose asChild>
                    <Button className="w-full bg-copper text-copper-foreground hover:bg-copper/90">
                      {t.common.getStarted}
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

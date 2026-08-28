"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

const STORAGE_KEY = "kottaby-cookie-consent";

interface ConsentState {
  accepted: boolean;
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_STATE: ConsentState = {
  accepted: false,
  necessary: true,
  analytics: false,
  marketing: false,
};

export function CookieConsent() {
  const { t, dir } = useLocale();
  const [state, setState] = React.useState<ConsentState>(DEFAULT_STATE);
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setState(JSON.parse(stored) as ConsentState);
      }
    } catch {
      // ignore
    }
    try {
      const d = window.sessionStorage.getItem("kottaby-cookie-dismissed");
      if (d === "1") setDismissed(true);
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: ConsentState) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const acceptAll = () =>
    persist({ accepted: true, necessary: true, analytics: true, marketing: true });
  const decline = () =>
    persist({ accepted: true, necessary: true, analytics: false, marketing: false });

  // Temporary dismiss (this session only) — banner stays gone until next visit,
  // but no consent is recorded so we re-prompt on return.
  const tempDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem("kottaby-cookie-dismissed", "1");
    } catch {
      // ignore
    }
  };

  const savePreferences = () => {
    persist({ ...state, accepted: true, necessary: true });
    setOpen(false);
  };

  if (!mounted || state.accepted || dismissed) return null;

  return (
    <div
      dir={dir}
      className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 print:hidden animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label={t.cookie.title}
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-copper/30 bg-card/95 shadow-2xl backdrop-blur-md p-4 sm:p-5">
        {/* Temporary dismiss (X) — top-end corner */}
        <button
          type="button"
          onClick={tempDismiss}
          aria-label={t.common.decline}
          className="absolute top-2 end-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 pe-6">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">{t.cookie.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.cookie.body}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={acceptAll}
              className="h-8 bg-copper text-copper-foreground hover:bg-copper/90"
            >
              {t.common.acceptAll}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={decline}
              className="h-8 hover:border-copper hover:text-copper"
            >
              {t.common.decline}
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 text-xs">
                  {t.common.cookieSettings}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.common.cookieSettings}</DialogTitle>
                  <DialogDescription>{t.cookie.body}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                  <PrefRow
                    label={t.common.necessary}
                    description={t.cookie.body}
                    checked
                    locked
                  />
                  <PrefRow
                    label={t.common.analytics}
                    description={t.cookie.body}
                    checked={state.analytics}
                    onCheckedChange={(v) => setState((s) => ({ ...s, analytics: v }))}
                  />
                  <PrefRow
                    label={t.common.marketing}
                    description={t.cookie.body}
                    checked={state.marketing}
                    onCheckedChange={(v) => setState((s) => ({ ...s, marketing: v }))}
                  />
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">
                      {t.common.decline}
                    </Button>
                  </DialogClose>
                  <Button
                    size="sm"
                    onClick={savePreferences}
                    className="bg-copper text-copper-foreground hover:bg-copper/90"
                  >
                    {t.common.savePreferences}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrefRow({
  label,
  description,
  checked,
  locked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onCheckedChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/50 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
      </div>
      <Switch checked={checked} disabled={locked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

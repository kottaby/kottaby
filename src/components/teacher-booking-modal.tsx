"use client";

import * as React from "react";
import { Star, MapPin, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/lib/i18n/locale-context";
import { getInitials } from "@/lib/data";

export interface Teacher {
  name: string;
  specialty: string;
  location: string;
  rating: number;
  sessions: number;
}

interface TeacherBookingModalProps {
  teacher: Teacher | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIME_SLOTS = [
  "06:00",
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
];

const RECITATIONS = [
  "Hafs 'an Asim",
  "Warsh 'an Nafi'",
  "Qalun 'an Nafi'",
  "Al-Duri 'an Abu Amr",
  "Khalaf 'an Hamzah",
  "Shu'bah 'an Asim",
];

export function TeacherBookingModal({
  teacher,
  open,
  onOpenChange,
}: TeacherBookingModalProps) {
  const { t, dir, locale } = useLocale();
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [recitation, setRecitation] = React.useState(RECITATIONS[0]);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset state when modal closes / teacher changes
  React.useEffect(() => {
    if (!open) {
      setDate("");
      setTime("");
      setRecitation(RECITATIONS[0]);
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  // Build date options localized
  const dateOptions = React.useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const value = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(
        locale === "ar" ? "ar-EG" : "en-US",
        { weekday: "short", month: "short", day: "numeric" }
      );
      out.push({ value, label });
    }
    return out;
  }, [locale]);

  if (!teacher) return null;
  const initials = getInitials(teacher.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error(
        locale === "ar" ? "يرجى اختيار التاريخ والوقت" : "Please select a date and time"
      );
      return;
    }
    if (!teacher) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherName: teacher.name,
          teacherNameAr: teacher.name,
          recitation,
          date,
          time,
          notes,
          locale,
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setSubmitting(false);
      onOpenChange(false);
      toast.success(t.teachers.booking.successTitle, {
        description: t.teachers.booking.successDesc,
      });
    } catch {
      setSubmitting(false);
      toast.error(t.teachers.booking.errorTitle, {
        description: t.teachers.booking.errorDesc,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t.teachers.booking.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {t.teachers.booking.title}
          </DialogDescription>
        </DialogHeader>

        {/* Teacher summary */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BA0] to-[#E0985C] text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-semibold truncate"
              style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
              lang={dir === "rtl" ? "ar" : "en"}
            >
              {teacher.name}
            </p>
            <p className="text-xs text-copper truncate">{teacher.specialty}</p>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-copper stroke-copper" />
                {teacher.rating.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {teacher.location}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recitation */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t.teachers.booking.recitationLabel}
            </Label>
            <Select value={recitation} onValueChange={setRecitation}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECITATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t.teachers.booking.dateLabel}
              </Label>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.teachers.booking.selectDate} />
                </SelectTrigger>
                <SelectContent>
                  {dateOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t.teachers.booking.timeLabel}
              </Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.teachers.booking.selectTime} />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((tm) => (
                    <SelectItem key={tm} value={tm}>
                      {tm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration hint */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t.teachers.booking.durationLabel}: 30 {t.teachers.booking.durationMinutes}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t.teachers.booking.notesLabel}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.teachers.booking.notesPlaceholder}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-copper text-copper-foreground hover:bg-copper/90"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t.common.send}...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {t.teachers.booking.submit}
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

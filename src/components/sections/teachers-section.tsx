"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Star, MapPin, ArrowRight } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { teacherGradients, getInitials } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "./section-header";
import {
  TeacherBookingModal,
  type Teacher,
} from "@/components/teacher-booking-modal";

export function TeachersSection() {
  const { t, dir } = useLocale();
  const [bookingTeacher, setBookingTeacher] = React.useState<Teacher | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const openBooking = (teacher: Teacher) => {
    setBookingTeacher(teacher);
    setModalOpen(true);
  };

  return (
    <section
      id="teachers"
      dir={dir}
      className="py-20 md:py-28 scroll-mt-20"
      aria-label="Teachers"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={t.teachers.badge}
          title={t.teachers.title}
          subtitle={t.teachers.subtitle}
        />

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.teachers.items.map((teacher, i) => {
            const gradient = teacherGradients[i % teacherGradients.length];
            const initials = getInitials(teacher.name);
            return (
              <motion.article
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-copper/40 hover:shadow-lg hover:shadow-[0_0_25px_rgba(224,152,92,0.1)]"
              >
                {/* Gradient avatar */}
                <div className="flex justify-center">
                  <div
                    className={`flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${gradient} ring-2 ring-border group-hover:ring-copper/40 transition-all shadow-lg`}
                    aria-hidden
                  >
                    <span className="text-xl font-bold text-white">
                      {initials}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center text-center gap-1.5">
                  <h3
                    className="text-base font-semibold leading-tight"
                    style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}
                    lang={dir === "rtl" ? "ar" : "en"}
                  >
                    {teacher.name}
                  </h3>
                  <p className="text-xs text-copper font-medium">{teacher.specialty}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {teacher.location}
                  </p>
                </div>

                {/* Rating + sessions */}
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-copper stroke-copper" />
                    <span className="font-semibold tabular-nums">{teacher.rating.toFixed(1)}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {teacher.sessions.toLocaleString()} {t.teachers.sessions}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBooking(teacher as unknown as Teacher)}
                  className="w-full mt-1 hover:border-copper hover:text-copper"
                >
                  {t.common.bookSession}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>
              </motion.article>
            );
          })}
        </div>
      </div>

      <TeacherBookingModal
        teacher={bookingTeacher}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </section>
  );
}

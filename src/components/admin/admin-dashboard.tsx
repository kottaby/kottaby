"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Users,
  Calendar,
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Gift,
  GraduationCap,
  Search,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

interface AdminStats {
  students: number;
  trialGranted: number;
  bookings: number;
  pendingBookings: number;
  newsletter: number;
  contacts: number;
}

interface AdminStudent {
  id: string;
  email: string;
  fullName: string;
  role: string;
  balanceTrial: number;
  balanceHifz: number;
  balanceTajweed: number;
  balanceReviews: number;
  trialGrantedAt: string | null;
  locale: string;
  createdAt: string;
  eligible: boolean;
  hasTrial: boolean;
}

interface AdminBooking {
  id: string;
  teacherName: string;
  recitation: string;
  date: string;
  time: string;
  notes: string;
  locale: string;
  status: string;
  createdAt: string;
}

interface AdminContact {
  id: string;
  email: string;
  message: string;
  locale: string;
  createdAt: string;
}

interface AdminSubscriber {
  id: string;
  email: string;
  locale: string;
  createdAt: string;
}

// ─── Stat Card ───────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  delay,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        "rounded-xl border p-4 flex items-center gap-3",
        accent
          ? "border-copper/40 bg-copper/5"
          : "border-border bg-card/60",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
          accent ? "bg-copper/15 text-copper" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </p>
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      </div>
    </motion.div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: AdminStats | null }) {
  const { t } = useLocale();
  if (!stats) return <LoadingState />;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-1">
      <StatCard icon={GraduationCap} label={t.admin.totalStudents} value={stats.students} delay={0} />
      <StatCard icon={Gift} label={t.admin.trialGrants} value={stats.trialGranted} accent delay={0.05} />
      <StatCard icon={Calendar} label={t.admin.totalBookings} value={stats.bookings} delay={0.1} />
      <StatCard icon={Calendar} label={t.admin.pendingBookings} value={stats.pendingBookings} delay={0.15} />
      <StatCard icon={Mail} label={t.admin.newsletterSubs} value={stats.newsletter} delay={0.2} />
      <StatCard icon={Mail} label={t.admin.contactMsgs} value={stats.contacts} delay={0.25} />
    </div>
  );
}

// ─── Students Tab ────────────────────────────────────────────────

function StudentsTab({ students }: { students: AdminStudent[] | null }) {
  const { t } = useLocale();
  if (students === null) return <LoadingState />;
  if (students.length === 0) return <EmptyState text={t.admin.noData} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border max-h-[50vh] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr>
            <th className="text-start p-2 font-semibold">{t.admin.fullName}</th>
            <th className="text-start p-2 font-semibold">{t.admin.email}</th>
            <th className="text-start p-2 font-semibold">{t.admin.role}</th>
            <th className="text-center p-2 font-semibold">{t.admin.trial}</th>
            <th className="text-center p-2 font-semibold">{t.admin.eligible}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="p-2 font-medium truncate max-w-[120px]">{s.fullName}</td>
              <td className="p-2 text-muted-foreground truncate max-w-[140px]">{s.email}</td>
              <td className="p-2">
                <Badge variant="outline" className="text-[10px]">
                  {s.role === "student" ? t.admin.studentRole : s.role === "teacher" ? t.admin.teacherRole : t.admin.parentRole}
                </Badge>
              </td>
              <td className="p-2 text-center">
                {s.trialGrantedAt ? (
                  <span className="inline-flex items-center gap-0.5 text-copper">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{s.balanceTrial}</span>
                  </span>
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground inline" />
                )}
              </td>
              <td className="p-2 text-center">
                {s.eligible ? (
                  <Badge className="bg-green-500/15 text-green-500 border-0 text-[10px]">{t.admin.yes}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{t.admin.no}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Bookings Tab ────────────────────────────────────────────────

function BookingsTab({ bookings }: { bookings: AdminBooking[] | null }) {
  const { t } = useLocale();
  if (bookings === null) return <LoadingState />;
  if (bookings.length === 0) return <EmptyState text={t.admin.noData} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border max-h-[50vh] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr>
            <th className="text-start p-2 font-semibold">{t.admin.teacher}</th>
            <th className="text-start p-2 font-semibold">{t.admin.recitation}</th>
            <th className="text-start p-2 font-semibold">{t.admin.date}</th>
            <th className="text-start p-2 font-semibold">{t.admin.time}</th>
            <th className="text-center p-2 font-semibold">{t.admin.status}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="p-2 font-medium truncate max-w-[120px]">{b.teacherName}</td>
              <td className="p-2 text-muted-foreground truncate max-w-[120px]">{b.recitation}</td>
              <td className="p-2 tabular-nums">{b.date}</td>
              <td className="p-2 tabular-nums">{b.time}</td>
              <td className="p-2 text-center">
                <Badge
                  className={cn(
                    "border-0 text-[10px]",
                    b.status === "pending"
                      ? "bg-amber-500/15 text-amber-500"
                      : "bg-green-500/15 text-green-500",
                  )}
                >
                  {b.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Messages Tab ────────────────────────────────────────────────

function MessagesTab({
  contacts,
  subscribers,
}: {
  contacts: AdminContact[] | null;
  subscribers: AdminSubscriber[] | null;
}) {
  const { t } = useLocale();
  if (contacts === null || subscribers === null) return <LoadingState />;
  return (
    <div className="space-y-4">
      {/* Contact messages */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {t.admin.contactMsgs} ({contacts.length})
        </h4>
        {contacts.length === 0 ? (
          <EmptyState text={t.admin.noData} />
        ) : (
          <div className="space-y-2 max-h-[20vh] overflow-y-auto">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card/60 p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium truncate">{c.email}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{c.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Newsletter subscribers */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {t.admin.newsletterSubs} ({subscribers.length})
        </h4>
        {subscribers.length === 0 ? (
          <EmptyState text={t.admin.noData} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[20vh] overflow-y-auto">
            {subscribers.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card/60 p-2 flex items-center justify-between gap-2">
                <span className="text-xs truncate">{s.email}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{s.locale}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Eligibility Checker ─────────────────────────────────────────

function EligibilityChecker() {
  const { t } = useLocale();
  const [studentId, setStudentId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{
    eligible: boolean;
    hasTrial: boolean;
    hasPaid: boolean;
    balanceTrial: number;
    student?: { fullName: string; email: string; role: string };
  } | null>(null);

  const check = async () => {
    if (!studentId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/students/${studentId.trim()}`);
      const data = await res.json();
      if (data.ok) {
        setResult({
          eligible: data.eligibility.eligible,
          hasTrial: data.eligibility.hasTrial,
          hasPaid: data.eligibility.hasPaid,
          balanceTrial: data.student.balanceTrial,
          student: {
            fullName: data.student.fullName,
            email: data.student.email,
            role: data.student.role,
          },
        });
      } else {
        setResult({ eligible: false, hasTrial: false, hasPaid: false, balanceTrial: 0 });
      }
    } catch {
      setResult({ eligible: false, hasTrial: false, hasPaid: false, balanceTrial: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-copper/30 bg-copper/5 p-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-copper flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        {t.admin.checkEligibility}
      </h4>
      <div className="flex gap-2">
        <Input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder={t.admin.enterStudentId}
          className="h-8 text-xs font-mono"
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        <Button size="sm" onClick={check} disabled={loading} className="h-8 bg-copper text-copper-foreground hover:bg-copper/90 shrink-0">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : t.admin.check}
        </Button>
      </div>
      {result && (
        <div className="text-xs space-y-1 pt-1">
          {result.student ? (
            <>
              <p className="font-medium">{result.student.fullName} — {result.student.email}</p>
              <p className="text-muted-foreground">
                {t.admin.trial}: {result.balanceTrial} | {t.admin.eligible}:{" "}
                <span className={result.eligible ? "text-green-500 font-medium" : "text-destructive"}>
                  {result.eligible ? t.admin.yes : t.admin.no}
                </span>
              </p>
            </>
          ) : (
            <p className="text-destructive">{t.admin.noData}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading / Empty helpers ─────────────────────────────────────

function LoadingState() {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{t.admin.loading}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
      {text}
    </div>
  );
}

// ─── Main AdminDashboard Dialog ──────────────────────────────────

export function AdminDashboard() {
  const { t, dir } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [students, setStudents] = React.useState<AdminStudent[] | null>(null);
  const [bookings, setBookings] = React.useState<AdminBooking[] | null>(null);
  const [contacts, setContacts] = React.useState<AdminContact[] | null>(null);
  const [subscribers, setSubscribers] = React.useState<AdminSubscriber[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, studentsRes, bookingsRes, messagesRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/students?limit=50"),
        fetch("/api/admin/bookings?limit=50"),
        fetch("/api/admin/messages?limit=50"),
      ]);
      const [statsData, studentsData, bookingsData, messagesData] = await Promise.all([
        statsRes.json(),
        studentsRes.json(),
        bookingsRes.json(),
        messagesRes.json(),
      ]);
      if (statsData.ok) setStats(statsData.stats);
      if (studentsData.ok) setStudents(studentsData.students);
      if (bookingsData.ok) setBookings(bookingsData.bookings);
      if (messagesData.ok) {
        setContacts(messagesData.contacts);
        setSubscribers(messagesData.subscribers);
      }
    } catch {
      // ignore — stale state shown
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && stats === null) {
      fetchAll();
    }
  }, [open, stats, fetchAll]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t.admin.trigger}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground transition-all hover:text-copper hover:border-copper/40"
        >
          <Shield className="h-3.5 w-3.5" />
          {t.admin.trigger}
        </button>
      </DialogTrigger>
      <DialogContent
        dir={dir}
        className="sm:max-w-3xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-copper" />
              {t.admin.title}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAll}
              disabled={loading}
              className="h-7 text-xs hover:border-copper hover:text-copper"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t.admin.refresh}
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 w-full h-9">
            <TabsTrigger value="overview" className="text-xs">{t.admin.overview}</TabsTrigger>
            <TabsTrigger value="students" className="text-xs">{t.admin.students}</TabsTrigger>
            <TabsTrigger value="bookings" className="text-xs">{t.admin.bookings}</TabsTrigger>
            <TabsTrigger value="messages" className="text-xs">{t.admin.messages}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab stats={stats} />
            <div className="mt-4">
              <EligibilityChecker />
            </div>
          </TabsContent>

          <TabsContent value="students" className="mt-4">
            <StudentsTab students={students} />
          </TabsContent>

          <TabsContent value="bookings" className="mt-4">
            <BookingsTab bookings={bookings} />
          </TabsContent>

          <TabsContent value="messages" className="mt-4">
            <MessagesTab contacts={contacts} subscribers={subscribers} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Static content + icon mapping for Kottaby Academy sections.
// (Recitations + teachers + prayers + partners + curriculum + how-it-works +
//  roles + features + achievements + testimonials + resources are all static
//  marketing content here; only newsletter subscribers and contact messages
//  go to the database.)

import {
  BadgeCheck,
  BookOpen,
  TrendingUp,
  ShieldCheck,
  CalendarClock,
  Wallet,
  UserPlus,
  Search,
  GraduationCap,
  Presentation,
  Users,
  Type,
  AudioLines,
  BookMarked,
  Library,
  Award,
  type LucideIcon,
} from "lucide-react";

export const featureIcons: LucideIcon[] = [
  BadgeCheck,
  BookOpen,
  TrendingUp,
  ShieldCheck,
  CalendarClock,
  Wallet,
];

export const howItWorksIcons: LucideIcon[] = [UserPlus, Search, GraduationCap];

export const rolesIcons: LucideIcon[] = [GraduationCap, Presentation, Users];

export const curriculumIcons: LucideIcon[] = [
  Type,
  AudioLines,
  BookMarked,
  Library,
  Award,
];

// Approximate Cairo prayer times in {h, m} (24h)
export interface PrayerTime {
  key: "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
  h: number;
  m: number;
}

export const cairoPrayerTimes: PrayerTime[] = [
  { key: "fajr", h: 4, m: 32 },
  { key: "sunrise", h: 6, m: 2 },
  { key: "dhuhr", h: 12, m: 0 },
  { key: "asr", h: 15, m: 30 },
  { key: "maghrib", h: 18, m: 0 },
  { key: "isha", h: 19, m: 30 },
];

// Gradient avatars for teachers — pick gradient based on index
export const teacherGradients = [
  "from-[#3D6BA0] to-[#E0985C]",
  "from-[#E0985C] to-[#1B3358]",
  "from-[#1B3358] to-[#3D6BA0]",
  "from-[#16264A] to-[#E0985C]",
];

// Section IDs for nav scroll-spy
export const sectionIds = [
  "features",
  "recitations",
  "how-it-works",
  "roles",
  "teachers",
  "pricing",
  "faq",
  "resources",
] as const;

export type SectionId = (typeof sectionIds)[number];

// Pricing icons not needed — features are checkmarks.
// Helper: validate email
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Count-up hook support
export function getInitials(name: string): string {
  // For Arabic names, take first letter of first two words.
  // For English, take first letters of first two words.
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

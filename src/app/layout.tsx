import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { Toaster } from "@/components/ui/sonner";
import { FloatingButtons } from "@/components/floating/floating-buttons";
import { CookieConsent } from "@/components/floating/cookie-consent";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kottaby Academy | Learn the Quran with certified Shuyukh",
  description:
    "A modern platform that connects students with certified Quran reciters and teachers across all 10 Qira'at. Track progress, master Tajweed, preserve your recitation chain.",
  keywords: [
    "Quran",
    "Tajweed",
    "Qira'at",
    "Ijazah",
    "Islamic education",
    "Shuyukh",
    "Kottaby",
    "Hifz",
  ],
  authors: [{ name: "Kottaby Academy" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Kottaby Academy",
    description:
      "Connect with certified Shuyukh and learn the 10 canonical Qira'at. Track your progress, master Tajweed, preserve your recitation chain.",
    siteName: "Kottaby Academy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kottaby Academy",
    description:
      "Connect with certified Shuyukh and learn the 10 canonical Qira'at.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={`${cairo.variable} ${inter.variable}`}>
      <body className="bg-background text-foreground min-h-screen flex flex-col antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <LocaleProvider>
            <main className="flex-1">{children}</main>
            <FloatingButtons />
            <CookieConsent />
            <Toaster position="top-center" richColors />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

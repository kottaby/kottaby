import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { Toaster } from "@/components/ui/sonner";
import { FloatingButtons } from "@/components/floating/floating-buttons";
import { CookieConsent } from "@/components/floating/cookie-consent";
import { ReadingProgressBar } from "@/components/floating/reading-progress-bar";
import { JsonLd } from "@/components/seo/json-ld";

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
  title: "كُتّابي أكاديمي | تعلّم القرآن الكريم مع شيوخ معتمدين",
  description:
    "منصة عصرية تربط الطلاب بالشيوخ المعتمدين في القراءات العشر. تتبع تقدمك، أتقن التجويد، واحفظ سندك.",
  keywords: [
    "القرآن",
    "التجويد",
    "القراءات",
    "الإجازة",
    "التعليم الإسلامي",
    "الشيوخ",
    "كُتّابي",
    "الحفظ",
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
        <JsonLd />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <LocaleProvider>
            <ReadingProgressBar />
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

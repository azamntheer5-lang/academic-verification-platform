import type { Metadata } from "next";
import { Geist, Geist_Mono, Cairo, Amiri } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Cairo — executive Arabic typeface (primary). Amiri kept as a display
// fallback for ornamental quote blocks.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "منصة التحقق الأكاديمي الشاملة | تطوير Azzam",
  description:
    "منصة احترافية للتحقق من توثيقات البحث العلمي: تشريح عميق لملف PDF + اتصال سحابي بالمكتبات العالمية (Google Books + Open Library) مع توليد توثيق APA جاهز للنسخ.",
  keywords: [
    "توثيق مراجع",
    "بحث ماجستير",
    "APA",
    "MLA",
    "Chicago",
    "Google Books",
    "Open Library",
    "مدقق اقتباسات",
    "محرك هجين",
  ],
  authors: [{ name: "Academic Verification Platform" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} ${amiri.variable} antialiased bg-background text-foreground font-[var(--font-cairo)]`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

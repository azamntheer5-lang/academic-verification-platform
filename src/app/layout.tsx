import type { Metadata } from "next";
import { Geist, Geist_Mono, Amiri } from "next/font/google";
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

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "مُدقِّق المراجع الأكاديمي — توثيق موثوق برقم الصفحة",
  description:
    "أداة للباحثين: الصق بحثك فيتولّى الذكاء الاصطناعي استخراج كل توثيق، ثم يبحث في المكتبات الإلكترونية الحقيقية للتأكد من اسم المؤلف ورقم الصفحة وسنة النشر.",
  keywords: [
    "توثيق مراجع",
    "بحث ماجستير",
    "APA",
    "MLA",
    "Chicago",
    "Open Library",
    "مدقق اقتباسات",
  ],
  authors: [{ name: "Reference Checker" }],
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
        className={`${geistSans.variable} ${geistMono.variable} ${amiri.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

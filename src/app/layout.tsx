import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "FX·TERMINAL — بث العملات المباشر",
  description:
    "لوحة بث مباشر لأسعار العملات والذهب والعملات الرقمية بتصميم ترمينال هاكر — تحديثات لحظية عبر WebSocket.",
  keywords: [
    "بث العملات",
    "أسعار صرف",
    "فوركس",
    "بيتكوين",
    "ذهب",
    "live currency",
    "forex terminal",
  ],
  authors: [{ name: "FX Terminal" }],
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
    <html lang="ar" dir="rtl" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

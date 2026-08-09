import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Advanced React Three Fiber — PMNDRS workshop, Paris, Sep 8–9 2026",
  description:
    "Two days in Paris: one day learning React Three Fiber v10 and the pmndrs ecosystem, one day building with it. Thirty seats, at Gobelins, alongside three.js conf.",
  openGraph: {
    title: "Advanced React Three Fiber — PMNDRS workshop, Paris",
    description:
      "September 8 & 9, 2026 · Gobelins, Paris. One teaching day, one build day. Thirty seats.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Dark-only by design — there is no theme toggle, so the class is fixed.
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

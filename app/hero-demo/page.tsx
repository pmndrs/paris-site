import type { Metadata } from "next";

import { HeroDemo } from "@/components/hero-demo/hero-demo";

export const metadata: Metadata = {
  title: "Hero demo",
  // A lab page, not site content — keep it out of search results.
  robots: { index: false, follow: false },
};

export default function HeroDemoPage() {
  return <HeroDemo />;
}

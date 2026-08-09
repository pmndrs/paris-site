import { Hero } from "@/components/hero/hero";
import { Closer } from "@/components/sections/closer";
import { Faq } from "@/components/sections/faq";
import { Instructors } from "@/components/sections/instructors";
import { Outcomes } from "@/components/sections/outcomes";
import { Overview } from "@/components/sections/overview";
import { Setup } from "@/components/sections/setup";
import { TwoDays } from "@/components/sections/two-days";
import { Venue } from "@/components/sections/venue";
import { Why } from "@/components/sections/why";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function Page() {
  return (
    <>
      <SiteHeader />
      <Hero />
      <main className="relative z-10 bg-background">
        <Overview />
        <Why />
        <Outcomes />
        <TwoDays />
        <Instructors />
        <Setup />
        <Venue />
        <Faq />
        <Closer />
        <SiteFooter />
      </main>
    </>
  );
}

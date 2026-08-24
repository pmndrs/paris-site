import { Hero } from "@/components/hero/hero";
import { Closer } from "@/components/sections/closer";
import { Faq } from "@/components/sections/faq";
import { Outcomes } from "@/components/sections/outcomes";
import { Overview } from "@/components/sections/overview";
import { Setup } from "@/components/sections/setup";
import { TwoDays } from "@/components/sections/two-days";
import { Venue } from "@/components/sections/venue";
import { Why } from "@/components/sections/why";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ConnectorsCanvas } from "@/components/three/scenes";

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
        <Setup />
        <Venue />
        <Faq />
        {/* The closer and the footer share one physics container, so it is
            mounted around both rather than inside either. The canvas layer sits
            at z-10 — over the closer's city poster and gradient, under the
            headline, the button and the footer links, which claim z-20. It also
            takes no pointer events: the cursor that pushes the pile around is
            read off `window`, so every link on top of it stays clickable. */}
        <div className="relative">
          <ConnectorsCanvas />
          <Closer />
          <SiteFooter />
        </div>
      </main>
    </>
  );
}

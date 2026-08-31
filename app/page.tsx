import { Hero } from "@/components/hero/hero";
import { LoadingScreen } from "@/components/loading-screen";
import { Closer } from "@/components/sections/closer";
import { Faq } from "@/components/sections/faq";
import { Outcomes } from "@/components/sections/outcomes";
import { Overview } from "@/components/sections/overview";
import { Setup } from "@/components/sections/setup";
import { TwoDays } from "@/components/sections/two-days";
import { Venue } from "@/components/sections/venue";
import { Why } from "@/components/sections/why";
import { SiteHeader } from "@/components/site-header";
import { ConnectorsCanvas } from "@/components/three/scenes";

export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const quiet = Object.prototype.hasOwnProperty.call(params, "quiet");

  return (
    <>
      <LoadingScreen />
      {!quiet && <SiteHeader />}
      <Hero quiet={quiet} />
      <main className="relative z-10 bg-background">
        <Overview />
        <Why />
        <Outcomes />
        <TwoDays />
        <Setup />
        <Venue />
        <Faq />
        {/* The physics layer sits over the closer's city poster and gradient,
            but under its headline and button. It takes no pointer events: the
            cursor that pushes the pile around is read off `window`, so the
            content above stays clickable. */}
        <div className="relative">
          <ConnectorsCanvas />
          <Closer />
        </div>
      </main>
    </>
  );
}

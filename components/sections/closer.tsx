import Image from "next/image";

import { SectionGate } from "@/components/sections/section-gate";
import { NoiseFieldCanvas } from "@/components/three/scenes";
import { Button } from "@/components/ui/button";
import { REGISTER_URL } from "@/lib/content";

export function Closer() {
  return (
    // Not built on `Section`, so the switch is wired up by hand.
    <SectionGate id="closer">
      <section className="relative overflow-hidden border-t border-border">
        <Image
          src="/concept/city-far.png"
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover opacity-[0.22]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black to-78%" />

        {/* Grayscale blob over the gradient — lifts the black without competing
          with the type sitting on it. */}
        <div className="pointer-events-none absolute inset-0">
          <NoiseFieldCanvas />
        </div>

        <div className="relative mx-auto flex max-w-[1180px] flex-col items-center gap-5.5 px-4 py-16 text-center sm:px-6 md:py-24 lg:px-10 lg:py-32">
          <div className="font-mono text-[11px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
            Forty seats · September 8 &amp; 9, 2026
          </div>
          <div className="max-w-[720px] text-[30px] leading-[1.05] font-semibold tracking-[-0.035em] md:text-[42px] lg:text-[52px]">
            Add the workshop to your conference ticket
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button asChild size="lg">
              <a href={REGISTER_URL}>Register on threejs.paris</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#two-days">Review the two days</a>
            </Button>
          </div>
        </div>
      </section>
    </SectionGate>
  );
}

import Image from "next/image";

import { SectionLink } from "@/components/section-link";
import { SectionGate } from "@/components/sections/section-gate";
import { Button } from "@/components/ui/button";
import { CLOSER, REGISTER_URL } from "@/lib/content";

/**
 * The closing call to action.
 *
 * The poster and its gradient belong to this section; the physics container
 * drifting over them does not — that one spans this section *and* the footer,
 * so it is mounted alongside both in `app/page.tsx`. Hence the `z-20` on the
 * content: it has to sit above a canvas that isn't a descendant of this element.
 */
export function Closer() {
  return (
    // Not built on `Section`, so the section switch is wired up by hand.
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

        <div className="relative z-20 mx-auto flex max-w-[1180px] flex-col items-center gap-5.5 px-4 py-16 text-center sm:px-6 md:py-24 lg:px-10 lg:py-32">
          <div className="font-mono text-[11px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
            {CLOSER.kicker}
          </div>
          <div className="max-w-[720px] text-[30px] leading-[1.05] font-semibold tracking-[-0.035em] md:text-[42px] lg:text-[52px]">
            {CLOSER.title}
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button asChild size="lg">
              <a href={REGISTER_URL}>{CLOSER.primary}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              {/* The closer only renders with extra sections on, but two-days
                  can still be off individually — same smart reveal as the hero. */}
              <SectionLink section="two-days">{CLOSER.secondary}</SectionLink>
            </Button>
          </div>
        </div>
      </section>
    </SectionGate>
  );
}

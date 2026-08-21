import { UserRoundIcon } from "lucide-react";

import { NoiseFieldCanvas } from "@/components/three/scenes";
import { PEOPLE, SECTION_COPY } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

export function Instructors() {
  return (
    <Section id="instructors" className="relative overflow-hidden">
      {/* Grayscale blob, drifting. It lifts a section that is otherwise four
          portrait squares on flat black, and it sits behind names and bios
          rather than behind a headline — so it stays low-contrast and slow. */}
      <div className="pointer-events-none absolute inset-0">
        <NoiseFieldCanvas />
      </div>

      <Wrap className="relative">
        <div className="eyebrow">{SECTION_COPY.instructors.eyebrow}</div>
        <SectionTitle>{SECTION_COPY.instructors.title}</SectionTitle>

        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PEOPLE.map(({ name, role, bio }) => (
            <div key={name} className="flex flex-col gap-3.5">
              {/* Placeholder until the four headshots land. An icon rather
                  than the word "portrait": it reads as a deliberately empty
                  avatar instead of a note to ourselves left on the page.
                  aria-hidden with the name alongside, so screen readers get
                  the person once rather than an anonymous graphic. */}
              <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-[#0d0d0f]">
                <UserRoundIcon
                  className="size-10 text-ghost"
                  strokeWidth={1.25}
                  aria-hidden
                />
              </div>
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.02em]">
                  {name}
                </div>
                <div className="mt-1 font-mono text-[11px] tracking-[0.08em] text-dim uppercase">
                  {role}
                </div>
                <div className="mt-2.5 text-sm leading-[1.55] text-muted-foreground">
                  {bio}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Wrap>
    </Section>
  );
}

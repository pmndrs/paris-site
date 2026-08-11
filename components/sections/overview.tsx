import { RevealGroup } from "@/components/motion/reveal";
import { SceneSlot } from "@/components/three/scene-slot";
import { FACTS } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

export function Overview() {
  return (
    <Section id="overview">
      <Wrap>
        <RevealGroup className="grid items-start gap-8 md:grid-cols-2 lg:gap-16">
          <div>
            <div className="eyebrow" data-reveal>
              01 · Overview
            </div>
            <SectionTitle data-reveal>
              Learn the pieces, then build with them
            </SectionTitle>
            <p
              className="mt-4 text-base leading-[1.65] text-muted-foreground"
              data-reveal
            >
              Day one is teaching. React Three Fiber v10 and what changed, then
              the wider React and pmndrs ecosystem around it: drei, the physics
              and post layers, state, loading, and how the pieces fit together
              when you are starting a real project.
            </p>
            <p
              className="mt-3.5 text-base leading-[1.65] text-muted-foreground"
              data-reveal
            >
              Day two is a hackathon. Three tracks, one day, a tech lead sitting
              with each track. You pick a track in the morning and have
              something running by the end of the afternoon.
            </p>

            <div
              className="hairline-grid mt-7 grid-cols-2 sm:grid-cols-4"
              data-reveal
            >
              {FACTS.map(({ k, v }) => (
                <div key={k} className="bg-background px-4.5 py-4">
                  <div className="font-mono text-[10px] tracking-[0.11em] text-faint uppercase">
                    {k}
                  </div>
                  <div className="mt-1.5 text-[15px] font-medium">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="overflow-hidden rounded-xl border border-border bg-card"
            data-reveal
          >
            {/* Poster only. The magic box lived here for a while and moved to
                the Outcomes cards, where it illustrates something; the block
                city is still the right subject for this slot, whether that ends
                up a live scene or a better frame. See SPEC.md §4. */}
            <SceneSlot
              poster="/concept/city-wide.png"
              alt="Concept frame of the block city at mid distance"
              sizes="(max-width: 768px) 100vw, 50vw"
              className="h-[240px] opacity-85 md:h-[300px] lg:h-[360px]"
            />
            <div className="border-t border-border px-4.5 py-4 font-mono text-[11px] text-faint">
              Concept frame · the block city at mid distance
            </div>
          </div>
        </RevealGroup>
      </Wrap>
    </Section>
  );
}

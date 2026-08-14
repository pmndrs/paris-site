import { ExploreLink } from "@/components/explore-link";
import { RevealGroup } from "@/components/motion/reveal";
import { FlipGridCanvas } from "@/components/three/scenes";
import { Card } from "@/components/ui/card";
import { WHY } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

/**
 * Forward-looking: what v10 and WebGPU make possible. The agentic point is one
 * card, not the thesis — see CONTENT.md §2.1.
 */
export function Why() {
  return (
    <Section id="why" className="relative overflow-hidden">
      {/* The tiles are the argument. Their state — flip angle, velocity, and how
          long each has left to hold — lives in a GPU storage buffer that a
          compute pass integrates; the CPU writes five floats a frame however
          many tiles there are. "Stays flipped for three seconds" is the part
          that can't be faked without somewhere to keep per-instance state,
          which is precisely what this section claims v10 buys.

          It brings its own positioned wrapper: that element is what the cursor
          is measured against. */}
      <FlipGridCanvas />

      <Wrap className="relative">
        <RevealGroup className="max-w-[820px]">
          <div className="eyebrow" data-reveal>
            02 · Why now
          </div>
          <SectionTitle data-reveal>
            WebGPU is here. v10 makes it something you can ship.
          </SectionTitle>
          <p
            className="mt-4 text-base leading-[1.65] text-muted-foreground"
            data-reveal
          >
            {WHY.lede}
          </p>
          <div className="mt-4" data-reveal>
            <ExploreLink
              href="/demos/flip-grid"
              label="Explore the flip grid"
            />
          </div>
        </RevealGroup>

        <RevealGroup className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.points.map(({ n, t, d }) => (
            <Card key={n} className="gap-3 p-6" data-reveal>
              <div className="font-mono text-[11px] font-medium text-faint">
                {n}
              </div>
              <div className="text-[19px] font-semibold tracking-[-0.02em]">
                {t}
              </div>
              <div className="text-[15px] leading-[1.6] text-muted-foreground">
                {d}
              </div>
            </Card>
          ))}
        </RevealGroup>
      </Wrap>
    </Section>
  );
}

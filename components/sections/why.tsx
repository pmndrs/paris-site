import { ExploreLink } from "@/components/explore-link";
import { RevealGroup } from "@/components/motion/reveal";
import { FlipGridCanvas } from "@/components/three/scenes";
import { Card } from "@/components/ui/card";
import { WHY } from "@/lib/content";
import { Wrap } from "./section";

/**
 * Forward-looking: what v10 and WebGPU make possible. The agentic point is one
 * card, not the thesis — see CONTENT.md §2.1.
 */
export function Why() {
  return (
    <section
      id="why"
      className="relative overflow-hidden px-4 pt-8 pb-16 sm:px-8 md:pt-12 md:pb-24 lg:pt-14 lg:pb-28"
    >
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
        <RevealGroup className="max-w-[860px]">
          <p
            className="text-[24px] leading-[1.3] font-medium tracking-[-0.025em] text-foreground sm:text-[30px] lg:text-[36px]"
            data-reveal
          >
            {WHY.lede}
          </p>
        </RevealGroup>

        <RevealGroup className="mt-14">
          <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.points.map(({ n, t, d }) => (
              <Card key={n} className="max-w-sm gap-0 p-6" data-reveal>
                <h2 className="text-[18px] font-medium tracking-[-0.02em]">
                  {t}
                </h2>
                <p className="mt-2.5 text-[15px] leading-[1.6] text-muted-foreground">
                  {d}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-6" data-reveal>
            <ExploreLink
              href="/demos/flip-grid"
              label="Explore the flip grid"
            />
          </div>
        </RevealGroup>
      </Wrap>
    </section>
  );
}

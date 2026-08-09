import { RevealGroup } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { PREREQ_GROUPS } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

export function Setup() {
  return (
    <Section id="setup">
      <Wrap>
        <RevealGroup className="grid items-start gap-8 md:grid-cols-2 lg:gap-16">
          <div>
            <div className="eyebrow" data-reveal>
              06 · Prerequisites
            </div>
            <SectionTitle data-reveal>Come in ready</SectionTitle>
            <p
              className="mt-4 text-base leading-[1.65] text-muted-foreground"
              data-reveal
            >
              This is aimed at React developers who are new to 3D, or who have
              shipped a scene and hit a wall. You do not need graphics
              experience. You do need a working React setup and comfort with
              hooks.
            </p>
            <p
              className="mt-3.5 text-base leading-[1.65] text-muted-foreground"
              data-reveal
            >
              The one rule that matters: run the install once on your own
              network before you travel. Forty people pulling{" "}
              <span className="font-mono text-[13px] text-foreground">
                node_modules
              </span>{" "}
              over conference wifi is the only thing that reliably wrecks a
              hands-on day.
            </p>
            <p
              className="mt-3.5 text-[15px] leading-[1.6] text-dim"
              data-reveal
            >
              We send the repo and a setup check about three weeks ahead. If it
              runs at home on the machine you are bringing, you are done.
            </p>
          </div>

          <div className="grid gap-5">
            {PREREQ_GROUPS.map((group) => (
              <Card
                key={group.title}
                className="gap-0 overflow-hidden p-0"
                data-reveal
              >
                <div className="border-b border-border px-5 py-4 font-mono text-[11px] font-medium tracking-[0.1em] uppercase">
                  {group.title}
                </div>
                <div className="px-5 pt-1.5 pb-3.5">
                  {group.items.map(({ a, b }) => (
                    <div
                      key={a}
                      className="grid grid-cols-[1fr_auto] items-baseline gap-3.5 border-b border-hair py-2.5 text-sm last:border-b-0"
                    >
                      <span>{a}</span>
                      <span className="text-right font-mono text-xs text-faint">
                        {b}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </RevealGroup>
      </Wrap>
    </Section>
  );
}

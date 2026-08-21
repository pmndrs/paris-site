import { Card } from "@/components/ui/card";
import { SECTION_COPY, VENUE_ROWS } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

export function Venue() {
  return (
    <Section id="venue">
      <Wrap>
        <div className="eyebrow">{SECTION_COPY.venue.eyebrow}</div>
        <SectionTitle>{SECTION_COPY.venue.title}</SectionTitle>

        <div className="mt-9 grid items-stretch gap-5 md:grid-cols-2">
          <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-border bg-[#0d0d0f] font-mono text-[11px] text-ghost">
            map placeholder
          </div>

          <Card className="gap-4.5 p-6">
            <div>
              <div className="text-[19px] font-semibold tracking-[-0.02em]">
                Gobelins, Paris
              </div>
              <div className="mt-2 text-sm leading-[1.6] text-muted-foreground">
                Same venue as the conference on the 10th and 11th. Address
                confirmed with your registration.
              </div>
            </div>

            <div className="flex flex-col gap-px bg-border">
              {VENUE_ROWS.map(({ k, v }) => (
                <div
                  key={k}
                  className="grid grid-cols-[1fr_auto] gap-3.5 bg-card py-3 text-sm"
                >
                  <span className="text-dim">{k}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Wrap>
    </Section>
  );
}

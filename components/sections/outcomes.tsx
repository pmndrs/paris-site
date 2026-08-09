import { Card } from "@/components/ui/card";
import { OUTCOMES } from "@/lib/content";
import { Section, SectionTitle, Wrap } from "./section";

export function Outcomes() {
  return (
    <Section id="outcomes">
      <Wrap>
        <div className="eyebrow">03 · Outcomes</div>
        <SectionTitle>What you leave with</SectionTitle>

        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {OUTCOMES.map(({ n, t, d }) => (
            <Card key={n} className="gap-3 p-6">
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
        </div>
      </Wrap>
    </Section>
  );
}

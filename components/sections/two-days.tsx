import { RevealGroup } from "@/components/motion/reveal";
import { TrackCanvas } from "@/components/three/scenes";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DAY_ONE_BLOCKS,
  DAY_TWO_RUNSHEET,
  SECTION_COPY,
  TRACKS,
} from "@/lib/content";
import { Note, Section, SectionTitle, Wrap } from "./section";

function DayHeading({
  n,
  meta,
  aside,
}: {
  n: string;
  meta: string;
  aside?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3.5 border-b border-border pb-4">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <div className="text-[26px] font-semibold tracking-[-0.03em] md:text-[30px] lg:text-[34px]">
          {n}
        </div>
        <div className="font-mono text-[11px] font-medium tracking-[0.11em] text-dim uppercase">
          {meta}
        </div>
      </div>
      {aside ? <Note>{aside}</Note> : null}
    </div>
  );
}

export function TwoDays() {
  return (
    <Section id="two-days">
      <Wrap>
        <RevealGroup className="flex flex-wrap items-end justify-between gap-5">
          <div data-reveal>
            <div className="eyebrow">{SECTION_COPY["two-days"].eyebrow}</div>
            <SectionTitle>{SECTION_COPY["two-days"].title}</SectionTitle>
          </div>
          <Note data-reveal>{SECTION_COPY["two-days"].note}</Note>
        </RevealGroup>

        <div className="mt-10">
          <DayHeading
            n="Day 1"
            meta="Sep 8 · Teaching · v10 and the ecosystem"
          />
        </div>

        <RevealGroup className="mt-5 grid gap-5 md:grid-cols-2">
          {DAY_ONE_BLOCKS.map((block) => (
            <Card
              key={block.when}
              className="gap-0 overflow-hidden p-0"
              data-reveal
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-5.5 py-5">
                <div className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase">
                  {block.when}
                </div>
                <div className="font-mono text-[11px] text-faint">
                  {block.hours}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3.5 p-5.5">
                <div className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
                  {block.title}
                </div>
                <div className="text-sm leading-[1.6] text-muted-foreground">
                  {block.summary}
                </div>
                <ul className="mt-1 flex flex-col gap-2.5">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="grid grid-cols-[14px_1fr] items-start gap-2.5 text-sm leading-[1.5] text-zinc-300"
                    >
                      <span className="pt-px font-mono text-xs text-faint">
                        →
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </RevealGroup>

        <div className="mt-14">
          <DayHeading
            n="Day 2"
            meta="Sep 9 · Hackathon · three tracks"
            aside="Tracks and leads to be confirmed"
          />
        </div>

        <RevealGroup className="hairline-grid mt-5 grid-cols-2 lg:grid-cols-4">
          {DAY_TWO_RUNSHEET.map(({ time, what }) => (
            <div key={time} className="bg-background px-4.5 py-4" data-reveal>
              <div className="font-mono text-[10px] tracking-[0.11em] text-faint">
                {time}
              </div>
              <div className="mt-1.5 text-sm font-medium">{what}</div>
            </div>
          ))}
        </RevealGroup>

        <RevealGroup className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TRACKS.map((track, i) => (
            <Card
              key={track.tag}
              className="gap-0 overflow-hidden p-0"
              data-reveal
            >
              {/* Placeholder solid per track — the themes aren't named yet, so
                  anything representational would be inventing one. */}
              <div className="relative h-[150px] border-b border-border bg-[#08080a]">
                <TrackCanvas index={i} />
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-border px-5.5 py-5">
                <Badge
                  variant="outline"
                  className="font-mono tracking-[0.11em] uppercase"
                >
                  {track.tag}
                </Badge>
                <div className="font-mono text-[11px] text-faint">
                  {track.slots}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3.5 p-5.5">
                <div className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
                  {track.title}
                </div>
                <div className="text-sm leading-[1.6] text-muted-foreground">
                  {track.focus}
                </div>
                <div className="mt-auto flex items-center gap-3 border-t border-hair pt-4">
                  <div className="size-8 shrink-0 rounded-full border border-input bg-[#0d0d0f]" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{track.lead}</div>
                    <div className="font-mono text-[10px] tracking-[0.09em] text-faint uppercase">
                      Track lead
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </RevealGroup>
      </Wrap>
    </Section>
  );
}

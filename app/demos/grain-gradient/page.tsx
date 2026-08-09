import type { Metadata } from "next";
import Link from "next/link";

import { InfoDialog, InfoSection } from "@/components/demos/info-dialog";
import { GrainGradientStandalone } from "@/components/three/scenes";

export const metadata: Metadata = {
  title: "Grain gradient — R3F v10 demo",
  description:
    "A dithered grain gradient written in TSL and rendered on WebGPU. Soft drifting blobs quantised with per-pixel noise, so the grit concentrates in the falloff.",
  robots: { index: false, follow: false },
};

export default function GrainGradientDemoPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <GrainGradientStandalone />

      <div className="pointer-events-none absolute top-5 left-5 z-30 max-w-[min(430px,calc(100vw-2.5rem))]">
        <div className="font-mono text-[11px] tracking-[0.13em] text-faint uppercase">
          Demo · made with R3F v10
        </div>
        <h1 className="mt-1.5 text-[22px] leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[26px]">
          Grain gradient
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-[1.5] text-muted-foreground">
          Every dial is live. This is the background of the closing section,
          pulled out to tune.
        </p>
      </div>

      <InfoDialog title="Grain gradient" subtitle="TSL · WebGPU · dithered">
        <InfoSection heading="The grain is a dither, not an overlay">
          <p>
            That distinction is the entire effect. A smooth field of drifting
            blobs is quantised into a handful of brightness levels — but
            per-pixel noise is added <em>before</em> the rounding. Pixels sitting
            near a level boundary get pushed either side of it, so the hard step
            between two levels dissolves into stipple.
          </p>
          <p>
            The grit therefore concentrates in the falloff and disappears inside
            the solids and the black, which is what your eye reads as film grain.
            Laying uniform noise over the top instead gives a dusty photograph —
            the giveaway that something is faking it.
          </p>
        </InfoSection>

        <InfoSection heading="Grain has to be measured in pixels">
          <p>
            The noise is keyed to raw screen coordinates rather than the
            surface&apos;s UVs. Grain that scales with geometry reads as texture;
            grain fixed to the display reads as grain.
          </p>
          <p>
            <code>grainPx</code> then clumps several device pixels into one grain
            dot. At 1 it lands sub-CSS-pixel on any retina display and averages
            straight back into a smooth gradient — visible as a faint sheen and
            nothing more. That was the first version of this, and it looked
            broken in a way that was hard to see.
          </p>
        </InfoSection>

        <InfoSection heading="Dials worth reaching for">
          <ul className="grid gap-1.5">
            {[
              ["levels", "Fewer steps, chunkier banding, more room for stipple."],
              ["grain", "How far a pixel can cross a boundary. ~1 is fully stippled; 0 is clean banding."],
              ["grainPx", "Device pixels per grain dot. The difference between grit and sheen."],
              ["grainHz", "Resample rate. 12 reads as film; 60 strobes; 0 freezes it."],
              ["softness", "Width of the falloff — the band the stipple lives in."],
              ["intensity", "Peak opacity. The field is transparent so it lifts what's behind."],
              ["scale / rotation / offset", "Moves the field rather than the blobs. One transform, composes."],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-3">
                <code className="w-[9.5rem] shrink-0 text-[12.5px] text-foreground">
                  {k}
                </code>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </InfoSection>

        <InfoSection heading="Why it's all uniforms">
          <p>
            Every parameter is a TSL <code>uniform</code> rather than a constant
            folded into the shader graph. Constants would mean rebuilding and
            recompiling the shader on every drag of a slider; uniforms make the
            controls immediate. It costs a little more setup and is the right
            trade the moment anything is tunable.
          </p>
        </InfoSection>

        <InfoSection heading="Where it runs">
          <p>
            On the workshop page this same field is a <em>secondary canvas</em>{" "}
            behind the closing call to action, borrowing the hero&apos;s
            <code> WebGPURenderer</code> and running at 30fps. Here it owns the
            renderer and takes the full frame. Same component, different host.
          </p>
          <p>
            Inspired by{" "}
            <a
              href="https://shaders.paper.design"
              className="text-foreground underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              Paper Shaders
            </a>
            &apos; grain gradient; written from scratch in TSL rather than
            ported.
          </p>
        </InfoSection>

        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5">
          <Link
            href="/demos"
            className="text-[14px] text-foreground underline underline-offset-4"
          >
            All demos →
          </Link>
          <Link
            href="/"
            className="text-[14px] text-muted-foreground underline underline-offset-4"
          >
            The workshop this was built for
          </Link>
        </div>
      </InfoDialog>
    </main>
  );
}

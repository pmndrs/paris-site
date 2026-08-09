"use client";

import { Button } from "@/components/ui/button";
import { REGISTER_URL, SECTIONS } from "@/lib/content";
import { useScrollSpy } from "@/lib/use-scroll-spy";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { shown, progress, active, marks } = useScrollSpy();

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[opacity,transform] duration-300",
        shown
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0",
      )}
    >
      <div className="relative overflow-hidden border-b border-border bg-black/70 backdrop-blur-xl">
        <div className="relative flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-2.5 px-4 py-3.5 sm:px-6 lg:px-10">
          <a href="#top" className="flex min-w-0 items-center gap-3.5">
            <span className="text-base font-bold tracking-[-0.02em]">
              PMNDRS
            </span>
            <span className="h-4 w-px shrink-0 bg-ghost" />
            <span className="min-w-0 shrink truncate font-mono text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              Advanced R3F · Sep 8–9
            </span>
          </a>

          <div className="flex min-w-0 flex-1 basis-[260px] items-center justify-end gap-3 sm:gap-4 lg:gap-6">
            <nav
              aria-label="Sections"
              // Scrolls horizontally when it runs out of room. The inline padding
              // matches the mask so the end links are never clipped at rest.
              className="[&::-webkit-scrollbar]:hidden flex min-w-0 items-center gap-3 overflow-x-auto px-3.5 text-[13px] [-ms-overflow-style:none] [mask-image:linear-gradient(90deg,transparent,#000_14px,#000_calc(100%-14px),transparent)] [scrollbar-width:none] sm:gap-4 lg:gap-6"
            >
              {SECTIONS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={active === id}
                  className={cn(
                    "whitespace-nowrap transition-colors hover:text-foreground",
                    active === id ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </a>
              ))}
            </nav>

            <Button asChild size="sm">
              <a href={REGISTER_URL}>Register</a>
            </Button>
          </div>
        </div>

        {/* Progress rail with a tick per section. */}
        <div className="relative h-0.5 bg-border">
          <div
            className="absolute inset-y-0 left-0 bg-foreground"
            style={{ width: `${(progress * 100).toFixed(2)}%` }}
          />
          {marks.map(({ id, pct }) => (
            <div
              key={id}
              className={cn(
                "absolute -top-[3px] h-2 w-px",
                active === id ? "bg-foreground" : "bg-ghost",
              )}
              style={{ left: `${pct.toFixed(2)}%` }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}

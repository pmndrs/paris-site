"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { REGISTER_URL, SECTIONS } from "@/lib/content";
import { useVisibleSections } from "@/components/site-settings";
import { useScrollSpy } from "@/lib/use-scroll-spy";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { shown, progress, active, marks } = useScrollSpy();
  const isVisible = useVisibleSections();

  // A nav link to a section that isn't rendered scrolls nowhere, and its tick
  // would sit at 0% and pile up on the left edge of the rail.
  const sections = SECTIONS.filter((s) => isVisible(s.id));
  const rail = marks.filter((m) => isVisible(m.id));

  return (
    <header
      data-site-header
      data-site-header-state="out"
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={cn(
          "relative overflow-hidden border-b transition-[background-color,border-color,backdrop-filter] duration-500",
          shown
            ? "border-border bg-black/70 backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <div className="relative flex min-h-[72px] items-center justify-between gap-5 px-4 py-3.5 sm:px-8">
          <a
            href="https://pmnd.rs/"
            aria-label="Visit pmnd.rs"
            className="shrink-0 transition-opacity hover:opacity-70"
          >
            <Logo color="currentColor" className="size-6 shrink-0" />
          </a>

          <div className="flex min-w-0 items-center justify-end gap-3 sm:gap-4 lg:gap-6">
            <nav
              aria-label="Sections"
              aria-hidden={!shown}
              // Scrolls horizontally when it runs out of room. The inline padding
              // matches the mask so the end links are never clipped at rest.
              className={cn(
                "[&::-webkit-scrollbar]:hidden flex min-w-0 items-center gap-3 overflow-x-auto text-[13px] transition-[max-width,opacity,transform] duration-500 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 lg:gap-6",
                shown
                  ? "max-w-[70vw] translate-y-0 opacity-100"
                  : "pointer-events-none max-w-0 -translate-y-2 opacity-0",
              )}
            >
              {sections.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={active === id}
                  tabIndex={shown ? undefined : -1}
                  className={cn(
                    "whitespace-nowrap transition-colors hover:text-foreground",
                    active === id ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </a>
              ))}
            </nav>

            <Button
              asChild
              size="sm"
              className={cn(
                "h-8 px-4 transition-shadow duration-500",
                shown
                  ? "shadow-none"
                  : "shadow-[0_0_24px_rgba(255,255,255,0.2)]",
              )}
            >
              <a href={REGISTER_URL}>Register</a>
            </Button>
          </div>
        </div>

        {/* Progress rail with a tick per section. */}
        <div
          className={cn(
            "relative h-0.5 bg-border transition-[opacity,transform] duration-500",
            shown
              ? "translate-y-0 opacity-100"
              : "translate-y-0.5 opacity-0",
          )}
        >
          <div
            className="absolute inset-y-0 left-0 bg-foreground"
            style={{ width: `${(progress * 100).toFixed(2)}%` }}
          />
          {rail.map(({ id, pct }) => (
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

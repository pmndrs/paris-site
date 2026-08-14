"use client";

import { CheckIcon, SettingsIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";

import { ExploreLink } from "@/components/explore-link";
import { useSiteSettings } from "@/components/site-settings";
import { SECTION_TOGGLES } from "@/lib/sections";
import { cn } from "@/lib/utils";

/**
 * The section switchboard, opened from the footer.
 *
 * Deliberately not hidden behind `?debug` like the Leva panels. The whole
 * reason it exists is that what belongs on the page is still being argued
 * about, and the argument goes faster when anyone can turn a section on and
 * look at it rather than asking for a branch.
 */
export function SiteSettingsDialog() {
  const { visible, toggle, showAll, showShort } = useSiteSettings();
  const shown = SECTION_TOGGLES.filter((s) => visible[s.id]).length;

  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2 py-1 font-mono text-xs text-faint",
          "transition-colors hover:text-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        <SettingsIcon className="size-3.5" aria-hidden />
        Sections
        <span className="text-ghost">
          {shown}/{SECTION_TOGGLES.length}
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
            // Full-height sheet on phones, centred panel from sm up — the same
            // shape the demo info dialog uses.
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[80dvh] sm:w-[min(560px,calc(100vw-3rem))]",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-98",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <Dialog.Title className="text-[17px] font-semibold tracking-[-0.02em]">
                Sections
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-[11px] tracking-[0.06em] text-faint">
                Defaults are the short version · saved in this browser
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto px-3 py-3 sm:px-4">
            <ul>
              {SECTION_TOGGLES.map((section) => {
                const on = visible[section.id];
                return (
                  <li key={section.id}>
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-foreground/[0.03]">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => toggle(section.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span
                          className={cn(
                            "grid size-[18px] shrink-0 place-items-center rounded border transition-colors",
                            on
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-transparent",
                          )}
                        >
                          <CheckIcon className="size-3" strokeWidth={3} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14.5px] font-medium">
                            {section.label}
                          </span>
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            {section.note}
                          </span>
                        </span>
                      </button>

                      {section.demo ? (
                        <ExploreLink
                          href={section.demo}
                          label="Demo"
                          className="shrink-0"
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center gap-4 border-t border-border px-5 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={showShort}
              className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              Short version
            </button>
            <button
              type="button"
              onClick={showAll}
              className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              Show all
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

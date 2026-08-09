"use client";

import { Info, SlidersHorizontal, X } from "lucide-react";
import { Leva } from "leva";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The chrome every demo page shares.
 *
 * These pages are teaching material as much as they are scratch space, so they
 * carry two audiences at once: someone who wants to read how the thing works,
 * and someone who wants to take the controls apart. Neither should be the first
 * thing you see — the effect is. So both live behind a button, and the default
 * view is the demo, full bleed, with one line of orientation.
 *
 * The Leva panel is mounted once here rather than per demo. It stays in the
 * tree when hidden (`hidden` rather than unmounting) so toggling it doesn't
 * reset every control you'd just dialled in.
 */
export function DemoShell({
  eyebrow,
  intro,
  info,
  children,
  className,
}: {
  /** Mono label, e.g. "demo · flip grid". */
  eyebrow: string;
  /** One line telling the visitor what to do with their cursor. */
  intro: ReactNode;
  /** Body of the "how it works" dialog. */
  info: ReactNode;
  /** The canvas. Sits full-bleed behind everything else. */
  children: ReactNode;
  className?: string;
}) {
  const [panel, setPanel] = useState(false);

  return (
    <main
      className={cn("relative min-h-svh overflow-hidden bg-background", className)}
    >
      {/* Mounted always, revealed on demand — unmounting would drop the state. */}
      <Leva hidden={!panel} collapsed={false} />

      <div className="absolute inset-0">{children}</div>

      <div className="pointer-events-none relative z-10 flex min-h-svh flex-col p-5 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <p className="mt-3 max-w-[38ch] text-[15px] leading-[1.6] text-muted-foreground">
              {intro}
            </p>
          </div>

          <IconButton
            label={panel ? "Hide controls" : "Show controls"}
            pressed={panel}
            onClick={() => setPanel((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
          </IconButton>
        </div>

        <div className="mt-auto">
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/80 py-2 pr-4 pl-3 font-mono text-[11px] tracking-[0.11em] text-muted-foreground uppercase backdrop-blur transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Info className="size-3.5" />
                How it works
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <Dialog.Content
                className={cn(
                  "fixed top-1/2 left-1/2 z-50 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
                  "max-h-[min(720px,calc(100svh-5rem))] overflow-y-auto",
                  "rounded-xl bg-card p-6 text-card-foreground ring-1 ring-foreground/10 sm:p-8",
                  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                )}
              >
                <div className="flex items-start justify-between gap-6">
                  <Dialog.Title className="text-[22px] leading-[1.15] font-semibold tracking-[-0.02em]">
                    {eyebrow}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close"
                      className="-mt-1 -mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Description is required for the dialog to be labelled; the
                    intro line doubles as it. */}
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  {intro}
                </Dialog.Description>

                <div className="mt-6 space-y-6">{info}</div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </main>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "pointer-events-auto rounded-full border border-border bg-card/80 p-2.5 backdrop-blur transition-colors",
        pressed
          ? "border-foreground/30 text-foreground"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A titled block inside the "how it works" dialog. */
export function InfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="font-mono text-[11px] font-medium tracking-[0.13em] text-faint uppercase">
        {title}
      </h3>
      <div className="mt-2 space-y-3 text-[15px] leading-[1.65] text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

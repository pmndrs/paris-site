import { LogoFull } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { REGISTER_URL } from "@/lib/content";
import { SiteSettingsDialog } from "@/components/site-settings-dialog";

/**
 * `z-20` for the same reason the closer has it: the physics container behind
 * this band is a sibling rather than a descendant, so the footer's own contents
 * have to be lifted over it explicitly. See `app/page.tsx`.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-20 flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-9 font-mono text-xs text-faint sm:px-6 lg:px-10">
      <div className="flex items-center gap-3.5">
        <LogoFull color="currentColor" className="h-5 w-auto text-foreground" />
        <span>Advanced React Three Fiber</span>
      </div>
      <div className="flex items-center gap-5">
        <a href="https://threejs.paris/" className="hover:text-foreground">
          threejs.paris
        </a>
        <a href="https://pmnd.rs/" className="hover:text-foreground">
          pmnd.rs
        </a>
        {/* The last call to action on the page. The hero and the sticky header
            both carry one, but someone who reads to the bottom — which is the
            whole page on the short version — would otherwise find only
            outbound links. */}
        <Button asChild size="sm">
          <a href={REGISTER_URL}>Register</a>
        </Button>
        {/* Which sections are on. In the footer rather than the header because
            it is a workbench control, not navigation. */}
        <SiteSettingsDialog />
      </div>
    </footer>
  );
}

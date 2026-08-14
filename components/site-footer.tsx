import { LogoFull } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-9 font-mono text-xs text-faint sm:px-6 lg:px-10">
      <div className="flex items-center gap-3.5">
        <LogoFull color="currentColor" className="h-5 w-auto text-foreground" />
        <span>Advanced React Three Fiber</span>
      </div>
      <div className="flex gap-5">
        <a href="https://threejs.paris/" className="hover:text-foreground">
          threejs.paris
        </a>
        <a href="https://pmnd.rs/" className="hover:text-foreground">
          pmnd.rs
        </a>
      </div>
    </footer>
  );
}

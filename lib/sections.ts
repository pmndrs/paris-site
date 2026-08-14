/**
 * Which sections exist, which ship, and which have a demo behind them.
 *
 * The page has grown past what was agreed. Rather than delete sections that
 * keep getting asked for again a week later, every one of them is toggleable
 * and the *defaults* are the short version — so what renders with no stored
 * preference is exactly what ships. Turning the rest on is a dev affordance,
 * behind the settings dialog in the footer.
 */

export type ToggleId =
  | "overview"
  | "why"
  | "outcomes"
  | "two-days"
  | "instructors"
  | "setup"
  | "venue"
  | "faq"
  | "closer";

export type SectionToggle = {
  id: ToggleId;
  label: string;
  /** One-line reminder of what the section is, for the settings list. */
  note: string;
  /**
   * The standalone demo this section's scene came from, if it has one. Drives
   * the "explore" link, and it opens in a new tab so the page keeps its place.
   */
  demo?: string;
};

/**
 * In page order. `closer` is here even though it is not in the nav, because it
 * is a section of the page and needs the same switch.
 */
export const SECTION_TOGGLES: SectionToggle[] = [
  {
    id: "overview",
    label: "Overview",
    note: "Two-day split, facts strip, the block city",
    demo: "/demos/block-city",
  },
  {
    id: "why",
    label: "Why now",
    note: "WebGPU / v10 argument, the gold flip grid",
    demo: "/demos/flip-grid",
  },
  {
    id: "outcomes",
    label: "Outcomes",
    note: "What you leave with — three cards, three scenes",
  },
  { id: "two-days", label: "Two days", note: "Day one blocks, day two tracks" },
  { id: "instructors", label: "Instructors", note: "The team" },
  { id: "setup", label: "Come ready", note: "Prerequisites and install notes" },
  { id: "venue", label: "Venue", note: "Gobelins, and getting there" },
  { id: "faq", label: "FAQ", note: "Objections, in the place people look" },
  {
    id: "closer",
    label: "Closer",
    note: "Final call to action, over the connectors pile",
    demo: "/demos/connectors",
  },
];

/**
 * The agreed short version: hero, the gold flip, the team, the footer.
 *
 * Hero and footer are not toggleable — they are the frame rather than content —
 * so this is only the middle of the page.
 */
export const SHORT_VERSION: ToggleId[] = ["why", "instructors"];

export const DEFAULT_VISIBLE: Record<ToggleId, boolean> = Object.fromEntries(
  SECTION_TOGGLES.map((s) => [s.id, SHORT_VERSION.includes(s.id)]),
) as Record<ToggleId, boolean>;

/** Everything on, for the "show all" shortcut in the dialog. */
export const ALL_VISIBLE: Record<ToggleId, boolean> = Object.fromEntries(
  SECTION_TOGGLES.map((s) => [s.id, true]),
) as Record<ToggleId, boolean>;

export const DEMO_FOR = Object.fromEntries(
  SECTION_TOGGLES.filter((s) => s.demo).map((s) => [s.id, s.demo!]),
) as Partial<Record<ToggleId, string>>;

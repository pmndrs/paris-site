/**
 * Every piece of copy on the site, in one place.
 * Lifted from the `renderVals()` block of the original design doc.
 */

export const REGISTER_URL = "https://threejs.paris/";

export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "why", label: "Why now" },
  { id: "outcomes", label: "Outcomes" },
  { id: "two-days", label: "Two days" },
  { id: "instructors", label: "Instructors" },
  { id: "setup", label: "Setup" },
  { id: "venue", label: "Venue" },
  { id: "faq", label: "FAQ" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const HERO = {
  kicker: "September 8 & 9, 2026 · Gobelins, Paris",
  title: ["Advanced React", "Three Fiber"],
  days: [
    {
      label: "Day 1",
      body: "Learn the full R3F v10 WebGPU stack from staging to reactivity to TSL and postprocessing.",
      highlights: ["WebGPU"],
    },
    {
      label: "Day 2",
      body: "Build something amazing. Choose between a game, product editor or creative portfolio.",
      highlights: ["game", "product editor", "creative portfolio"],
    },
  ],
};

/**
 * No seat or capacity claim anywhere on the page, deliberately.
 *
 * The hero said thirty, this strip said forty and the closer said forty, which
 * was three numbers for one fact. Publishing any of them also means maintaining
 * it as places fill — and CONTENT.md §5.1 lands on making no availability claim
 * at all. Registration is the honest place for that number.
 */
/**
 * Section chrome: the eyebrow and title each section carries, plus the prose
 * that was otherwise stranded in JSX.
 *
 * Keyed by section id, so it lines up with SECTIONS above and with the toggles
 * in lib/sections.ts. Structured content — the Why cards, the outcomes, the
 * FAQ, the tracks — keeps its own export below; this is for the copy that had
 * nowhere else to live.
 */
export const SECTION_COPY = {
  overview: {
    eyebrow: "01 · Overview",
    title: "Learn the pieces, then build with them",
    body: "Day one is teaching: React Three Fiber v10, then the pmndrs ecosystem around it — drei, physics, post, state, and how the pieces fit together. Day two is a hackathon: three tracks, a lead on each, something running by the end of the afternoon.",
    // True of both layers: the live scene when there is WebGPU, the concept
    // frame when there isn't.
    caption: "The block city · at mid distance",
  },
  why: {
    eyebrow: "02 · Why now",
    title: "WebGPU is here, behind an API you already know",
  },
  outcomes: {
    eyebrow: "03 · Outcomes",
    title: "What you leave with",
  },
  "two-days": {
    eyebrow: "04 · Two days",
    title: "A teaching day, then a build day",
    note: "09:30 – 17:30 · lunch and two breaks each day",
  },
  instructors: {
    eyebrow: "05 · Instructors",
    title: "Who is teaching",
  },
  setup: {
    eyebrow: "06 · Prerequisites",
    title: "Come in ready",
    // TODO: this contradicts Level "Intermediate" the same way the FAQ answer
    // does — "new to 3D" and "no graphics experience" promise a soft landing
    // the workshop no longer offers. See COPY.md §1. Not changed here because
    // it is a policy call, not a copy one.
    audience:
      "This is aimed at React developers who are new to 3D, or who have shipped a scene and hit a wall. You do not need graphics experience. You do need a working React setup and comfort with hooks.",
    // Split around the one word that renders in mono, so the whole sentence
    // stays editable here rather than half of it living in the component.
    installBefore:
      "The one rule that matters: run the install once on your own network before you travel. Forty people pulling ",
    installCode: "node_modules",
    installAfter:
      " over conference wifi is the only thing that reliably wrecks a hands-on day.",
    repo: "We send the repo and a setup check about three weeks ahead. If it runs at home on the machine you are bringing, you are done.",
  },
  venue: {
    eyebrow: "07 · Venue",
    title: "Getting there",
  },
  faq: {
    eyebrow: "08 · FAQ",
    title: "Questions",
  },
} as const;

/** The closing call to action. Not in SECTION_COPY: it has no eyebrow. */
export const CLOSER = {
  kicker: "September 8 & 9, 2026 · Gobelins, Paris",
  title: "Add the workshop to your conference ticket",
  primary: "Register on threejs.paris",
  secondary: "Review the two days",
};

export const FACTS = [
  { k: "Dates", v: "Sep 8 & 9" },
  { k: "Format", v: "In person" },
  { k: "Level", v: "Intermediate" },
];

/**
 * Forward-looking framing: what R3F and v10 make possible, and why now.
 *
 * The agentic angle lives in point 03 only — a supporting note, not the thesis.
 * See CONTENT.md §2.1: the site is "building the future with R3F", not a
 * defence of learning against AI.
 */
export const WHY = {
  lede: "WebGPU shipped. React Three Fiber v10 puts it behind an API you already know. The parts of 3D that used to need a graphics team are turning into components — and this is where you learn to build with them.",
  points: [
    {
      n: "01",
      t: "React is the fastest way to build 3D",
      d: "You already have components, hooks and state. R3F maps them straight onto the scene graph, so what you are learning is the 3D, not another framework.",
    },
    {
      n: "02",
      t: "The ecosystem is the multiplier",
      d: "drei, rapier, postprocessing, gltfjsx. Knowing which one to reach for is most of the job, and two days with the people who build them is a shortcut you cannot read your way to.",
    },
    {
      n: "03",
      t: "You will write the code",
      d: "Bring your agent, we use them too. But you will type it, break it and fix it, because you cannot direct a tool through a domain you cannot read.",
    },
  ],
};

export const OUTCOMES = [
  {
    n: "01",
    t: "A working v10 setup",
    d: "R3F v10 running on your machine, configured the way we would start a real project.",
  },
  {
    n: "02",
    t: "The ecosystem in your head",
    d: "Which pmndrs library solves which problem.",
  },
  {
    n: "03",
    t: "The demos, not just the notes",
    d: "Every demo from day one, running and yours — including the ones on this page.",
  },
];

export const DAY_ONE_BLOCKS = [
  {
    when: "Morning",
    hours: "09:30 – 12:30",
    title: "React Three Fiber v10",
    summary:
      "What v10 changes, and the mental model that makes the rest of the stack make sense.",
    items: [
      "The scene graph as React, in v10 terms",
      "What moved, what is new, what to unlearn",
      "Cameras, controls, and framing a subject",
      "Materials and lighting that read well",
    ],
  },
  {
    when: "Afternoon",
    hours: "13:30 – 17:30",
    title: "The pmndrs ecosystem",
    summary:
      "The libraries around R3F and how they fit together on a real project.",
    items: [
      "drei: what to reach for and when",
      "State, loading, and asset pipeline",
      "Physics, post processing, and performance",
      "Starting a project you can keep working on",
    ],
  },
];

export const DAY_TWO_RUNSHEET = [
  { time: "09:30", what: "Kickoff and track briefs" },
  { time: "10:00", what: "Pick a track, start building" },
  { time: "13:00", what: "Lunch, then work continues" },
  { time: "16:30", what: "Demos, one per team" },
];

const TRACK_FOCUS =
  "One theme per track, briefed at kickoff. You work in small teams with the lead on hand all day.";

export const TRACKS = [
  {
    tag: "Track A",
    slots: "10 seats",
    title: "Track theme TBC",
    focus: TRACK_FOCUS,
    lead: "Dennis Smolek",
  },
  {
    tag: "Track B",
    slots: "10 seats",
    title: "Track theme TBC",
    focus: TRACK_FOCUS,
    lead: "Kris Baumgartner",
  },
  {
    tag: "Track C",
    slots: "10 seats",
    title: "Track theme TBC",
    focus: TRACK_FOCUS,
    lead: "Lead TBC",
  },
];

const FLOOR_BIO = "On hand through both days for setup and one-to-one help.";

/**
 * The `role` line is a credential, not a rank.
 *
 * It used to read "Lead instructor" twice and "Assistant" twice, which sorted
 * the room rather than saying anything — and undersold the half of it that
 * matters most: two of these people build the stack being taught. Who runs a
 * track on day two is real information, so it moves into the bio, where it is a
 * fact about the schedule rather than a label on a person.
 */
export const PEOPLE = [
  {
    name: "Dennis Smolek",
    role: "pmndrs core",
    bio: "Wrote React Three Fiber v10, and builds production R3F for a living. Leads a track on day two.",
  },
  {
    name: "Kris Baumgartner",
    role: "pmndrs core",
    // TODO: name the libraries. "Several of the libraries" is true but soft —
    // two or three names would do far more work here than the sentence does.
    bio: "Wrote several of the libraries you will use, and works on rendering and performance. Leads a track on day two.",
  },
  // Surnames pending — first names are correct, so ship those rather than a
  // public "TBC". Fill in when Dennis has them.
  { name: "Ava", role: "Interactive developer", bio: FLOOR_BIO },
  { name: "Faraz", role: "pmndrs contributor", bio: FLOOR_BIO },
];

export const PREREQ_GROUPS = [
  {
    title: "You should already know",
    items: [
      { a: "React with hooks", b: "required" },
      { a: "TypeScript basics", b: "helpful" },
      { a: "Any 3D or shader work", b: "not needed" },
    ],
  },
  {
    title: "Install before you arrive",
    items: [
      { a: "Node", b: "22 LTS · 20+ works" },
      { a: "pnpm", b: "corepack enable" },
      { a: "Workshop repo", b: "sent ~3 weeks before" },
      { a: "Browser", b: "WebGPU · hardware acceleration on" },
    ],
  },
];

export const VENUE_ROWS = [
  { k: "Venue", v: "Gobelins, Paris" },
  { k: "Workshop", v: "Sep 8 – 9" },
  { k: "Conference", v: "Sep 10 – 11" },
  { k: "Doors", v: "09:00" },
];

export const FAQS = [
  {
    q: "Do I need a conference ticket?",
    a: "The workshop is an add-on to your three.js conf ticket. Registration for both lives on threejs.paris.",
  },
  {
    q: "Can I use an agent during the workshop?",
    a: "Yes, and we will be. The reason you type it yourself anyway is that 3D fails silently — a wrong colour space or a missing light throws no error, it just looks off. Two days of building by hand is what makes you fast with the tools afterwards.",
  },
  {
    q: "What if my setup breaks on the day?",
    a: "We keep browser mirrors of the morning repos, so you follow along live and fix your local setup at the break. Nobody sits idle.",
  },
  {
    q: "What if I have never written 3D code?",
    a: "That is the intended starting point. The workshop assumes React fluency and teaches the 3D from scratch.",
  },
  {
    q: "Do I need an idea for the hackathon?",
    a: "No. Each track is briefed at kickoff on day two and you pick the one you want. Bring an idea if you have one.",
  },
  {
    q: "Will the recordings be available?",
    a: "The workshop is not recorded. You keep the repo, the slides, and whatever your track builds.",
  },
  {
    q: "What hardware should I bring?",
    a: "Any laptop from the last few years — integrated graphics is fine. What matters is a current browser with WebGPU and hardware acceleration switched on. We work in v10 on WebGPU, so check it before you travel; the setup guide tells you how.",
  },
  {
    q: "Is lunch included?",
    a: "Yes, both days, along with two breaks. Tell us about dietary requirements at registration.",
  },
];

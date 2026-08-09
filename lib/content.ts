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
  lede: "One day learning React Three Fiber v10 and the pmndrs ecosystem, one day building with it. Thirty seats.",
};

export const FACTS = [
  { k: "Dates", v: "Sep 8 & 9" },
  { k: "Format", v: "In person" },
  { k: "Seats", v: "40" },
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
      d: "You already have the component model, hooks, and state. R3F maps them straight onto the scene graph, so what you are actually learning is the 3D — not another framework.",
    },
    {
      n: "02",
      t: "The ecosystem is the multiplier",
      d: "drei, rapier, postprocessing, gltfjsx. Years of solved problems, and knowing which one to reach for is most of the job. Two days with the people who build them is a shortcut you cannot read your way to.",
    },
    {
      n: "03",
      t: "You will write the code",
      d: "Bring your agent — we use them too. But you will type it, break it, and fix it yourself, because you cannot direct a tool through a domain you cannot read. That is the whole point of doing it by hand for two days.",
    },
  ],
};

export const OUTCOMES = [
  {
    n: "01",
    t: "A working v10 setup",
    d: "React Three Fiber v10 running on your machine, configured the way we would start a real project.",
  },
  {
    n: "02",
    t: "The ecosystem in your head",
    d: "Which pmndrs library solves which problem, so you stop rebuilding things that already exist.",
  },
  {
    n: "03",
    t: "Something you built in a day",
    d: "Whatever your track produces on day two, plus the code and the notes from your track lead.",
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

const ASSISTANT_BIO =
  "On hand through both days for setup and one-to-one help.";

export const PEOPLE = [
  {
    name: "Dennis Smolek",
    role: "Lead instructor",
    bio: "Works on the pmndrs stack and builds production R3F for a living.",
  },
  {
    name: "Kris Baumgartner",
    role: "Lead instructor",
    bio: "Core pmndrs contributor, focused on rendering and performance.",
  },
  // Surnames pending — first names are correct, so ship those rather than a
  // public "TBC". Fill in when Dennis has them.
  { name: "Ava", role: "Assistant", bio: ASSISTANT_BIO },
  { name: "Faraz", role: "Assistant", bio: ASSISTANT_BIO },
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

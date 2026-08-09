import type { MetadataRoute } from "next";

/**
 * The attendee guide is gated by an unguessable URL rather than auth
 * (SPEC.md §8). Keeping it out of the index is most of what makes that hold up.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/attendees", "/attendees/", "/mobile-preview"],
    },
  };
}

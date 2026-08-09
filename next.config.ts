import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo pages put their "how it works" affordance in the bottom-left
  // corner, which is exactly where the dev indicator lands by default — it
  // covers the button and only in development, which is the worst combination
  // for noticing.
  devIndicators: { position: "bottom-right" },
  turbopack: {
    resolveAlias: {
      // Breaks an import cycle in R3F v10 alpha 3 that otherwise makes the
      // first `@react-three/fiber/webgpu` import throw. See the stub for the
      // full explanation — this should come out when the alpha is fixed.
      "three/addons/inspector/Inspector.js": "./lib/three-inspector-stub.ts",
    },
  },
};

export default nextConfig;

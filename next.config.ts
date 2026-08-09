import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

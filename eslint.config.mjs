import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Archived copy of the original static port — kept for reference, not built.
    "reference/**",
  ]),
  {
    // React Three Fiber drives three.js by mutating objects the renderer owns:
    // `useFrame` exists to write to `camera`, materials, and instance matrices
    // every frame. The React Compiler's immutability rules read that as unsafe
    // mutation of a hook's return value — correct for React state, wrong for an
    // imperative renderer. Scoped to the scene; the rest of the app keeps the
    // full rule set.
    //
    // `components/three/**` is the same story one level up: TSL uniforms are
    // mutable handles you write to from `useFrame`, which is the entire point
    // of a uniform.
    files: [
      "components/hero/**/*.tsx",
      "components/three/**/*.tsx",
      "components/hero-demo/**/*.tsx",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // Vendored verbatim from three.js / Faraz's demo so it stays diffable
    // against upstream. Not ours to lint.
    files: ["components/hero-demo/ssao-node.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
    },
  },
]);

export default eslintConfig;

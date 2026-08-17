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
    // Not part of this project — see .gitignore's comments. .gitignore
    // only keeps git from tracking these; ESLint scans the filesystem
    // directly and needs its own ignore entry regardless.
    "remotion/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;

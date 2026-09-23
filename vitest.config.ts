import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Bound file-level CPU/process contention when integration suites are
    // enabled alongside unit tests. Promise.all worker races remain parallel.
    maxWorkers: 4,
  },
});

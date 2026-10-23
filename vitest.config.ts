import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 99,
        branches: 88,
        functions: 100,
        lines: 100,
        "src/cookies.ts": {
          branches: 53,
        },
      },
    },
  },
});

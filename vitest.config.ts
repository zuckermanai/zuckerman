import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@world": resolve(__dirname, "./src/world"),
      "@agents": resolve(__dirname, "./src/agents"),
      "@interfaces": resolve(__dirname, "./src/interfaces"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "dist/",
        "**/*.config.*",
      ],
    },
  },
});

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit and component tests, run in jsdom with no network. Run from apps/web, so loadCase()
// reads the committed demo case exactly as the server does.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The real package throws outside a React server build; the tests import server code directly.
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "src/app/**/route.ts"],
      exclude: ["**/*.test.*", "src/lib/types.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 95, statements: 95, functions: 93, branches: 85 },
    },
  },
});

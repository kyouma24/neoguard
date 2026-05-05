/// <reference types="vitest" />
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 15000,
    hookTimeout: 10000,
    include: [
      "src/hooks/**/*.test.{ts,tsx}",
      "src/utils/**/*.test.{ts,tsx}",
      "src/services/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/design-system/**",
      "src/pages/**/*.test.tsx",
      "src/components/**/*.test.tsx",
    ],
    server: {
      deps: {
        external: [
          "monaco-editor",
          "@monaco-editor/react",
          "uplot",
          "recharts",
          "@dnd-kit/core",
          "@dnd-kit/sortable",
        ],
      },
    },
    coverage: { enabled: false },
    watch: false,
    pool: "threads",
    reporters: ["default"],
  },
  optimizeDeps: {
    exclude: ["monaco-editor", "@monaco-editor/react", "uplot", "recharts"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    env: {
      DEEPSEEK_API_KEY: "test-key",
    },
  },
});

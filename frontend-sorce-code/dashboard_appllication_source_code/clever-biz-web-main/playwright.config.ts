import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function loadEnvFile(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) return;

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const require = createRequire(import.meta.url);
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: ".env.e2e" });
} catch {
  loadEnvFile(".env.e2e");
}

const PORT = process.env.PORT || "5173";
const BASE_URL = process.env.WEB_BASE_URL || `http://127.0.0.1:${PORT}`;
const API_BASE_URL =
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL ||
  "https://cleverdining-2.onrender.com";
const WS_BASE_URL =
  process.env.VITE_WS_URL ||
  API_BASE_URL.replace(/^http/i, "ws");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  globalSetup: "./global-setup.ts",
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
  webServer: process.env.WEB_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 5173",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: true,
        env: {
          ...process.env,
          API_BASE_URL,
          VITE_API_URL: process.env.VITE_API_URL || API_BASE_URL,
          VITE_WS_URL: WS_BASE_URL,
        },
      },
});

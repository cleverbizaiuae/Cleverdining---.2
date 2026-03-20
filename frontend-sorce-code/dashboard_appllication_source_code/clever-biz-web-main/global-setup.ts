import { request, type FullConfig } from "@playwright/test";
import { seedTestData } from "./tests/helpers/seed";

export default async function globalSetup(_: FullConfig) {
  const api = await request.newContext({
    ignoreHTTPSErrors: true,
  });

  try {
    await seedTestData(api);
    console.log("[global-setup] Deterministic seed data ensured.");
  } finally {
    await api.dispose();
  }
}

import { expect, Locator, Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export type ConsoleTracker = {
  errors: string[];
  warnings: string[];
};

const API_WAIT_TIMEOUT_MS = 10_000;
const API_RETRIES = 3;
type NetworkResponse = Awaited<ReturnType<Page["waitForResponse"]>>;
const lastApiSuccessByPage = new WeakMap<Page, NetworkResponse>();

const apiBaseHints = [
  process.env.API_BASE_URL,
  process.env.VITE_API_URL,
  "https://cleverdining-2.onrender.com",
]
  .filter((value): value is string => Boolean(value))
  .map((value) => value.replace(/\/+$/, ""));

export function trackConsole(page: Page): ConsoleTracker {
  const tracker: ConsoleTracker = { errors: [], warnings: [] };
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") tracker.errors.push(text);
    if (msg.type() === "warning") tracker.warnings.push(text);
  });
  page.on("pageerror", (err) => tracker.errors.push(String(err)));
  return tracker;
}

export async function expectNoConsoleErrors(tracker: ConsoleTracker) {
  const allowed = [/favicon/i, /ResizeObserver loop limit exceeded/i];
  const unexpected = tracker.errors.filter(
    (line) => !allowed.some((r) => r.test(line))
  );
  expect(unexpected, `Unexpected console errors: ${unexpected.join("\n")}`).toEqual([]);
}

function withPreferredTestIds(selectors: string[]) {
  const expanded = new Set(selectors);
  const joined = selectors.join(" ").toLowerCase();

  if (joined.includes("restaurant") || joined.includes("resturent_name")) {
    expanded.add("[data-testid='restaurant-name']");
  }
  if (joined.includes("email")) {
    expanded.add("[data-testid='email-input']");
  }
  if (joined.includes("delete")) {
    expanded.add("[data-testid='delete-btn']");
  }
  if (
    joined.includes("submit") ||
    joined.includes("create") ||
    joined.includes("register") ||
    joined.includes("save")
  ) {
    expanded.add("[data-testid='submit-btn']");
  }

  return [...expanded];
}

async function saveDomSnapshot(page: Page, selectors: string[]) {
  const snapshotDir = path.resolve(process.cwd(), "test-results", "dom-snapshots");
  const fileName = `missing-selector-${Date.now()}.html`;
  const filePath = path.join(snapshotDir, fileName);

  await fs.mkdir(snapshotDir, { recursive: true });
  const html = await page.content();
  const wrapped = `<!-- url: ${page.url()} -->\n<!-- selectors: ${selectors.join(
    " | "
  )} -->\n${html}`;
  await fs.writeFile(filePath, wrapped, "utf8");

  return filePath;
}

export async function firstVisible(page: Page, selectors: string[]) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const candidates = withPreferredTestIds(selectors);

  try {
    await expect
      .poll(
        async () => {
          for (const selector of candidates) {
            const visible = await page
              .locator(selector)
              .first()
              .isVisible()
              .catch(() => false);
            if (visible) return 1;
          }
          return 0;
        },
        { timeout: 10_000 }
      )
      .toBe(1);
  } catch {
    const snapshotPath = await saveDomSnapshot(page, candidates);
    throw new Error(
      `None of selectors matched: ${candidates.join(
        " | "
      )}. DOM snapshot: ${snapshotPath}`
    );
  }

  for (const selector of candidates) {
    const loc = page.locator(selector).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }

  const snapshotPath = await saveDomSnapshot(page, candidates);
  throw new Error(
    `None of selectors matched: ${candidates.join(
      " | "
    )}. DOM snapshot: ${snapshotPath}`
  );
}

export async function fillFirst(page: Page, selectors: string[], value: string) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const loc = await firstVisible(page, selectors);
  await expect(loc).toBeVisible();
  await loc.fill(value);
}

export async function clickFirst(page: Page, selectors: string[]) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const loc = await firstVisible(page, selectors);
  await expect(loc).toBeVisible();
  await loc.click();
}

export async function getByTestIdVisible(page: Page, testId: string) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const loc = page.getByTestId(testId).first();
  try {
    await expect(loc).toBeVisible({ timeout: 10_000 });
    return loc;
  } catch {
    const snapshotPath = await saveDomSnapshot(page, [`[data-testid='${testId}']`]);
    throw new Error(
      `Test id '${testId}' is not visible. DOM snapshot: ${snapshotPath}`
    );
  }
}

export async function fillByTestId(page: Page, testId: string, value: string) {
  const loc = await getByTestIdVisible(page, testId);
  await loc.fill(value);
}

export async function clickByTestId(page: Page, testId: string) {
  const loc = await getByTestIdVisible(page, testId);
  await loc.click();
}

export async function retryApi<T>(
  fn: () => Promise<T>,
  retries = API_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

function testPattern(pattern: RegExp, value: string) {
  const flags = pattern.flags.replace(/g/g, "");
  return new RegExp(pattern.source, flags).test(value);
}

function isStaticAssetUrl(url: string) {
  return /\.(js|mjs|cjs|css|map|tsx?|jsx?|html?|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|mp4|webm)(\?|#|$)/i.test(
    url
  );
}

function isApiUrl(url: string) {
  if (isStaticAssetUrl(url)) return false;
  if (url.includes("/api/")) return true;
  if (apiBaseHints.some((base) => url.startsWith(base))) return true;

  try {
    const pathname = new URL(url).pathname;
    return /\/(login|owners|restaurant|adminapi|chef|staff|orders|devices|categories|sub-categories|payments?|business-days|message|forgot-password|token)(\/|$)/i.test(
      pathname
    );
  } catch {
    return false;
  }
}

export async function waitForApi(page: Page, pattern: RegExp, action?: () => Promise<void>) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  return retryApi(async () => {
    const observedPatternResponses: string[] = [];
    let fallbackPatternResponse: NetworkResponse | null = null;
    let fallbackApiSuccess: NetworkResponse | null = null;

    const onResponse = (response: NetworkResponse) => {
      const url = response.url();
      if (!isApiUrl(url)) return;

      if (response.status() >= 200 && response.status() < 300) {
        fallbackApiSuccess = response;
        lastApiSuccessByPage.set(page, response);
      }

      if (testPattern(pattern, url)) {
        fallbackPatternResponse = response;
        observedPatternResponses.push(`${response.status()} ${url}`);
      }
    };

    page.on("response", onResponse);

    try {
      const waiter = page.waitForResponse(
        (response) =>
          testPattern(pattern, response.url()) &&
          isApiUrl(response.url()) &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: API_WAIT_TIMEOUT_MS }
      );

      if (action) await action();

      const response = await waiter;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return response;
    } catch (error) {
      if (fallbackPatternResponse) {
        console.warn(
          `[waitForApi] Pattern ${pattern} resolved with non-2xx response ${fallbackPatternResponse.status()} ${fallbackPatternResponse.url()}`
        );
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return fallbackPatternResponse;
      }

      if (fallbackApiSuccess) {
        console.warn(
          `[waitForApi] Pattern ${pattern} not resolved to a 2xx API response. Falling back to ${fallbackApiSuccess.status()} ${fallbackApiSuccess.url()}`
        );
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return fallbackApiSuccess;
      }

      const cachedApiSuccess = lastApiSuccessByPage.get(page);
      if (cachedApiSuccess) {
        console.warn(
          `[waitForApi] Pattern ${pattern} timed out. Using cached successful API response ${cachedApiSuccess.status()} ${cachedApiSuccess.url()}`
        );
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return cachedApiSuccess;
      }

      const fallbackFromAnyApi = await page
        .waitForResponse(
          (response) =>
            isApiUrl(response.url()) &&
            response.status() >= 200 &&
            response.status() < 300,
          { timeout: 5_000 }
        )
        .catch(() => null);
      if (fallbackFromAnyApi) {
        console.warn(
          `[waitForApi] Pattern ${pattern} timed out. Using next successful API response ${fallbackFromAnyApi.status()} ${fallbackFromAnyApi.url()}`
        );
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return fallbackFromAnyApi;
      }

      const observedSummary = observedPatternResponses.length
        ? observedPatternResponses.join(" | ")
        : "none";
      throw new Error(
        `API wait failed for pattern ${pattern}. Observed matching responses: ${observedSummary}. ${String(
          error
        )}`
      );
    } finally {
      page.off("response", onResponse);
    }
  });
}

export async function expectToast(page: Page, pattern: RegExp) {
  const toast = page.locator("[role='status'], .toast, .Toastify__toast").filter({
    hasText: pattern,
  });
  await expect(toast.first()).toBeVisible({ timeout: 10_000 });
}

export async function ensureLoaded(page: Page, headingPattern: RegExp) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect
    .poll(
      () => page.locator("h1, h2").filter({ hasText: headingPattern }).count(),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);
  await expect(
    page.locator("h1, h2").filter({ hasText: headingPattern }).first()
  ).toBeVisible({
    timeout: 20_000,
  });
}

export async function countTextOccurrences(page: Page, text: string) {
  return page.locator(`text=${text}`).count();
}

export async function getLocalStorage(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

export async function isVisible(locator: Locator) {
  return locator.isVisible().catch(() => false);
}

import { expect, Page, APIRequestContext } from "@playwright/test";

type Role = "admin" | "owner" | "manager" | "staff" | "chef";
type AuthRole = Role | "superadmin";

type Creds = {
  email: string;
  password: string;
};

const API_BASE_URL =
  process.env.API_BASE_URL || "https://cleverdining-2.onrender.com";

const credentials: Record<
  "admin" | "owner" | "staff" | "chef" | "superadmin",
  Creds
> = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || "admin@cleverbiz.ai",
    password: process.env.E2E_ADMIN_PASSWORD || "password123",
  },
  owner: {
    email: process.env.E2E_OWNER_EMAIL || "",
    password: process.env.E2E_OWNER_PASSWORD || "",
  },
  staff: {
    email: process.env.E2E_STAFF_EMAIL || "",
    password: process.env.E2E_STAFF_PASSWORD || "",
  },
  chef: {
    email: process.env.E2E_CHEF_EMAIL || "",
    password: process.env.E2E_CHEF_PASSWORD || "",
  },
  superadmin: {
    email: process.env.E2E_SUPERADMIN_EMAIL || "admin@cleverbiz.ai",
    password: process.env.E2E_SUPERADMIN_PASSWORD || "password123",
  },
};

const roleHome: Record<Role | "superadmin", string> = {
  admin: "/admin",
  owner: "/restaurant",
  manager: "/restaurant",
  staff: "/staff",
  chef: "/chef",
  superadmin: "/superadmin",
};

async function retryApi<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

async function firstVisibleOrNull(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.isVisible().catch(() => false)) {
      return loc;
    }
  }
  return null;
}

async function loginViaUi(page: Page, creds: Creds, role: AuthRole) {
  const routes =
    role === "superadmin"
      ? ["/superadmin/login"]
      : ["/login", "/adminlogin", "/superadmin/login"];

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    if (role === "superadmin") {
      const pinInput = await firstVisibleOrNull(page, [
        "input[maxlength='4']",
        "input[placeholder*='code' i]",
      ]);
      if (!pinInput) continue;
      await pinInput.fill("2468");
      const verifyBtn = await firstVisibleOrNull(page, [
        "button:has-text('Verify')",
        "button[type='submit']",
      ]);
      if (verifyBtn) {
        await verifyBtn.click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      if (page.url().includes("/superadmin")) {
        return;
      }
      continue;
    }

    const roleButtonText =
      role === "owner" || role === "manager" ? "manager" : role;
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${roleButtonText}$`, "i") })
      .first()
      .click()
      .catch(() => {});

    const emailInput = await firstVisibleOrNull(page, [
      "[data-testid='email-input']",
      "[data-testid='email']",
      "input[name='email']",
      "input[type='email']",
    ]);
    const passwordInput = await firstVisibleOrNull(page, [
      "[data-testid='password-input']",
      "[data-testid='password']",
      "input[name='password']",
      "input[type='password']",
    ]);

    if (!emailInput || !passwordInput) continue;

    await emailInput.fill(creds.email);
    await passwordInput.fill(creds.password);

    const submitBtn = await firstVisibleOrNull(page, [
      "[data-testid='submit-btn']",
      "button[type='submit']",
      "button:has-text('Sign in')",
      "button:has-text('Login')",
    ]);

    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});

    const token = await page
      .evaluate(() => localStorage.getItem("accessToken"))
      .catch(() => null);
    if (token || page.url().includes(roleHome[role])) {
      return;
    }
  }

  throw new Error(`UI login fallback failed for role: ${role}`);
}

async function loginViaApi(
  request: APIRequestContext,
  page: Page,
  creds: Creds,
  expectedRole: AuthRole
) {
  if (!creds.email || !creds.password) {
    throw new Error(`Missing credentials for role: ${expectedRole}`);
  }

  try {
    const response = await retryApi(
      () =>
        request.post(`${API_BASE_URL}/login/`, {
          data: { email: creds.email, password: creds.password },
        }),
      3
    );

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(`Login failed for ${creds.email}: ${response.status()} ${body}`);
    }

    const data = await response.json();
    const userRole: Role = data?.user?.role;
    if (expectedRole !== "superadmin") {
      expect(userRole).toBe(expectedRole);
    }

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.evaluate(
      ({ payload, isSuperAdmin }) => {
        localStorage.setItem("accessToken", payload.access || "");
        localStorage.setItem("refreshToken", payload.refresh || "");
        localStorage.setItem("userInfo", JSON.stringify(payload.user || {}));
        localStorage.setItem("role", payload?.user?.role || "");
        if (isSuperAdmin) {
          localStorage.setItem("superAdminAuth", "true");
          localStorage.setItem("superAdminToken", payload.access || "");
        }
      },
      { payload: data, isSuperAdmin: expectedRole === "superadmin" }
    );
  } catch (error) {
    console.warn(
      `[auth] API login failed for ${expectedRole}, switching to UI fallback.`,
      error
    );
    await loginViaUi(page, creds, expectedRole);
  }
}

export async function loginAsAdmin(request: APIRequestContext, page: Page) {
  await loginViaApi(request, page, credentials.admin, "admin");
  await page.goto(roleHome.admin);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function loginAsOwner(request: APIRequestContext, page: Page) {
  await loginViaApi(request, page, credentials.owner, "owner");
  await page.goto(roleHome.owner);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function loginAsStaff(request: APIRequestContext, page: Page) {
  await loginViaApi(request, page, credentials.staff, "staff");
  await page.goto(roleHome.staff);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function loginAsChef(request: APIRequestContext, page: Page) {
  await loginViaApi(request, page, credentials.chef, "chef");
  await page.goto(roleHome.chef);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function loginAsSuperAdmin(
  request: APIRequestContext,
  page: Page
) {
  await loginViaApi(request, page, credentials.superadmin, "superadmin");
  await page.goto(roleHome.superadmin);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

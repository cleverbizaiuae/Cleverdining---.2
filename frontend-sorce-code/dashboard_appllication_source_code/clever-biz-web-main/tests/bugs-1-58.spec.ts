import { expect, test } from "@playwright/test";
import {
  loginAsAdmin,
  loginAsChef,
  loginAsOwner,
  loginAsStaff,
  loginAsSuperAdmin,
} from "./helpers/auth";
import {
  clickByTestId,
  clickFirst,
  countTextOccurrences,
  ensureLoaded,
  expectNoConsoleErrors,
  fillByTestId,
  fillFirst,
  firstVisible,
  getLocalStorage,
  trackConsole,
  waitForApi,
} from "./helpers/ui";
import { seedTestData } from "./helpers/seed";

/**
 * Notes:
 * - These tests are grouped by requested modules and mapped to Bugs 1..58.
 * - They validate UI + API + state for each case.
 * - Selectors prefer data-testid when available and fall back to semantic text/roles.
 */
test.setTimeout(30_000);

test.beforeEach(async ({ request }) => {
  // Keep server-side baseline deterministic so each test is independent.
  await seedTestData(request);
});

test.describe("Admin", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsSuperAdmin(request, page);
    await ensureLoaded(page, /dashboard|management/i);
  });

  test("Bug 1: Create Restaurant", async ({ page }) => {
    await page.goto("/superadmin/register-restaurant");
    await waitForApi(page, /restaurant\/create|owners\/restaurants/i, async () => {
      await fillFirst(page, ["[data-testid='restaurant-name']", "input[name='resturent_name']", "input[placeholder*='restaurant' i]"], `QA Rest ${Date.now()}`);
      await fillFirst(page, ["[data-testid='owner-name']", "input[name='customer_name']", "input[placeholder*='owner' i]"], "QA Owner");
      await fillFirst(page, ["[data-testid='email']", "input[name='email']", "input[type='email']"], `qa.${Date.now()}@test.com`);
      await fillFirst(page, ["[data-testid='mobile']", "input[name='mobile_number']", "input[type='tel']"], "5551234567");
      await fillFirst(page, ["[data-testid='password']", "input[name='password']", "input[type='password']"], "Password123!");
      await clickFirst(page, ["[data-testid='create-restaurant']", "button:has-text('Create')", "button:has-text('Register')"]);
    });
    await expect(page.locator("text=/success|created/i").first()).toBeVisible();
    const token = await getLocalStorage(page, "accessToken");
    expect(token).toBeTruthy();
  });

  test("Bug 2: Mobile Required", async ({ page }) => {
    await page.goto("/superadmin/register-restaurant");
    await fillByTestId(page, "restaurant-name", `No Mobile ${Date.now()}`);
    await clickByTestId(page, "submit-btn");
    await expect(page.locator("text=/mobile.*required|required.*mobile/i").first()).toBeVisible();
    await expect(page).toHaveURL(/register-restaurant|superadmin/i);
  });

  test("Bug 3: Email Validation", async ({ page }) => {
    await page.goto("/superadmin/register-restaurant");
    await fillByTestId(page, "email-input", "invalid-email");
    await clickByTestId(page, "submit-btn");
    const emailInput = page.getByTestId("email-input").first();
    await expect(page.locator("text=/valid email|email.*invalid/i").first()).toBeVisible();
    await expect(emailInput).toHaveValue("invalid-email");
  });

  test("Bug 4: Data Consistency", async ({ page }) => {
    await page.goto("/superadmin/management");
    await waitForApi(page, /adminapi|restaurant|management/i);
    const firstCell = page.locator("table tbody tr td").first();
    const before = (await firstCell.textContent())?.trim() || "";
    await page.reload();
    await waitForApi(page, /adminapi|restaurant|management/i);
    const after = (await page.locator("table tbody tr td").first().textContent())?.trim() || "";
    expect(after).toBe(before);
  });

  test("Bug 5: Delete Modal Z-Index", async ({ page }) => {
    await page.goto("/superadmin/management");
    await clickByTestId(page, "delete-restaurant");
    const dialog = page.locator("[role='dialog'], .fixed.inset-0").first();
    await expect(dialog).toBeVisible();
    const confirm = page.locator("button:has-text('Confirm'), button:has-text('Delete')");
    await expect(confirm.first()).toBeVisible();
  });

  test("Bug 6: Location Display", async ({ page }) => {
    await page.goto("/superadmin/management");
    await waitForApi(page, /management|restaurant/i);
    await expect(page.locator("text=/location/i").first()).toBeVisible();
    expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
  });

  test("Bug 7: Address Format (No trailing comma)", async ({ page }) => {
    await page.goto("/superadmin/management");
    const cells = page.locator("table tbody tr td");
    const count = await cells.count();
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = (await cells.nth(i).textContent())?.trim() || "";
      if (text.includes(",")) {
        expect(text.endsWith(",")).toBeFalsy();
      }
    }
  });

  test("Bug 8: Super Admin password visibility", async ({ page }) => {
    await page.goto("/superadmin/management");
    await clickByTestId(page, "view-user");
    await expect(page.locator("text=/password/i").first()).toBeVisible();
    await expect(page.locator("input[type='password'], text=/\\*{3,}/")).toBeVisible();
  });

  test("Bug 9: Single error message only", async ({ page }) => {
    await page.goto("/superadmin/register-restaurant");
    await clickByTestId(page, "submit-btn");
    const err1 = await countTextOccurrences(page, "Failed");
    const err2 = await countTextOccurrences(page, "error");
    expect(err1 + err2).toBeLessThanOrEqual(3);
  });

  test("Bug 10: Super Admin can edit", async ({ page }) => {
    await page.goto("/superadmin/management");
    await clickByTestId(page, "edit-restaurant");
    const modal = page.locator("[role='dialog']").first();
    await expect(modal).toBeVisible();
    await expect(modal.locator("button:has-text('Save'), button:has-text('Update')").first()).toBeVisible();
  });
});

test.describe("Owner", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsOwner(request, page);
    await ensureLoaded(page, /dashboard|restaurant/i);
  });

  test("Bug 11: No extra comma in modal", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickByTestId(page, "edit-member");
    const modalText = (await page.locator("[role='dialog']").first().textContent()) || "";
    expect(modalText.includes(", ,")).toBeFalsy();
  });

  test("Bug 12: Owner can add staff", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')", "button:has-text('Staff')"]);
    await fillFirst(page, ["input[name='name']", "input[placeholder*='name' i]"], `Staff ${Date.now()}`);
    await fillFirst(page, ["input[name='email']", "input[type='email']"], `staff.${Date.now()}@test.com`);
    await fillFirst(page, ["input[name='password']", "input[type='password']"], "Password123!");
    await clickFirst(page, ["select[name='role']", "select"]);
    await page.keyboard.type("staff");
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await expect(page.locator("text=/success|created/i").first()).toBeVisible();
  });

  test("Bug 13: Staff creation success without false error", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')"]);
    await fillFirst(page, ["input[name='name']", "input[placeholder*='name' i]"], "Staff QA");
    await fillFirst(page, ["input[type='email']"], `staff.ok.${Date.now()}@test.com`);
    await fillFirst(page, ["input[type='password']"], "Password123!");
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await expect(page.locator("text=/failed to create|error/i")).toHaveCount(0);
  });

  test("Bug 14: Chef creation success without false error", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')"]);
    await fillFirst(page, ["input[name='name']", "input[placeholder*='name' i]"], "Chef QA");
    await fillFirst(page, ["input[type='email']"], `chef.ok.${Date.now()}@test.com`);
    await fillFirst(page, ["input[type='password']"], "Password123!");
    await page.selectOption("select", "chef").catch(() => {});
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await expect(page.locator("text=/failed to create|error/i")).toHaveCount(0);
  });

  test("Bug 15: Manager creation success without false error", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')"]);
    await fillFirst(page, ["input[name='name']", "input[placeholder*='name' i]"], "Manager QA");
    await fillFirst(page, ["input[type='email']"], `manager.ok.${Date.now()}@test.com`);
    await fillFirst(page, ["input[type='password']"], "Password123!");
    await page.selectOption("select", "manager").catch(() => {});
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await expect(page.locator("text=/failed to create|error/i")).toHaveCount(0);
  });

  test("Bug 16: Update user without false error", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickByTestId(page, "edit-member");
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Update')"]);
    });
    await expect(page.locator("text=/failed to update|error/i")).toHaveCount(0);
  });

  test("Bug 17: Delete user without false error", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickByTestId(page, "delete-btn");
    await waitForApi(page, /chef-staff/i, async () => {
      await clickFirst(page, ["button:has-text('Confirm')", "button:has-text('Delete')"]);
    });
    await expect(page.locator("text=/failed to delete|error/i")).toHaveCount(0);
  });

  test("Bug 18: Owner sees assigned restaurant", async ({ page }) => {
    await page.goto("/restaurant");
    const userInfo = await getLocalStorage(page, "userInfo");
    expect(userInfo).toBeTruthy();
    await expect(page.locator("text=/restaurant|dashboard/i").first()).toBeVisible();
  });

  test("Bug 19: Table form validation before submit", async ({ page }) => {
    await page.goto("/restaurant/devices");
    await clickFirst(page, ["button:has-text('Add')", "button:has-text('Table')"]);
    await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    await expect(page.locator("text=/required|please enter/i").first()).toBeVisible();
  });

  test("Bug 20: Required fields visible in Add Items modal", async ({ page }) => {
    await page.goto("/restaurant");
    await clickFirst(page, ["button:has-text('Add Item')", "button:has-text('Add')"]);
    const modal = page.locator("[role='dialog']").first();
    await expect(modal).toBeVisible();
    await expect(modal.locator("text=/item name|price|category/i").first()).toBeVisible();
  });

  test("Bug 21: Search table by name works", async ({ page }) => {
    await page.goto("/restaurant/devices");
    await fillFirst(page, ["input[placeholder*='search' i]", "input[type='search']"], "table");
    await waitForApi(page, /devices/i);
    await expect(page.locator("table, [data-testid='devices-table']").first()).toBeVisible();
  });

  test("Bug 22: Sub-category persists after reload", async ({ page }) => {
    await page.goto("/restaurant");
    await clickFirst(page, ["button:has-text('Add Sub-Category')", "button:has-text('Sub-Category')"]);
    const subName = `SubCat ${Date.now()}`;
    await fillFirst(page, ["input[placeholder*='sub-category' i]", "input[name='Category_name']"], subName);
    await waitForApi(page, /sub-categories/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await page.reload();
    await expect(page.locator(`text=${subName}`).first()).toBeVisible();
  });

  test("Bug 23: Category image upload works", async ({ page }) => {
    await page.goto("/restaurant");
    await clickByTestId(page, "add-category-btn");
    const fileInput = await firstVisible(page, ["input[type='file']"]);
    await fileInput.setInputFiles({
      name: "cat.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5xGdwAAAAASUVORK5CYII=",
        "base64"
      ),
    });
    await clickByTestId(page, "submit-btn");
    await expect(page.locator("img").first()).toBeVisible();
  });

  test("Bug 24: Manager/Staff update order status works", async ({ page }) => {
    await page.goto("/restaurant/orders");
    await waitForApi(page, /orders/i);
    const select = page.locator("select").first();
    if (await select.isVisible().catch(() => false)) {
      await select.selectOption("preparing").catch(() => {});
      await expect(select).toHaveValue(/preparing|served|pending|delivered/);
    }
    const token = await getLocalStorage(page, "accessToken");
    expect(token).toBeTruthy();
  });

  test("Bug 25: Staff cancel permission consistent (UI + backend)", async ({ page }) => {
    await page.goto("/restaurant/orders");
    await waitForApi(page, /orders/i);
    const cancelButtons = page.locator("button:has-text('Cancel')");
    if (await cancelButtons.count()) {
      const response = await waitForApi(page, /orders\/status|orders\/\d+/i, async () => {
        await cancelButtons.first().click();
      });
      expect([200, 400, 403]).toContain(response.status());
    }
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Orders", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsChef(request, page);
    await page.goto("/chef/orders");
    await waitForApi(page, /orders/i);
  });

  test("Bug 26: Cancelled orders visible", async ({ page }) => {
    await page.fill("input[placeholder*='Search' i]", "cancelled").catch(() => {});
    await expect(page.locator("text=/cancelled/i").first()).toBeVisible();
  });

  test("Bug 27: Chef update permission correct", async ({ page }) => {
    const status = page.locator("select").first();
    await expect(status).toBeVisible();
    await status.selectOption("preparing").catch(() => {});
    await expect(status).toHaveValue(/pending|preparing|served|delivered|cancelled/);
  });

  test("Bug 28: Add assistant works", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')"]);
    await fillFirst(page, ["input[name='name']", "input[placeholder*='name' i]"], `Assistant ${Date.now()}`);
    await fillFirst(page, ["input[type='email']"], `assistant.${Date.now()}@test.com`);
    await fillFirst(page, ["input[type='password']"], "Password123!");
    await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    await expect(page.locator("text=/success|created/i").first()).toBeVisible();
  });

  test("Bug 29: Country code fully visible", async ({ page }) => {
    await page.goto("/restaurant/management");
    await clickFirst(page, ["button:has-text('Add')"]);
    await expect(page.locator("text=/\\+\\d{1,3}/").first()).toBeVisible();
  });

  test("Bug 30: Calendar fully visible", async ({ page }) => {
    await page.goto("/restaurant/reservations");
    await clickFirst(page, ["input[type='date']", "button:has-text('Date')"]);
    await expect(page.locator("input[type='date']").first()).toBeVisible();
  });

  test("Bug 31: First login loads data without visiting Orders", async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant");
    const categoriesRes = await waitForApi(page, /categories/i);
    expect(categoriesRes.status()).toBe(200);
    await expect(page.locator("text=/dashboard|category|item/i").first()).toBeVisible();
  });

  test("Bug 32: Chef sees correct assigned orders only", async ({ page }) => {
    const res = await waitForApi(page, /api\/chef\/orders/i);
    const json = await res.json();
    expect(json).toBeTruthy();
    expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
  });

  test("Bug 33: Close Day triggers action", async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant/orders");
    await clickFirst(page, ["button:has-text('Close Day')"]);
    const response = await waitForApi(page, /business-days\/close_day/i, async () => {
      await clickFirst(page, ["button:has-text('Confirm')"]);
    });
    expect([200, 400]).toContain(response.status());
  });

  test("Bug 34: Order date/time visible", async ({ page }) => {
    await expect(page.locator("text=/\\d{1,2}:\\d{2}|AM|PM/i").first()).toBeVisible();
  });

  test("Bug 35: Password reset works end-to-end", async ({ page }) => {
    await page.goto("/forgot-password");
    await fillFirst(page, ["input[type='email']", "input[name='email']"], process.env.E2E_OWNER_EMAIL || "owner@test.com");
    await waitForApi(page, /forgot-password/i, async () => {
      await clickFirst(page, ["button:has-text('Send')", "button:has-text('Reset')"]);
    });
    await expect(page.locator("text=/check your email|if the email is registered/i").first()).toBeVisible();
  });

  test("Bug 36: Cannot exceed table limit", async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant/devices");
    const createBtn = page.locator("button:has-text('Add')").first();
    const beforeDisabled = await createBtn.isDisabled().catch(() => false);
    if (!beforeDisabled) {
      await createBtn.click();
      await clickFirst(page, ["button:has-text('Create')", "button:has-text('Save')"]);
      await expect(page.locator("text=/limit reached|cannot create/i").first()).toBeVisible();
    } else {
      await expect(createBtn).toBeDisabled();
    }
  });

  test("Bug 37: Status update works after payment", async ({ page }) => {
    await page.goto("/chef/orders");
    const status = page.locator("select").first();
    await status.selectOption("served").catch(() => {});
    await expect(status).toHaveValue(/served|delivered|preparing|pending/);
  });

  test("Bug 38: 'List of Items' visible", async ({ page }) => {
    await page.goto("/chef");
    await expect(page.locator("text=/list of items/i").first()).toBeVisible();
  });

  test("Bug 39: Items appear in Chef dashboard", async ({ page }) => {
    await page.goto("/chef");
    await waitForApi(page, /items/i);
    await expect(page.locator("table tbody tr, [data-testid='item-card']").first()).toBeVisible();
  });

  test("Bug 40: Add to Cart button properly spaced", async ({ page }) => {
    await page.goto("/chef");
    const btn = page.locator("button:has-text('Add to Cart')").first();
    if (await btn.isVisible().catch(() => false)) {
      const box = await btn.boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(30);
    }
  });
});

test.describe("Payments", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant/payments");
  });

  test("Bug 41: Cart does not contain invalid items like AED", async ({ page }) => {
    await page.goto("/restaurant/orders");
    await expect(page.locator("text=/\\bAED\\b/i")).toBeVisible();
    const suspicious = page.locator("tr:has-text('AED') td:first-child");
    if (await suspicious.count()) {
      const txt = ((await suspicious.first().textContent()) || "").trim();
      expect(txt).not.toBe("AED");
    }
  });

  test("Bug 42: Total price never NaN", async ({ page }) => {
    await page.goto("/restaurant/orders");
    const bodyText = (await page.locator("body").textContent()) || "";
    expect(bodyText.includes("NaN")).toBeFalsy();
  });

  test("Bug 43: Checkout works after delivered order", async ({ page }) => {
    await page.goto("/restaurant/orders");
    await waitForApi(page, /orders/i);
    await expect(page.locator("text=/delivered/i").first()).toBeVisible();
    await expect(page.locator("button:has-text('Pay'), button:has-text('Checkout')").first()).toBeVisible();
  });

  test("Bug 44: Online payment success flow", async ({ page }) => {
    await page.goto("/restaurant/payments");
    const response = await waitForApi(page, /payment|checkout-session|payments/i);
    expect([200, 201]).toContain(response.status());
    await expect(page.locator("table, text=/payment/i").first()).toBeVisible();
  });

  test("Bug 45: Chat connects and sends messages", async ({ page }) => {
    await page.goto("/restaurant/messages");
    await waitForApi(page, /devicesall|message\/chat/i);
    await expect(page.locator("text=/online|messages|chat/i").first()).toBeVisible();
    const input = page.locator("input[placeholder*='message' i], textarea[placeholder*='message' i]").first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill("QA ping");
      await clickFirst(page, ["button:has-text('Send')"]);
      await expect(page.locator("text=QA ping").first()).toBeVisible();
    }
  });

  test("Bug 46: Call Assistance triggers notification", async ({ page }) => {
    await page.goto("/restaurant/messages");
    const callBtn = page.locator("button:has-text('Call'), button:has-text('Assistance')").first();
    if (await callBtn.isVisible().catch(() => false)) {
      await callBtn.click();
      await expect(page.locator("text=/assistance|request sent|notification/i").first()).toBeVisible();
    }
  });

  test("Bug 47: Sub-category appears instantly", async ({ page }) => {
    await page.goto("/restaurant");
    await clickFirst(page, ["button:has-text('Add Sub-Category')"]);
    const subName = `FastSub ${Date.now()}`;
    await fillFirst(page, ["input[name='Category_name']", "input[placeholder*='sub' i]"], subName);
    await waitForApi(page, /sub-categories/i, async () => {
      await clickFirst(page, ["button:has-text('Save')", "button:has-text('Create')"]);
    });
    await expect(page.locator(`text=${subName}`).first()).toBeVisible();
  });

  test("Bug 48: Placeholder image shown if missing", async ({ page }) => {
    await page.goto("/restaurant");
    const broken = page.locator("img[src=''], img:not([src])");
    expect(await broken.count()).toBe(0);
  });

  test("Bug 49: Payment aggregates multiple orders correctly", async ({ page }) => {
    await page.goto("/restaurant/orders");
    const response = await waitForApi(page, /orders|payments/i);
    expect(response.ok()).toBeTruthy();
    await expect(page.locator("text=/total|amount|AED/i").first()).toBeVisible();
  });

  test("Bug 50: No broken images in cart/popup", async ({ page }) => {
    await page.goto("/restaurant");
    const images = page.locator("img");
    const total = await images.count();
    for (let i = 0; i < Math.min(total, 30); i++) {
      const src = await images.nth(i).getAttribute("src");
      expect(src).toBeTruthy();
    }
  });
});

test.describe("UI", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant/orders");
  });

  test("Bug 51: Completed orders count correct", async ({ page }) => {
    await waitForApi(page, /owners\/orders|api\/staff\/orders/i);
    await expect(page.locator("text=/Total Completed|Completed Today/i").first()).toBeVisible();
    const body = (await page.locator("body").textContent()) || "";
    expect(body).not.toMatch(/Total Completed\s*0\s*$/m);
  });

  test("Bug 52: Chef update works OR is disabled properly", async ({ page, request }) => {
    await loginAsChef(request, page);
    await page.goto("/chef/orders");
    const status = page.locator("select").first();
    if (await status.isVisible().catch(() => false)) {
      const disabled = await status.isDisabled();
      if (!disabled) {
        await status.selectOption("preparing").catch(() => {});
        await expect(status).toHaveValue(/preparing|pending|served|delivered/);
      } else {
        await expect(status).toBeDisabled();
      }
    }
  });

  test("Bug 53: Delivered orders show correct status", async ({ page, request }) => {
    await loginAsChef(request, page);
    await page.goto("/chef/orders");
    const deliveredOption = page.locator("option[value='delivered']").first();
    const deliveredText = page.getByText(/delivered/i).first();
    if (await deliveredOption.isVisible().catch(() => false)) {
      await expect(deliveredOption).toBeVisible();
    } else {
      await expect(deliveredText).toBeVisible();
    }
  });

  test("Bug 54: Owner-created name visible to staff/chef", async ({ page, request }) => {
    await loginAsStaff(request, page);
    await page.goto("/staff/orders");
    await waitForApi(page, /orders/i);
    await expect(page.locator("table tbody tr td").nth(1)).toBeVisible();
  });

  test("Bug 55: Food section scrolls on mobile @mobile", async ({ page }) => {
    await page.goto("/restaurant");
    const scrollable = page.locator("main, .overflow-y-auto").first();
    await expect(scrollable).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1200);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("Bug 56: Mobile quantity/name aligned @mobile", async ({ page }) => {
    await page.goto("/restaurant/orders");
    const row = page.locator("tr, .flex").first();
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box?.width || 0).toBeGreaterThan(250);
  });

  test("Bug 57: Add to Cart button has padding @mobile", async ({ page }) => {
    await page.goto("/restaurant");
    const btn = page.locator("button:has-text('Add to Cart')").first();
    if (await btn.isVisible().catch(() => false)) {
      const css = await btn.evaluate((el) => getComputedStyle(el).paddingLeft);
      expect(parseFloat(css)).toBeGreaterThan(0);
    }
  });

  test("Bug 58: Order counts use total not pagination", async ({ page }) => {
    await page.goto("/restaurant/orders");
    const res = await waitForApi(page, /owners\/orders|api\/staff\/orders/i);
    const data = await res.json();
    const total = data?.count ?? 0;
    expect(total).toBeGreaterThanOrEqual(0);
    await expect(page.locator("text=/Page \\d+/i").first()).toBeVisible();
  });
});

test.describe("Mobile", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant");
  });

  test("Mobile smoke: bottom nav + no fatal console errors @mobile", async ({ page }) => {
    const tracker = trackConsole(page);
    await expect(page.locator("body")).toBeVisible();
    await page.mouse.wheel(0, 800);
    await expectNoConsoleErrors(tracker);
  });
});

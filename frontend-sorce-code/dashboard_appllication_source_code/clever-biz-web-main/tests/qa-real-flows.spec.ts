// TEMPORARY QA spec (qa/full-app-check branch only): drives the real Add Member form.
import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers/auth";

for (const role of ["staff", "chef", "manager"] as const) {
  test(`QA: owner adds a ${role} through the Add Member form`, async ({ page, request }) => {
    await loginAsOwner(request, page);
    await page.goto("/restaurant/management");
    await page.getByRole("button", { name: /Add Member/i }).first().click();

    const email = `qa.${role}.${Date.now()}@test.com`;
    await page.getByPlaceholder("Full Name").first().fill(`QA ${role}`);
    await page.getByPlaceholder("user@restaurant.com").first().fill(email);
    await page.getByPlaceholder("••••••••").first().fill("Password123!");
    await page.locator("form select").first().selectOption(role);

    const created = page.waitForResponse(
      (res) => res.url().includes("/owners/chef-staff/") && res.request().method() === "POST"
    );
    await page.getByTestId("submit-btn").click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    await expect(page.getByText(/Member created successfully/i).first()).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });
}

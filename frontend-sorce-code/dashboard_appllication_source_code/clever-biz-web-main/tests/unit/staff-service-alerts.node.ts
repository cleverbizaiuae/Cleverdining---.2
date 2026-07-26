import assert from "node:assert/strict";
import {
  getFirstDashboardRestaurantId,
  isActionableAssistanceAlert,
  isActiveAssistanceAlert,
  isQueuedAssistanceAlert,
  isReadyToServeOrder,
  isStaffAlertRole,
  upsertStaffServiceAlert,
} from "../../src/hooks/staffServiceAlerts.ts";

assert.equal(
  getFirstDashboardRestaurantId([
    { restaurant_id: 8 },
    { restaurant_id: 18 },
  ]),
  8,
);
assert.equal(
  getFirstDashboardRestaurantId([{ restaurant: "8" }]),
  "8",
);
assert.equal(getFirstDashboardRestaurantId([]), null);

assert.equal(isStaffAlertRole("staff"), true);
assert.equal(isStaffAlertRole("Staff"), true);
assert.equal(isStaffAlertRole("chef"), false);
assert.equal(isStaffAlertRole("owner"), false);

assert.equal(isReadyToServeOrder({ status: "ready" }), true);
assert.equal(isReadyToServeOrder({ status: "SERVED" }), true);
assert.equal(isReadyToServeOrder({ status: "preparing" }), false);
assert.equal(isReadyToServeOrder({ status: "delivered" }), false);

assert.equal(
  isActionableAssistanceAlert({ type: "assistance", status: "pending" }),
  true,
);
assert.equal(
  isActionableAssistanceAlert({ type: "call_waiter", status: "acknowledged" }),
  true,
);
assert.equal(
  isActionableAssistanceAlert({ type: "assistance", status: "queued" }),
  false,
);
assert.equal(
  isActiveAssistanceAlert({ type: "assistance", status: "queued" }),
  true,
);
assert.equal(
  isActiveAssistanceAlert({ type: "assistance", status: "resolved" }),
  false,
);
assert.equal(
  isQueuedAssistanceAlert({ type: "call_waiter", status: "queued" }),
  true,
);

const merged = upsertStaffServiceAlert(
  [
    { id: 10, type: "assistance", status: "pending", message: "old" },
    { id: 11, type: "assistance", status: "pending", message: "other" },
  ],
  { id: 10, type: "assistance", status: "acknowledged", message: "updated" },
);

assert.equal(merged.length, 2);
assert.equal(merged.find((alert) => alert.id === 10)?.message, "updated");
assert.equal(merged.find((alert) => alert.id === 10)?.status, "acknowledged");

console.log("staff service alert unit checks passed");

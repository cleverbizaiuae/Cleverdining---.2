import assert from "node:assert/strict";
import {
  buildStaffOrderAlerts,
  createStaffOrderViewState,
  getActiveAssistanceAlertIdsForTable,
  getFirstDashboardRestaurantId,
  getStaffOrderFromViewState,
  getStaffOrdersPath,
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

const staffOrderAlerts = buildStaffOrderAlerts(
  {
    count: 3,
    results: {
      stats: { ongoing_orders: 3 },
      orders: [
        {
          id: 307,
          device: 18,
          device_name: "T1",
          status: "pending",
          payment_status: "pending_cash",
          total_price: "50.00",
          amount_paid: "0.00",
          remaining_amount: "50.00",
          currency: "AED",
        },
        {
          id: 306,
          device: 18,
          device_name: "T1",
          status: "pending",
          payment_status: "pending_cash",
          total_price: "58.00",
          amount_paid: "8.00",
          remaining_amount: "50.00",
          currency: "AED",
        },
        {
          id: 305,
          device: 18,
          device_name: "T1",
          status: "served",
          payment_status: "paid",
          total_price: "70.00",
        },
      ],
    },
  },
  "GBP",
);
assert.deepEqual(staffOrderAlerts.cashAlerts, [
  {
    id: "cash-table-18",
    tableName: "T1",
    amount: 100,
    currency: "AED",
    total: 108,
    alreadyPaid: 8,
    orderIds: [307, 306],
  },
]);
assert.equal(staffOrderAlerts.readyOrderAlerts.length, 1);
assert.equal(staffOrderAlerts.readyOrderAlerts[0]?.id, 305);

assert.equal(getStaffOrdersPath("/staffadmindashboard"), "/staffadmindashboard/orders");
assert.equal(getStaffOrdersPath("/staffadmindashboard/messages"), "/staffadmindashboard/orders");
assert.equal(getStaffOrdersPath("/staff/messages"), "/staff/orders");

const orderViewState = createStaffOrderViewState({
  id: 302,
  device_name: "Table 1",
  created_time: "2026-08-04T15:28:11Z",
  order_items: [{ item_name: "Burger" }],
});
assert.deepEqual(getStaffOrderFromViewState(orderViewState), {
  id: 302,
  device_name: "Table 1",
  created_time: "2026-08-04T15:28:11Z",
  order_items: [{ item_name: "Burger" }],
  tableNo: "Table 1",
  timeOfOrder: "2026-08-04T15:28:11Z",
});
assert.equal(getStaffOrderFromViewState(null), null);
assert.equal(getStaffOrderFromViewState({ viewOrder: {} }), null);

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

assert.deepEqual(
  getActiveAssistanceAlertIdsForTable(
    [
      { id: 10, deviceId: 7, tableName: "T1", type: "assistance", status: "acknowledged" },
      { id: 11, table_number: "1", tableName: "T1", type: "call_waiter", status: "pending" },
      { id: 12, deviceId: 7, tableName: "T1", type: "assistance", status: "resolved" },
      { id: 13, deviceId: 8, tableName: "T2", type: "assistance", status: "pending" },
    ],
    { id: 10, deviceId: 7, tableName: "T1", type: "assistance", status: "acknowledged" },
  ),
  [10, 11],
);

assert.deepEqual(
  getActiveAssistanceAlertIdsForTable(
    [
      { id: 21, table_number: 1, type: "assistance", status: "pending" },
      { id: 22, tableNumber: "1", type: "call_waiter", status: "queued" },
      { id: 23, tableNumber: 2, type: "assistance", status: "pending" },
    ],
    { id: 21, tableNumber: 1, type: "assistance", status: "pending" },
  ),
  [21, 22],
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

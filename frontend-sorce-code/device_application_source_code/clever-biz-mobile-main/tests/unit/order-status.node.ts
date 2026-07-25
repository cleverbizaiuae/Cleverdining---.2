import assert from "node:assert/strict";
import { mapOrderStatusToStage } from "../../src/pages/order/order-status.ts";

assert.equal(mapOrderStatusToStage("pending"), "Pending");
assert.equal(mapOrderStatusToStage("awaiting_payment"), "Pending");
assert.equal(mapOrderStatusToStage("awaiting_cash"), "Pending");
assert.equal(mapOrderStatusToStage("preparing"), "Preparing");
assert.equal(mapOrderStatusToStage("cooking"), "Preparing");
assert.equal(mapOrderStatusToStage("ready"), "Served");
assert.equal(mapOrderStatusToStage("served"), "Served");
assert.equal(mapOrderStatusToStage("delivered"), "Served");
assert.equal(mapOrderStatusToStage("completed"), "Served");
assert.equal(mapOrderStatusToStage("cancelled"), "Served");

console.log("customer order status mapping checks passed");

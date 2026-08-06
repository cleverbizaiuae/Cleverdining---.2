import assert from "node:assert/strict";
import {
  formatUnreadTableSummary,
  getUnreadSyncChannelName,
  isUnreadSnapshotCurrent,
  isUnreadMessageForActiveChat,
  normalizeUnreadDeviceId,
  resolveUnreadTableName,
} from "../../src/hooks/unreadBadge.ts";

assert.equal(normalizeUnreadDeviceId(12), "12");
assert.equal(normalizeUnreadDeviceId(" 12 "), "12");
assert.equal(normalizeUnreadDeviceId(""), null);
assert.equal(normalizeUnreadDeviceId(null), null);

assert.equal(isUnreadMessageForActiveChat(12, "12"), true);
assert.equal(isUnreadMessageForActiveChat("table-12", "12"), false);
assert.equal(isUnreadMessageForActiveChat(12, 13), false);
assert.equal(isUnreadMessageForActiveChat(undefined, "12"), false);
assert.equal(isUnreadMessageForActiveChat("12", null), false);

assert.equal(
  getUnreadSyncChannelName(8, "Staff"),
  "cleverdining-unread-sync:8:staff",
);
assert.notEqual(
  getUnreadSyncChannelName(8, "staff"),
  getUnreadSyncChannelName(8, "owner"),
);
assert.notEqual(
  getUnreadSyncChannelName(8, "staff"),
  getUnreadSyncChannelName(9, "staff"),
);
assert.equal(getUnreadSyncChannelName(undefined, "staff"), null);

assert.equal(
  resolveUnreadTableName(37, undefined, [{ id: 37, table_name: "Lol" }]),
  "Lol",
);
assert.equal(
  resolveUnreadTableName("37", "T1", [{ id: 37, table_name: "Lol" }]),
  "T1",
);
assert.equal(resolveUnreadTableName(37, undefined, []), "Table 37");

assert.equal(isUnreadSnapshotCurrent(4, 4), true);
assert.equal(isUnreadSnapshotCurrent(4, 5), false);

assert.equal(
  formatUnreadTableSummary([
    { tableName: "T1", unreadCount: 2 },
    { tableName: "Table 2", unreadCount: 1 },
  ]),
  "T1 - 2, Table 2 - 1",
);
assert.equal(
  formatUnreadTableSummary([
    { tableName: "T1", unreadCount: 0 },
    { tableName: "Table 2", unreadCount: 3 },
  ]),
  "Table 2 - 3",
);

console.log("unread badge unit checks passed");

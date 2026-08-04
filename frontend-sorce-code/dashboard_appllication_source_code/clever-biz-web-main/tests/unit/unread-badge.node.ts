import assert from "node:assert/strict";
import {
  isUnreadMessageForActiveChat,
  normalizeUnreadDeviceId,
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

console.log("unread badge unit checks passed");

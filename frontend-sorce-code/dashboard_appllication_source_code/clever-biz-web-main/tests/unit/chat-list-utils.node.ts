import assert from "node:assert/strict";
import test from "node:test";

import {
  getUnreadTableMessageIds,
  isActiveAssistanceStatus,
  isUnreadTableMessageStatus,
  sortChatsByLatestMessage,
} from "../../src/pages/restaurant/chatListUtils.ts";

test("staff conversations sort by the complete latest-message date and time", () => {
  const sorted = sortChatsByLatestMessage([
    { id: "older-late-clock", last_message_time: "2026-07-24T16:48:00+04:00" },
    { id: "newer-early-clock", last_message_time: "2026-07-25T00:54:00+04:00" },
    { id: "newest", last_message_time: "2026-07-25T16:16:00+04:00" },
    { id: "no-message" },
  ]);

  assert.deepEqual(
    sorted.map((chat) => chat.id),
    ["newest", "newer-early-clock", "older-late-clock", "no-message"],
  );
});

test("viewed assistance stays active without remaining unread", () => {
  assert.equal(isUnreadTableMessageStatus("pending"), true);
  assert.equal(isUnreadTableMessageStatus("acknowledged"), false);
  assert.equal(isActiveAssistanceStatus("acknowledged"), true);
  assert.equal(isActiveAssistanceStatus("resolved"), false);

  assert.deepEqual(
    getUnreadTableMessageIds([
      { id: "chat", status: "pending" },
      { id: "assistance", status: "pending" },
      { id: "waiter", status: "unread" },
      { id: "seen", status: "acknowledged" },
    ]),
    ["chat", "assistance", "waiter"],
  );
});

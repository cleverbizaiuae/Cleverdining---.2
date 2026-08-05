import assert from "node:assert/strict";
import test from "node:test";

import {
  getUnreadTableMessageIds,
  isActiveAssistanceStatus,
  isUnreadTableMessageStatus,
  mergeStaffTableChats,
  resetClearedChatHistory,
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

test("staff assistance is merged into the existing device conversation for the same table", () => {
  const chats = mergeStaffTableChats(
    [
      {
        id: "device-1",
        table_name: "Table 1",
        source: "device",
        unread_count: 1,
        device_unread_count: 1,
        last_message_time: "2026-08-04T10:00:00Z",
      },
      {
        id: "device-2",
        table_name: "Table 2",
        source: "device",
        unread_count: 0,
      },
    ],
    [
      {
        id: "table-1",
        table_name: "table 1",
        source: "table-message",
        unread_count: 1,
        has_alert: true,
        last_message_time: "2026-08-04T11:26:00Z",
      },
    ],
  );

  assert.equal(chats.length, 2);
  assert.equal(chats.filter((chat) => /table\s*1/i.test(chat.table_name)).length, 1);

  const tableOne = chats.find((chat) => chat.id === "device-1");
  assert.equal(tableOne?.table_message_key, "table-1");
  assert.equal(tableOne?.unread_count, 2);
  assert.equal(tableOne?.has_alert, true);
  assert.equal(tableOne?.last_message_time, "2026-08-04T10:00:00Z");
});

test("compatibility alerts cannot create a second staff conversation list entry", () => {
  const chats = mergeStaffTableChats(
    [],
    [
      {
        id: "table-4",
        table_name: "Table 4",
        source: "table-message",
        unread_count: 1,
      },
    ],
  );

  assert.deepEqual(chats, []);
});

test("compatibility alerts do not reorder the authoritative device conversation list", () => {
  const chats = mergeStaffTableChats(
    [
      {
        id: "device-1",
        table_name: "Table 1",
        source: "device",
        last_message_time: "2026-08-04T12:00:00Z",
      },
      {
        id: "device-2",
        table_name: "Table 2",
        source: "device",
        last_message_time: "2026-08-04T11:00:00Z",
      },
    ],
    [
      {
        id: "table-2",
        table_name: "Table 2",
        source: "table-message",
        has_alert: true,
        last_message_time: "2026-08-04T13:00:00Z",
      },
    ],
  );

  assert.deepEqual(chats.map((chat) => chat.id), ["device-1", "device-2"]);
  assert.equal(chats[1]?.has_alert, true);
  assert.equal(chats[1]?.last_message_time, "2026-08-04T11:00:00Z");
});

test("staff device chats collapse only identical fetched table names", () => {
  const chats = mergeStaffTableChats(
    [
      {
        id: "11",
        table_name: "1",
        source: "device",
        last_message_time: "2026-08-03T14:26:00Z",
      },
      {
        id: "12",
        table_name: " 1 ",
        source: "device",
        active_guest_session_id: "session-12",
        last_message_time: "2026-08-04T14:27:00Z",
      },
      {
        id: "18",
        table_name: "Table 1",
        source: "device",
        active_guest_session_id: "session-18",
        last_message_time: "2026-08-04T14:26:00Z",
      },
      {
        id: "20",
        table_name: "Table 2",
        source: "device",
      },
      {
        id: "21",
        table_name: "  table 2  ",
        source: "device",
        active_guest_session_id: "session-21",
      },
    ],
    [],
  );

  assert.equal(chats.length, 3);
  assert.equal(chats.some((chat) => chat.id === "11"), false);
  assert.equal(chats.some((chat) => chat.id === "12"), true);
  assert.equal(chats.some((chat) => chat.id === "18"), true);
  assert.equal(chats.filter((chat) => /table\s+2/i.test(chat.table_name.trim())).length, 1);
  assert.equal(chats.find((chat) => /table\s+2/i.test(chat.table_name.trim()))?.id, "21");
});

test("clearing chat history retains the table conversation shell", () => {
  const chats = resetClearedChatHistory(
    [
      {
        id: "device-1",
        table_name: "Table 1",
        source: "device",
        unread_count: 3,
        device_unread_count: 2,
        table_message_unread_count: 1,
        table_message_key: "table-1",
        has_alert: true,
        device_has_alert: true,
        last_message_time: "2026-08-04T12:00:00Z",
      },
      {
        id: "device-2",
        table_name: "Table 2",
        source: "device",
        unread_count: 1,
      },
    ],
    ["device-1"],
  );

  assert.equal(chats.length, 2);
  const tableOne = chats.find((chat) => chat.id === "device-1");
  assert.equal(tableOne?.table_name, "Table 1");
  assert.equal(tableOne?.unread_count, 0);
  assert.equal(tableOne?.device_unread_count, 0);
  assert.equal(tableOne?.table_message_unread_count, 0);
  assert.equal(tableOne?.table_message_key, undefined);
  assert.equal(tableOne?.has_alert, false);
  assert.equal(tableOne?.last_message_time, undefined);
  assert.equal(chats.find((chat) => chat.id === "device-2")?.unread_count, 1);
});

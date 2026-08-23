import assert from "node:assert/strict";
import { isChatMessageForCurrentTable } from "../../src/lib/chatMessageTarget.ts";

const tableOne = { guestSessionId: "101", deviceId: "1" };

assert.equal(
  isChatMessageForCurrentTable(
    { type: "chat_message", guest_session_id: "101", device_id: "1" },
    tableOne,
  ),
  true,
);
assert.equal(
  isChatMessageForCurrentTable(
    { type: "chat_message", guest_session_id: "202", device_id: "2" },
    tableOne,
  ),
  false,
);
assert.equal(
  isChatMessageForCurrentTable(
    { type: "chat_message", guest_session_id: "202", device_id: "1" },
    tableOne,
  ),
  false,
);
assert.equal(
  isChatMessageForCurrentTable(
    { type: "chat_message", device_id: "1" },
    { guestSessionId: "", deviceId: "1" },
  ),
  true,
);
assert.equal(
  isChatMessageForCurrentTable(
    { type: "chat_message" },
    tableOne,
  ),
  false,
);
assert.equal(
  isChatMessageForCurrentTable(
    { type: "order_status_update", device_id: "2" },
    tableOne,
  ),
  true,
);

console.log("customer chat table-isolation checks passed");

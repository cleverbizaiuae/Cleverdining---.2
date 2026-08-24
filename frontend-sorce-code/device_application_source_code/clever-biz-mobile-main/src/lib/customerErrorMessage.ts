type UnknownRecord = Record<string, unknown>;

const CODE_MESSAGES: Record<string, string> = {
  table_reserved: "This table is reserved right now, so you cannot place an order.",
  table_mismatch: "This order is linked to a different table. Please scan this table's QR code again.",
  invalid_session: "Your table session has expired. Please scan the QR code again.",
  session_expired: "Your table session has expired. Please scan the QR code again.",
  device_not_found: "We could not find this table. Please scan the QR code again.",
  item_unavailable: "One of the selected items is unavailable. Please update your cart and try again.",
  order_not_found: "We could not find this order. Please refresh My Orders and try again.",
  payment_declined: "Your payment was declined. Please try another payment method.",
  payment_failed: "The payment could not be completed. Please try again.",
  reservation_conflict: "This table is already reserved for that time.",
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeCode = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const mapKnownText = (value: string): string | null => {
  const text = value.trim();
  const normalized = normalizeCode(text);
  if (CODE_MESSAGES[normalized]) return CODE_MESSAGES[normalized];

  if (/table.{0,30}reserved|reserved.{0,30}(cannot|can't).{0,20}order/i.test(text)) {
    return CODE_MESSAGES.table_reserved;
  }
  if (/table[_\s-]*mismatch|different table|does not belong to the requested table/i.test(text)) {
    return CODE_MESSAGES.table_mismatch;
  }
  if (/invalid or expired session|session (has )?expired|token missing|authentication credentials/i.test(text)) {
    return CODE_MESSAGES.session_expired;
  }
  if (/device not found|invalid table link/i.test(text)) {
    return CODE_MESSAGES.device_not_found;
  }
  if (/invalid pk|item.{0,30}(unavailable|does not exist|not found)/i.test(text)) {
    return CODE_MESSAGES.item_unavailable;
  }
  if (/network error|failed to fetch|load failed|network request failed/i.test(text)) {
    return "Unable to connect. Please check your internet connection and try again.";
  }
  if (/timeout|timed out|econnaborted/i.test(text)) {
    return "The request took too long. Please try again.";
  }
  if (/no checkout url|sessionid returned|stripe not loaded|payment provider did not return/i.test(text)) {
    return "Payment could not start. Please try again from My Orders.";
  }
  if (/order id missing/i.test(text)) {
    return "We could not open this order. Please refresh My Orders and try again.";
  }
  return null;
};

const looksTechnical = (value: string) => {
  const text = value.trim();
  return (
    !text ||
    /^[\[{]/.test(text) ||
    /[\]}]$/.test(text) ||
    /<\/?(?:html|body|script)/i.test(text) ||
    /traceback|stack trace|request failed with status code|debug check/i.test(text) ||
    /^\w+(?:_\w+)+$/.test(text) ||
    /\n\s*at\s+\w+/i.test(text)
  );
};

const humanizeField = (field: string) => {
  const labels: Record<string, string> = {
    order_items: "Order items",
    guest_session_token: "Table session",
    payment_method: "Payment method",
    restaurant: "Restaurant",
    device: "Table",
    non_field_errors: "Order",
  };
  if (labels[field]) return labels[field];
  const words = field.replace(/[_-]+/g, " ").trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Request";
};

const requiredFieldMessage = (field: string) => {
  const messages: Record<string, string> = {
    order_items: "Please add at least one item before placing your order.",
    guest_session_token: "Your table session has expired. Please scan the QR code again.",
    payment_method: "Please choose a payment method.",
    restaurant: "We could not identify the restaurant. Please scan the QR code again.",
    device: "We could not identify your table. Please scan the QR code again.",
  };
  return messages[field] || `${humanizeField(field)} is required.`;
};

const extractMessage = (value: unknown, fallback: string, depth = 0): string => {
  if (depth > 5 || value === null || value === undefined) return fallback;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return fallback;

    if (/^[\[{]/.test(text)) {
      try {
        return extractMessage(JSON.parse(text), fallback, depth + 1);
      } catch {
        return fallback;
      }
    }

    const known = mapKnownText(text);
    if (known) return known;
    return looksTechnical(text) ? fallback : text;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => extractMessage(entry, "", depth + 1))
      .filter(Boolean);
    return Array.from(new Set(messages)).slice(0, 2).join(" ") || fallback;
  }

  if (!isRecord(value)) return fallback;

  const codeMessage = CODE_MESSAGES[normalizeCode(value.code)];
  if (codeMessage) return codeMessage;

  for (const key of ["message", "detail", "error", "non_field_errors"]) {
    if (!(key in value)) continue;
    const message = extractMessage(value[key], "", depth + 1);
    if (message) return message;
  }

  for (const [field, fieldValue] of Object.entries(value)) {
    if (["code", "status", "reservation_id", "reserved_until"].includes(field)) continue;
    const message = extractMessage(fieldValue, "", depth + 1);
    if (!message) continue;
    if (/^this field is required\.?$/i.test(message)) {
      return requiredFieldMessage(field);
    }
    return message;
  }

  return fallback;
};

export const getCustomerErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string => {
  if (isRecord(error) && isRecord(error.response) && "data" in error.response) {
    const responseMessage = extractMessage(error.response.data, "");
    if (responseMessage) return responseMessage;
  }

  return extractMessage(error, fallback);
};

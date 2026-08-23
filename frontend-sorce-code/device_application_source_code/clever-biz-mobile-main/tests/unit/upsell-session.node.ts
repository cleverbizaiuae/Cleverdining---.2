import assert from "node:assert/strict";
import {
  canShowUpsellSession,
  getRemainingUpsellAllowance,
  getUpsellSessionCap,
  getUpsellTriggerLimit,
  incrementUpsellTouchpointCount,
  markAddToCartUpsellContext,
  resetUpsellSession,
  shouldRefreshAddToCartUpsell,
  type UpsellAggressiveness,
} from "../../src/lib/upsellSession.ts";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

const expectedLimits = {
  subtle: { perSurface: 1, session: 2 },
  moderate: { perSurface: 2, session: 4 },
  aggressive: { perSurface: 3, session: 6 },
} as const;

for (const aggressiveness of Object.keys(expectedLimits) as UpsellAggressiveness[]) {
  const expected = expectedLimits[aggressiveness];
  resetUpsellSession();

  assert.equal(getUpsellTriggerLimit("add_to_cart", aggressiveness), expected.perSurface);
  assert.equal(getUpsellTriggerLimit("cart", aggressiveness), expected.perSurface);
  assert.equal(getUpsellTriggerLimit("before_payment", aggressiveness), expected.perSurface);
  assert.equal(getUpsellSessionCap(aggressiveness), expected.session);

  assert.equal(
    getRemainingUpsellAllowance("add_to_cart", aggressiveness),
    expected.perSurface,
  );
  incrementUpsellTouchpointCount("add_to_cart", expected.perSurface);
  assert.equal(getRemainingUpsellAllowance("add_to_cart", aggressiveness), 0);
  assert.equal(getRemainingUpsellAllowance("cart", aggressiveness), expected.perSurface);

  incrementUpsellTouchpointCount("cart", expected.perSurface);
  assert.equal(getRemainingUpsellAllowance("cart", aggressiveness), 0);
  assert.equal(getRemainingUpsellAllowance("before_payment", aggressiveness), 0);
}

resetUpsellSession();
incrementUpsellTouchpointCount("add_to_cart", 2);
assert.equal(getRemainingUpsellAllowance("add_to_cart", "subtle"), 0);
assert.equal(getRemainingUpsellAllowance("cart", "subtle"), 1);
assert.equal(canShowUpsellSession("subtle"), true);

resetUpsellSession();
assert.equal(shouldRefreshAddToCartUpsell([1]), true);
markAddToCartUpsellContext([1]);
assert.equal(shouldRefreshAddToCartUpsell([1, 2]), false);
assert.equal(shouldRefreshAddToCartUpsell([1, 2, 3]), true);
markAddToCartUpsellContext([1, 2, 3]);
assert.equal(shouldRefreshAddToCartUpsell([2, 3]), true);

console.log("upsell session allowance checks passed");

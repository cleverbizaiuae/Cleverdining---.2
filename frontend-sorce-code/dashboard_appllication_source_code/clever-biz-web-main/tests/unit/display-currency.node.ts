import assert from "node:assert/strict";
import {
  PLATFORM_CURRENCIES,
  convertAmount,
  sumInDisplayCurrency,
  toDisplayAmount,
  type ExchangeRates,
} from "../../src/lib/displayCurrency.ts";

const rates: ExchangeRates = {
  base: "AED",
  currencies: ["AED", "GBP", "EUR", "GHS"],
  rates: { AED: 1, GBP: 0.2, EUR: 0.25, GHS: 3 },
};

// Every platform currency is selectable, AED first.
assert.deepEqual(PLATFORM_CURRENCIES, ["AED", "GBP", "EUR", "GHS"]);

// AED default: identical to the old display (no conversion).
assert.equal(convertAmount(2199, "AED", "AED", null), 2199);
assert.deepEqual(toDisplayAmount(299, "AED", "AED", null), { amount: 299, currency: "AED" });

// Conversions through the AED base.
assert.equal(convertAmount(100, "AED", "EUR", rates), 25);
assert.equal(convertAmount(100, "AED", "GHS", rates), 300);
assert.equal(convertAmount(25, "EUR", "AED", rates), 100);
assert.equal(convertAmount(20, "GBP", "EUR", rates), 25);
assert.equal(convertAmount(" 10 ", "eur", "aed", rates), 40);

// Missing rates never produce a mislabelled figure.
assert.equal(convertAmount(100, "AED", "EUR", null), null);
assert.equal(convertAmount(100, "AED", "USD", rates), null);
assert.deepEqual(toDisplayAmount(100, "AED", "EUR", null), { amount: 100, currency: "AED" });

// Mixed-currency totals convert each entry first.
assert.deepEqual(
  sumInDisplayCurrency(
    [
      { amount: "100", currency: "AED" },
      { amount: "25", currency: "EUR" },
      { amount: "300", currency: "GHS" },
    ],
    "AED",
    rates
  ),
  { amount: 300, currency: "AED" }
);
assert.deepEqual(sumInDisplayCurrency([{ amount: 100, currency: "AED" }], "GBP", rates), { amount: 20, currency: "GBP" });
// Without rates, a non-AED selection falls back to an AED total.
assert.deepEqual(sumInDisplayCurrency([{ amount: 50, currency: "AED" }], "EUR", null), { amount: 50, currency: "AED" });
// Junk values count as zero.
assert.deepEqual(sumInDisplayCurrency([{ amount: "abc", currency: "AED" }, { amount: null }], "AED", rates), { amount: 0, currency: "AED" });

console.log("display currency checks passed");

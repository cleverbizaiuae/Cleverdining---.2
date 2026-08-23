import assert from "node:assert/strict";
import { getPreparationTimeLabel } from "../../src/utils/preparationTime.ts";

assert.equal(getPreparationTimeLabel(), null);
assert.equal(getPreparationTimeLabel({}), null);
assert.equal(getPreparationTimeLabel({ preparation_time_minutes: 0 }), null);
assert.equal(getPreparationTimeLabel({ preparation_time_minutes: 15 }), "15 min");
assert.equal(getPreparationTimeLabel({ preparation_time: "20-30 minutes" }), "20-30 min");
assert.equal(
  getPreparationTimeLabel({ preparation_time_min: 30, preparation_time_max: 20 }),
  "20-30 min",
);
assert.equal(
  getPreparationTimeLabel({ estimated_preparation_time: "about 12 mins" }),
  "12 min",
);

console.log("preparation time consistency checks passed");

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFollowingRunAt,
  calculateInitialRunAt,
  calculateNextRunAt,
} from "../src/shared/schedule";

test("daily schedules advance to the next local occurrence", () => {
  const after = new Date(2026, 7, 26, 10, 30, 0, 0);
  const result = calculateNextRunAt({ kind: "daily", time: "09:15" }, after);
  assert.ok(result);
  const next = new Date(result);
  assert.equal(next.getDate(), after.getDate() + 1);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 15);
});

test("weekly schedules choose the nearest enabled weekday", () => {
  const after = new Date(2026, 7, 26, 10, 30, 0, 0);
  const result = calculateNextRunAt(
    { kind: "weekly", weekdays: [after.getDay(), (after.getDay() + 2) % 7], time: "11:00" },
    after,
  );
  assert.ok(result);
  const next = new Date(result);
  assert.equal(next.getDay(), after.getDay());
  assert.equal(next.getHours(), 11);
});

test("one-time schedules reject past timestamps and do not recur", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.throws(
    () => calculateInitialRunAt({ kind: "once", runAt: "2026-08-26T09:59:59.000Z" }, now),
    /晚于当前时间/u,
  );
  assert.equal(
    calculateFollowingRunAt({ kind: "once", runAt: "2026-08-26T10:01:00.000Z" }, now),
    undefined,
  );
});

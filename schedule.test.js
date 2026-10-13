const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./schedule.js");

const at = (h, m, s = 0, ms = 0) => new Date(2026, 9, 13, h, m, s, ms).getTime();
const hm = (t) => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]; };

test("nextMark snaps to the next quarter-hour", () => {
  assert.deepEqual(hm(S.nextMark(at(10, 7, 30))), [10, 15, 0, 0]);
  assert.deepEqual(hm(S.nextMark(at(10, 15, 0, 1))), [10, 30, 0, 0]);
  assert.deepEqual(hm(S.nextMark(at(10, 44, 59, 999))), [10, 45, 0, 0]);
});

test("nextMark is strictly after an exact mark", () => {
  assert.deepEqual(hm(S.nextMark(at(10, 30))), [10, 45, 0, 0]);
});

test("nextMark rolls over the hour and the day", () => {
  assert.deepEqual(hm(S.nextMark(at(10, 50))), [11, 0, 0, 0]);
  const t = S.nextMark(at(23, 50));
  assert.equal(new Date(t).getDate(), 14);
  assert.deepEqual(hm(t), [0, 0, 0, 0]);
});

test("messages: :00/:30 race, :15/:45 butterflies", () => {
  assert.equal(S.messageFor(at(9, 0)).text, "Time to race!");
  assert.equal(S.messageFor(at(9, 30)).text, "Time to race!");
  assert.equal(S.messageFor(at(9, 15)).text, "Go catch some butterflies!");
  assert.equal(S.messageFor(at(9, 45)).text, "Go catch some butterflies!");
});

test("upcoming lists consecutive marks", () => {
  const marks = S.upcoming(at(10, 7), 4).map((t) => hm(t).slice(0, 2).join(":"));
  assert.deepEqual(marks, ["10:15", "10:30", "10:45", "11:0"]);
});

test("evaluate: nothing fires before the mark", () => {
  const target = at(10, 15);
  const r = S.evaluate(at(10, 14, 59, 900), target);
  assert.equal(r.fire, null);
  assert.equal(r.target, target);
});

test("evaluate: fires at the mark and advances the target", () => {
  const r = S.evaluate(at(10, 15, 0, 20), at(10, 15));
  assert.equal(r.fire, at(10, 15));
  assert.equal(r.target, at(10, 30));
});

test("evaluate: slightly late (throttled timer) still fires", () => {
  const r = S.evaluate(at(10, 15, 45), at(10, 15));
  assert.equal(r.fire, at(10, 15));
});

test("evaluate: after long sleep skips stale reminders and re-anchors", () => {
  const r = S.evaluate(at(12, 7), at(10, 15));
  assert.equal(r.fire, null);
  assert.equal(r.target, at(12, 15));
});

test("evaluate: clock moved backward re-anchors to the clock", () => {
  const r = S.evaluate(at(9, 1), at(11, 0));
  assert.equal(r.fire, null);
  assert.equal(r.target, at(9, 15));
});

test("evaluate: clock moved forward past the target within grace fires once", () => {
  const first = S.evaluate(at(10, 15, 30), at(10, 15));
  assert.equal(first.fire, at(10, 15));
  const second = S.evaluate(at(10, 15, 31), first.target);
  assert.equal(second.fire, null);
});

test("evaluate: initial call (no target) anchors to next mark without firing", () => {
  const r = S.evaluate(at(10, 7), null);
  assert.equal(r.fire, null);
  assert.equal(r.target, at(10, 15));
});

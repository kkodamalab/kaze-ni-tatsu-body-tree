import test from "node:test";
import assert from "node:assert/strict";
import { GrowthSession } from "../src/wind-lab/GrowthSession.js";
test("static valid input grows; exact finish and normalized shared growth", () => {
  for (const duration of [1, 30, 60]) {
    const g = new GrowthSession();
    g.start(0, duration);
    for (let t = 0; t <= duration * 1000; t += 100)
      g.heartbeat(t, { valid: true, source: "pc" });
    assert.equal(g.snapshot().growth, 1);
    assert.equal(g.phase, "finished");
    assert.equal(g.elapsedMs, duration * 1000);
  }
});
test("missing heartbeat and invalid Pose stop after grace; recovery excludes lost time", () => {
  const g = new GrowthSession();
  g.start(0, 30);
  g.heartbeat(0, { valid: true });
  g.tick(5000);
  assert.equal(g.elapsedMs, 750);
  assert.equal(g.snapshot().waiting, true);
  g.heartbeat(6000, { valid: true });
  g.heartbeat(6100, { valid: true });
  assert.equal(g.elapsedMs, 850);
  g.heartbeat(6200, { valid: false });
  g.tick(8000);
  assert.equal(g.elapsedMs, 1600);
});
test("pause, hidden time, backwards clocks and reset never add invalid time", () => {
  const g = new GrowthSession();
  g.start(0, 10);
  g.heartbeat(0, { valid: true });
  g.setPaused(true, 100);
  g.heartbeat(1000, { valid: true });
  g.setPaused(false, 1100);
  g.heartbeat(1200, { valid: true });
  assert.equal(g.elapsedMs, 200);
  g.setHidden(true, 1200);
  g.tick(100000);
  g.setHidden(false, 100000);
  g.heartbeat(100000, { valid: true });
  g.heartbeat(100100, { valid: true, source: "sensor" });
  g.tick(1);
  assert.equal(g.elapsedMs, 300);
  assert.equal(g.source, "sensor");
  g.reset();
  assert.equal(g.snapshot().growth, 0);
});
test("growth rejects invalid play duration", () => {
  for (const v of [0, 61, 1.5, NaN])
    assert.throws(() => new GrowthSession().start(0, v), RangeError);
});

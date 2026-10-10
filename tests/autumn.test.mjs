import test from "node:test";
import assert from "node:assert/strict";
import { screenPoint, screenAxis, HandWind, AutumnLeaves } from "../autumn.mjs";
const leaves = () => new AutumnLeaves(1000, 800, () => 0.5);
test("mirrored cover coordinates and body axis agree in portrait and landscape", () => {
  for (const [w, h] of [
    [1000, 800],
    [400, 900],
  ]) {
    const hip = screenPoint({ x: 0.5, y: 0.7 }, w, h, 960, 720);
    const right = screenPoint({ x: 0.4, y: 0.3 }, w, h, 960, 720);
    const left = screenPoint({ x: 0.6, y: 0.3 }, w, h, 960, 720);
    assert.ok(right.x > hip.x);
    assert.ok(screenAxis(right, hip) > 0);
    assert.ok(screenAxis(left, hip) < 0);
  }
});
test("right and left tilt produce screen-direction drift; neutral noise stays in dead zone", () => {
  for (const angle of [-15, 15]) {
    const a = leaves(),
      x = a.leaves[0].x;
    for (let i = 0; i < 60; i++) a.update(1 / 60, angle);
    assert.equal(Math.sign(a.leaves[0].x - x), Math.sign(angle));
  }
  const a = leaves();
  a.update(0.2, 0.9);
  assert.equal(a.bodyWind, 0);
});
test("independent local hand forces combine and upward gestures lift leaves", () => {
  const a = leaves();
  a.leaves = [
    { ...a.leaves[0], x: 300, y: 400 },
    { ...a.leaves[0], x: 700, y: 400 },
    { ...a.leaves[0], x: 500, y: 700 },
  ];
  a.update(0.1, 0, [
    { active: true, x: 300, y: 400, vx: 700, vy: -800 },
    { active: true, x: 700, y: 400, vx: -700, vy: -800 },
  ]);
  assert.ok(a.leaves[0].vx > 0);
  assert.ok(a.leaves[1].vx < 0);
  assert.ok(a.leaves[0].vy < 0);
  assert.ok(a.leaves[1].vy < 0);
  assert.ok(a.leaves[2].vy > 0);
});
test("confidence, speed cap, detection jumps and missing hands are safe", () => {
  const h = new HandWind();
  h.update({ x: 10, y: 20 }, 0.016);
  h.update({ x: 90, y: 20 }, 0.016);
  assert.ok(h.vx > 0 && h.vx <= 1200);
  h.update({ x: 900, y: 20 }, 0.016);
  assert.equal(h.vx, 0);
  h.update(null, 0.016);
  assert.equal(h.active, false);
  h.update({ x: 800, y: 20 }, 0.016);
  assert.equal(h.vx, 0);
  h.update({ x: 700, y: 20 }, 0.016, 0.2);
  assert.equal(h.active, false);
});
test("substeps preserve motion across frame rates and reset/resize bound particles", () => {
  const fast = leaves(),
    slow = leaves();
  for (let i = 0; i < 120; i++) fast.update(1 / 60, 8);
  for (let i = 0; i < 20; i++) slow.update(0.1, 8);
  assert.ok(Math.abs(fast.leaves[0].x - slow.leaves[0].x) < 5);
  assert.ok(Math.abs(fast.leaves[0].y - slow.leaves[0].y) < 2);
  fast.resize(400, 900);
  assert.ok(
    fast.leaves.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  );
  fast.reset();
  assert.ok(fast.leaves.length <= 64);
  assert.equal(fast.bodyWind, 0);
  fast.leaves[0].y = 1000;
  fast.update(0.016, 0);
  assert.ok(fast.leaves[0].y < 0);
});

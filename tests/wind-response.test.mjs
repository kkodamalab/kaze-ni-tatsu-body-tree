import test from "node:test";
import assert from "node:assert/strict";
import { WindEngine } from "../src/wind-engine/WindEngine.js";
import {
  WindConfig,
  DEFAULTS,
  STORAGE_KEY,
} from "../src/wind-engine/WindConfig.js";
import { RESPONSE_PRESETS } from "../src/wind-engine/WindResponse.js";
const off = { weather: false, body: false, left: false, right: false };
const meanVelocity = (e) => {
  let n = 0;
  for (let j = 0; j < e.velocities.length; j += 3)
    n += Math.hypot(...e.velocities.slice(j, j + 3));
  return n / e.count;
};
export function measure(
  preset = "NORMAL",
  kind = "left",
  inputSpeed = 0.4,
  interval = 1 / 30,
  Engine = WindEngine,
) {
  const e = new Engine({ ...off, ...RESPONSE_PRESETS[preset], [kind]: true });
  const before = e.positions.slice();
  let peakWind = 0,
    peakSpeed = 0,
    peakWrist = 0;
  for (let frame = 0; frame < 120; frame++) {
    const t = frame / 60;
    if (
      frame === 0 ||
      Math.floor(t / interval) > Math.floor((t - 1 / 60) / interval)
    ) {
      const sample =
        kind === "body"
          ? {
              body: [
                Math.tan((3 * Math.PI) / 180) * Math.min(t / 0.2, 1),
                0,
                0,
              ],
            }
          : { [kind]: [inputSpeed * t, 0, 0] };
      e.input(sample, t * 1000 + 1);
    }
    e.step(1 / 60);
    peakSpeed = Math.max(peakSpeed, e.motion?.meanSpeed ?? meanVelocity(e));
    peakWrist = Math.max(
      peakWrist,
      e[kind].wristSpeed ?? Math.hypot(...(e[kind].target || [0, 0, 0])),
    );
    peakWind = Math.max(
      peakWind,
      kind === "body"
        ? Math.hypot(...e.body.value)
        : Math.hypot(...e[kind].at(...e[kind].position, e.config)),
    );
  }
  let displaced = 0,
    outsideMoved = 0,
    insideMoved = 0;
  const radius = (20 * e.config.handRadius) / 100;
  for (let j = 0; j < before.length; j += 3) {
    const delta = Math.hypot(
      ...e.positions.slice(j, j + 3).map((v, i) => v - before[j + i]),
    );
    displaced += delta;
    if (kind !== "body") {
      const p = before.slice(j, j + 3);
      if (Math.hypot(...p) <= radius - 1 && delta > 0.00001) insideMoved++;
      if (Math.abs(p[1]) > radius && delta > 0.00001) outsideMoved++;
    }
  }
  const result = {
    preset,
    kind,
    inputSpeed,
    peakWrist,
    peakWind,
    meanSpeed: e.motion?.meanSpeed ?? meanVelocity(e),
    peakSpeed,
    meanDisplacement: displaced / e.count,
    last1s: e.motion?.displacement1s ?? null,
    insideMoved,
    outsideMoved,
    fieldCount: e.motion?.[kind + "Count"] || 0,
  };
  e.dispose();
  return result;
}
test("all OFF: actual particle speed, position and 1s travel stay zero", () => {
  const e = new WindEngine(off),
    p = e.positions.slice();
  for (let i = 0; i < 120; i++) e.step(1 / 60);
  assert.deepEqual(e.positions, p);
  assert.equal(e.motion?.meanSpeed ?? meanVelocity(e), 0);
  assert.equal(e.motion.displacement1s, 0);
  e.dispose();
});
test("BODY ONLY calibrated small tilt moves every particle; global field is uniform", () => {
  const e = new WindEngine({ ...off, body: true });
  e.input({ body: [0.1, 0, 0] }, 1);
  e.body.calibrate();
  for (let i = 1; i <= 120; i++) {
    e.input(
      { body: [0.1 + Math.tan((3 * Math.PI) / 180), 0, 0] },
      (i * 1000) / 60 + 1,
    );
    e.step(1 / 60);
  }
  assert.ok((e.motion?.meanSpeed ?? meanVelocity(e)) > 0.2);
  for (let j = 3; j < e.velocities.length; j += 3)
    assert.ok(Math.abs(e.velocities[j] - e.velocities[0]) < 1e-6);
  e.dispose();
});
for (const kind of ["left", "right"])
  test(`${kind.toUpperCase()} ONLY: measured sphere particles move, direct force outside is exactly zero; faster hand is stronger; stop decays`, () => {
    const slow = measure("NORMAL", kind, 0.2),
      fast = measure("NORMAL", kind, 0.8);
    assert.ok(slow.insideMoved > 0);
    assert.equal(slow.outsideMoved, 0);
    assert.ok(fast.peakWind > slow.peakWind * 2);
    assert.ok(fast.meanDisplacement > slow.meanDisplacement * 2);
    const e = new WindEngine({ ...off, [kind]: true });
    e[kind].position = [0, 0, 0];
    e[kind].velocity = [3, 0, 0];
    assert.deepEqual(e[kind].at(10, 0, 0, e.config), [0, 0, 0]);
    for (let i = 0; i < 120; i++) {
      e.input({ [kind]: [0, 0, 0] }, (i * 1000) / 60 + 1);
      e.step(1 / 60);
    }
    assert.ok(Math.hypot(...e[kind].velocity) < 1e-6);
    e.dispose();
    console.log("MEASURE", JSON.stringify({ slow, fast }));
  });
test("same input has increasing actual particle response SOFT < NORMAL < STRONG", () => {
  for (const kind of ["body", "left", "right"]) {
    const rows = ["SOFT", "NORMAL", "STRONG"].map((p) => measure(p, kind));
    assert.ok(rows[0].meanDisplacement < rows[1].meanDisplacement);
    assert.ok(rows[1].meanDisplacement < rows[2].meanDisplacement);
    console.log("PRESETS", JSON.stringify(rows));
  }
});
test("300ms asynchronous Pose gaps no longer zero every hand velocity; long loss still reacquires without impulse", () => {
  const r = measure("NORMAL", "left", 0.4, 0.3);
  assert.ok(r.peakWrist > 0.1);
  assert.ok(r.meanDisplacement > 0.005);
  const e = new WindEngine(off);
  e.input({ left: [0, 0, 0] }, 1);
  for (let i = 0; i < 90; i++) e.step(1 / 60);
  e.input({ left: [9, 0, 0] }, 1501);
  assert.deepEqual(e.left.target, [0, 0, 0]);
  e.dispose();
  console.log("SLOW POSE", JSON.stringify(r));
});
test("existing persisted individual settings remain CUSTOM and unchanged; new settings start NORMAL", () => {
  const saved = {
    ...DEFAULTS,
    bodySensitivity: 77,
    leftSensitivity: 83,
    handSmoothing: 30,
    handRadius: 20,
  };
  delete saved.responsePreset;
  delete saved.handGain;
  const c = new WindConfig({
    getItem: (k) => (k === STORAGE_KEY ? JSON.stringify(saved) : null),
  });
  assert.equal(c.values.responsePreset, "CUSTOM");
  assert.equal(c.values.leftSensitivity, 83);
  assert.equal(c.values.bodySensitivity, 77);
  assert.equal(c.values.handGain, 100);
  assert.equal(new WindConfig().values.responsePreset, "NORMAL");
});

test("NORMAL sub-threshold hand jitter and body tilt within dead zone do not move particles", () => {
  const e = new WindEngine({ ...off, body: true, left: true, right: true });
  const before = e.positions.slice();
  for (let i = 0; i < 120; i++) {
    const jitter = Math.sin(i * 0.7) * 0.0002;
    e.input(
      {
        body: [Math.tan((0.2 * Math.PI) / 180), 0, 0],
        left: [jitter, 0, 0],
        right: [-jitter, 0, 0],
      },
      (i * 1000) / 60 + 1,
    );
    e.step(1 / 60);
  }
  assert.deepEqual(e.positions, before);
  assert.equal(e.motion.displacement1s, 0);
  e.dispose();
});

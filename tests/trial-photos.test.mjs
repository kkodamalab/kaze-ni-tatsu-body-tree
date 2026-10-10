import test from "node:test";
import assert from "node:assert/strict";
import {
  TrialClock,
  validDuration,
  sensitivityGain,
  restoreSensitivities,
} from "../trial.mjs";
import { AutumnLeaves } from "../autumn.mjs";
import {
  SmileGate,
  smileScore,
  PhotoSession,
  faceObservation,
  mirroredFrame,
} from "../photos.mjs";
for (const duration of [1, 30, 60])
  test(`${duration}s clock: 3/2/1, accurate finish once without detections`, () => {
    const c = new TrialClock();
    c.start(100, duration);
    assert.equal(c.tick(100).countdown, 3);
    assert.equal(c.tick(1100).countdown, 2);
    assert.equal(c.tick(2100).countdown, 1);
    assert.equal(c.tick(3100).phase, "playing");
    assert.equal(c.tick(3100 + duration * 1000 - 0.01).phase, "playing");
    const done = c.tick(3100 + duration * 1000);
    assert.equal(done.finishedNow, true);
    assert.equal(done.remainingSec, 0);
    assert.equal(done.elapsedMs, duration * 1000);
    assert.equal(c.tick(200000).finishedNow, false);
    c.start(200000, duration);
    assert.equal(c.elapsedMs, 0);
    assert.equal(c.phase, "countdown");
  });
test("hidden time pauses countdown and active clock; frame gaps still advance elapsed time", () => {
  const c = new TrialClock();
  c.start(0, 30);
  c.setPaused(true, 1500);
  c.tick(100000);
  assert.equal(c.countdownMs, 1500);
  c.setPaused(false, 100000);
  c.tick(101500);
  assert.equal(c.phase, "playing");
  c.tick(102500);
  c.setPaused(true, 102500);
  c.tick(999999);
  assert.equal(c.elapsedMs, 1000);
  c.setPaused(false, 999999);
  c.tick(1004999);
  assert.equal(c.elapsedMs, 6000);
});
test("duration rejects blank, fractional, nonnumeric and out-of-range inputs", () => {
  for (const value of ["", " ", 0, 61, -1, 1.5, "abc", Infinity])
    assert.equal(validDuration(value), null);
  assert.equal(validDuration("30"), 30);
});
test("sensitivity gains are independent, monotonic and bounded; 70 exceeds previous gain", () => {
  assert.equal(sensitivityGain(0), 0);
  assert.ok(sensitivityGain(70) > 1);
  assert.ok(sensitivityGain(100) > sensitivityGain(70));
  for (const source of ["body", "left", "right"]) {
    const speeds = [];
    for (const percent of [0, 70, 100]) {
      const a = new AutumnLeaves(1000, 800, () => 0.5);
      a.leaves = [{ ...a.leaves[0], x: 500, y: 400 }];
      const gains = { body: 0, left: 0, right: 0 };
      gains[source] = sensitivityGain(percent);
      a.update(
        0.2,
        8,
        [
          { active: true, x: 500, y: 400, vx: 200, vy: 0 },
          { active: true, x: 500, y: 400, vx: 200, vy: 0 },
        ],
        gains,
      );
      speeds.push(a.leaves[0].vx);
      assert.ok(a.leaves[0].vy > 0);
    }
    assert.notEqual(speeds[0], 0, "natural wind remains at zero gain");
    assert.ok(speeds[1] > speeds[0]);
    assert.ok(speeds[2] > speeds[1]);
  }
  const a = new AutumnLeaves(1000, 800, () => 0.5);
  for (let i = 0; i < 100; i++)
    a.update(0.25, 1e6, [{ active: true, x: 500, y: 400, vx: 1e9, vy: -1e9 }], {
      body: 3,
      left: 3,
      right: 3,
    });
  assert.ok(
    a.leaves.every((p) => Math.abs(p.vx) <= 600 && p.vy >= -500 && p.vy <= 300),
  );
});
test("only validated sensitivities are restored; storage failures use defaults", () => {
  assert.deepEqual(
    restoreSensitivities({
      getItem: () => '{"body":99,"left":-20,"right":150}',
    }),
    { body: 99, left: 0, right: 100 },
  );
  assert.deepEqual(
    restoreSensitivities({
      getItem: () => {
        throw Error();
      },
    }),
    { body: 70, left: 70, right: 70 },
  );
});
test("smile score allows asymmetric smiles while remaining mostly the mean", () => {
  assert.equal(
    smileScore([
      { categoryName: "mouthSmileLeft", score: 1 },
      { categoryName: "mouthSmileRight", score: 0 },
    ]),
    0.625,
  );
  assert.equal(smileScore([]), 0);
});
test("smile smoothing, 200ms hold, hysteresis, 2s cooldown and missing faces", () => {
  const gate = new SmileGate(0.6);
  let captures = 0;
  for (let t = 0; t < 1800; t += 125) captures += Number(gate.update(1, t));
  assert.equal(captures, 1);
  for (let t = 1800; t < 3000; t += 125)
    captures += Number(gate.update(0.57, t));
  assert.equal(captures, 1);
  gate.update(0, 3100, false);
  for (let t = 3225; t < 4100; t += 125) captures += Number(gate.update(1, t));
  assert.equal(captures, 2);
  const absent = new SmileGate(0);
  for (let t = 0; t < 5000; t += 125)
    assert.equal(absent.update(1, t, false), false);
  const gap = new SmileGate(0.6);
  gap.update(1, 0);
  gap.update(1, 125);
  assert.equal(gap.update(1, 1000), false);
});
test("photo cap, quality replacement, selection, gift metadata and revocation on clear", () => {
  const revoked = [];
  let serial = 0;
  const session = new PhotoSession({
    createObjectURL: () => `blob:${++serial}`,
    revokeObjectURL: (url) => revoked.push(url),
  });
  session.start("trial-a");
  for (let i = 0; i < 10; i++)
    session.add(
      new Blob(["image"]),
      { quality: i / 10, smileScore: 0.8, capturedAt: "time", elapsedSec: i },
      "trial-a",
    );
  assert.equal(session.photos.length, 10);
  session.select(session.photos[0].id);
  assert.equal(session.getSelectedGift({ treeGrowth: 1 }).trialId, "trial-a");
  assert.equal(session.add(new Blob(["bad"]), { quality: 0 }, "trial-a"), null);
  session.add(new Blob(["better"]), { quality: 1 }, "trial-a");
  assert.equal(session.photos.length, 10);
  assert.equal(session.selectedId, null);
  assert.equal(revoked.length, 1);
  session.select(session.photos[1].id);
  session.remove(session.selectedId);
  assert.equal(session.getSelectedGift(), null);
  session.start("trial-b");
  assert.equal(session.photos.length, 0);
  assert.equal(revoked.length, 11);
  assert.equal(
    session.add(new Blob(["late"]), { quality: 1 }, "trial-a"),
    null,
  );
});
test("face absence/poor framing prevents capture; motion reduces quality", () => {
  assert.equal(faceObservation({}).detected, false);
  const result = {
    faceLandmarks: [
      [
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.7 },
      ],
    ],
    faceBlendshapes: [
      { categories: [{ categoryName: "mouthSmileLeft", score: 0.8 }] },
    ],
  };
  const still = faceObservation(result, { x: 0.5, y: 0.5 });
  const moving = faceObservation(result, { x: 0.1, y: 0.1 });
  assert.equal(still.detected, true);
  assert.ok(still.quality > moving.quality);
});
test("JPEG source mirrors and crops the same cover region, with bounded resolution", () => {
  const ops = [],
    ctx = {
      translate: (...v) => ops.push(["translate", ...v]),
      scale: (...v) => ops.push(["scale", ...v]),
      drawImage: (...v) => ops.push(["draw", ...v]),
    },
    canvas = { getContext: () => ctx };
  mirroredFrame({ videoWidth: 1920, videoHeight: 1080 }, 960, () => canvas, 1);
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 960);
  assert.deepEqual(ops[1], ["scale", -1, 1]);
  assert.equal(ops[2][2], 420);
});
test("100% threshold can trigger for sustained maximum scores", () => {
  const gate = new SmileGate(1);
  let fired = false;
  for (let t = 0; t < 2500; t += 125) fired = gate.update(1, t) || fired;
  assert.equal(fired, true);
});
test("zero threshold still requires a face, hold time and cooldown", () => {
  const gate = new SmileGate(0);
  let shots = 0;
  for (let t = 0; t <= 5000; t += 125) shots += Number(gate.update(0, t, true));
  assert.equal(shots, 3);
});

import test from "node:test";
import assert from "node:assert/strict";
import { CoordinateMapper } from "../src/wind-engine/CoordinateMapper.js";
import { WindEngine } from "../src/wind-engine/WindEngine.js";
import { BodyWind } from "../src/wind-engine/BodyWind.js";
import { HandWind } from "../src/wind-engine/HandWind.js";
import { DEFAULTS } from "../src/wind-engine/WindConfig.js";
import { SkeletonAvatar } from "../src/wind-lab/SkeletonAvatar.js";
import { poseSequence } from "../src/wind-lab/PoseSequences.js";
import { trackingSnapshot } from "../src/wind-lab/TrackingReport.js";
import * as THREE from "../vendor/three/three.module.js";
import { PosePipeline } from "../pose-pipeline.mjs";
const cfg = { ...DEFAULTS, weather: false };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a}/${b}`);
function sequence(kind, c = cfg) {
  const mapper = new CoordinateMapper(),
    e = new WindEngine(c),
    a = new SkeletonAvatar(new THREE.Scene());
  for (let i = 0; i < 90; i++) {
    const t = i / 60,
      data = poseSequence(kind, t),
      sample = mapper.fromPose(data.landmarks, data.worldLandmarks),
      frame = mapper.avatarPose(data.landmarks, data.worldLandmarks);
    e.input(sample, t * 1000);
    a.input(frame, t * 1000);
    e.step(1 / 60);
    a.update(t * 1000, 1 / 60, { ...c, avatar: true }, e);
  }
  return { e, a, mapper };
}
test("TEST A–C neutral/body left-right and depth act globally through the real mapper", () => {
  let { e } = sequence("A");
  assert.ok(Math.hypot(...e.body.value) < 1e-8);
  for (const kind of ["B", "C"]) {
    const result = sequence(kind, { ...cfg, left: false, right: false });
    const { e } = result,
      axis = kind === "B" ? 0 : 2;
    assert.ok(Math.abs(e.body.value[axis]) > 0.1);
    for (let j = 3; j < e.velocities.length; j += 3)
      near(e.velocities[j + axis], e.velocities[axis]);
  }
});
test("TEST D–F local hands and avatar anchors match at all sizes without moving physical centers", () => {
  for (const kind of ["D", "E", "F"]) {
    const { e, a } = sequence(kind, { ...cfg, body: false });
    for (const side of kind === "D"
      ? ["left"]
      : kind === "E"
        ? ["right"]
        : ["left", "right"]) {
      const h = e[side];
      assert.ok(Math.hypot(...h.velocity) > 0.01);
      assert.deepEqual(h.at(-9, -9, -9, e.config), [0, 0, 0]);
      for (const size of [20, 100, 300]) {
        const old = [...h.position];
        a.update(
          1490,
          0.016,
          { ...e.config, avatar: true, avatarSize: size },
          e,
        );
        a.wrist(side).forEach((v, i) => near(v, h.position[i]));
        assert.deepEqual(h.position, old);
      }
    }
  }
});
test("TEST G loss recovery and low confidence stay safe and resume without impulse", () => {
  const m = new CoordinateMapper(),
    e = new WindEngine(cfg);
  let previousSpeed = 0;
  for (let i = 0; i < 240; i++) {
    const d = poseSequence("G", i / 60);
    e.input(m.fromPose(d.landmarks, d.worldLandmarks), (i * 1000) / 60);
    e.step(1 / 60);
    assert.ok(e.velocities.every(Number.isFinite));
    previousSpeed = Math.hypot(...e.left.velocity);
  }
  assert.ok(previousSpeed < 0.01);
  const d = poseSequence("A", 0);
  d.landmarks[15].visibility = 0.1;
  assert.equal(m.fromPose(d.landmarks, d.worldLandmarks).left, null);
  delete d.landmarks[16].presence;
  assert.ok(m.fromPose(d.landmarks, d.worldLandmarks).right);
});
test("body dead zone suppresses both tilt noise and rate; calibration resets delta", () => {
  const b = new BodyWind();
  for (let i = 0; i < 100; i++) {
    b.input([Math.tan(Math.PI / 180) * Math.sin(i), 0, 0], 0.016);
    b.update(0.016, cfg);
  }
  assert.deepEqual(b.value, [0, 0, 0]);
  b.input([0.2, 0, 0.1], 0.016);
  b.update(0.1, cfg);
  assert.ok(b.value[0] > 0);
  assert.equal(b.calibrate(), true);
  b.update(0.1, cfg);
  assert.deepEqual(b.value, [0, 0, 0]);
  assert.equal(b.calibrated, true);
});
test("hand noise threshold, smoothing, jump rejection, acceleration bound and decay", () => {
  const h = new HandWind("left");
  h.input([0, 0, 0], 0, cfg);
  for (let i = 0; i < 50; i++) {
    h.input([0.0001 * Math.sin(i), 0, 0], 0.016, cfg);
    h.update(0.016, cfg);
  }
  assert.ok(Math.hypot(...h.velocity) < 1e-8);
  const before = [...h.position];
  h.input([8, 8, 8], 0.016, cfg);
  assert.deepEqual(h.position, before);
  assert.equal(h.rejected, 1);
  h.input([0.1, 0, 0], 0.016, cfg);
  assert.ok(Math.hypot(...h.target) <= 80 * 0.016 + 1e-5);
  for (let i = 0; i < 200; i++) {
    h.input([0.1, 0, 0], 0.016, cfg);
    h.update(0.016, cfg);
  }
  assert.ok(Math.hypot(...h.velocity) < 0.001);
});
test("tracking CSV captures real positions, angles, velocity, calibration and independent FPS", () => {
  const { e, a } = sequence("F");
  const row = trackingSnapshot(e, { renderFps: 60, poseFps: 15 }, a, "now");
  for (const name of [
    "timestamp",
    "pose_detected",
    "body_tilt_x",
    "body_wind_z",
    "left_hand_x",
    "left_hand_vx",
    "right_hand_vy",
    "weather_wind_z",
    "render_fps",
    "inference_fps",
  ])
    assert.ok(name in row, name);
  assert.equal(row.render_fps, 60);
  assert.equal(row.inference_fps, 15);
  near(row.left_hand_x, e.left.position[0]);
});
test("shared Pose worker accepts delayed results without blocking callers, discards stale results, closes once", async () => {
  let worker,
    closed = 0;
  const p = new PosePipeline({
    workerFactory: () =>
      (worker = {
        postMessage() {},
        terminate() {
          closed++;
        },
      }),
    bitmapFactory: async () => ({ close() {} }),
  });
  worker.onmessage({ data: { type: "ready" } });
  await p.ready;
  const video = {
    readyState: 2,
    currentTime: 1,
    videoWidth: 640,
    videoHeight: 480,
  };
  assert.equal(p.detectForVideo(video, 100).pending, true);
  await Promise.resolve();
  assert.equal(p.busy, true);
  p.reset();
  worker.onmessage({
    data: {
      type: "result",
      generation: 0,
      timestamp: 100,
      result: { landmarks: [[]] },
    },
  });
  assert.equal(p.result.pending, true);
  video.currentTime = 2;
  p.detectForVideo(video, 200);
  await Promise.resolve();
  worker.onmessage({
    data: {
      type: "result",
      generation: 1,
      timestamp: 200,
      result: { landmarks: [], worldLandmarks: [] },
    },
  });
  assert.equal(p.result.timestamp, 200);
  assert.equal(p.detectForVideo(video, 900).pending, true);
  assert.deepEqual(p.detectForVideo(video, 900).landmarks, []);
  p.close();
  p.close();
  assert.equal(closed, 1);
});

test("calibrated opposite extremes keep body wind finite and bounded", () => {
  const b = new BodyWind();
  b.input([1, 0, 1], 0);
  b.calibrate();
  for (let i = 0; i < 3; i++) b.input([-1, 0, -1], 0.016);
  for (let i = 0; i < 50; i++)
    b.update(0.016, { ...cfg, bodyDeadZone: 0, bodySensitivity: 300 });
  assert.ok(b.value[0] < 0);
  assert.ok(b.value.every(Number.isFinite));
  assert.ok(b.value.every((v) => Math.abs(v) <= 34));
});

test("isolated body-axis outlier is rejected; stable new posture reacquires without a rate impulse", () => {
  const b = new BodyWind();
  b.input([0, 0, 0], 0);
  b.input([1, 0, 0], 0.016);
  assert.deepEqual(b.raw, [0, 0, 0]);
  b.input([0, 0, 0], 0.016);
  assert.equal(b.rejected, 1);
  for (let i = 0; i < 3; i++) b.input([1, 0, 0], 0.016);
  assert.deepEqual(b.raw, [1, 0, 0]);
  assert.deepEqual(b.rate, [0, 0, 0]);
});

test("short hand gaps use accepted-sample elapsed time rather than the missing-frame timestamp", () => {
  const h = new HandWind("left");
  h.input([0, 0, 0], 0, cfg);
  h.input(null, 0.05, cfg);
  h.update(0.15, cfg);
  h.input([0.15, 0, 0], 0.05, cfg);
  assert.ok(h.target[0] > 0.5 && h.target[0] < 1.1);
});

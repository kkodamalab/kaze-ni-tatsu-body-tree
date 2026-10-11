import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CoordinateMapper } from "../src/wind-engine/CoordinateMapper.js";
import {
  WindConfig,
  DEFAULTS,
  sanitizeConfig,
} from "../src/wind-engine/WindConfig.js";
import { SkeletonAvatar } from "../src/wind-lab/SkeletonAvatar.js";
import * as THREE from "../vendor/three/three.module.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} vs ${b}`);
const mapper = new CoordinateMapper();
beforeEach(() => mapper.resetAvatar());
function fixture() {
  const p = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.3,
    z: 0,
    visibility: 1,
  }));
  Object.assign(p[23], { x: 0.45, y: 0.6 });
  Object.assign(p[24], { x: 0.55, y: 0.6 });
  Object.assign(p[11], { x: 0.4, y: 0.3, z: -0.1 });
  Object.assign(p[12], { x: 0.6, y: 0.3, z: -0.1 });
  Object.assign(p[15], { x: 0.8, y: 0.2, z: -0.2 });
  Object.assign(p[16], { x: 0.2, y: 0.4, z: 0.1 });
  Object.assign(p[27], { y: 0.95 });
  Object.assign(p[28], { y: 0.95 });
  return p;
}
test("avatar config defaults, validation, persistence and no sensitive storage", () => {
  assert.equal(DEFAULTS.axes, true);
  assert.equal(DEFAULTS.avatar, false);
  assert.equal(DEFAULTS.avatarSize, 100);
  assert.equal(DEFAULTS.avatarStyle, "SKELETON");
  assert.equal(
    sanitizeConfig({ avatarSize: 999, avatarStyle: "HTML" }).avatarSize,
    300,
  );
  assert.equal(
    sanitizeConfig({ avatarSize: -1, avatarStyle: "POINTS" }).avatarSize,
    20,
  );
  assert.equal(sanitizeConfig({ avatarStyle: "HTML" }).avatarStyle, "SKELETON");
  let data;
  const storage = { getItem: () => data, setItem: (_, s) => (data = s) };
  const c = new WindConfig(storage);
  c.replace({
    ...c.values,
    axes: false,
    avatar: true,
    avatarSize: 200,
    avatarStyle: "POINTS",
    location: { latitude: 1 },
    landmarks: fixture(),
  });
  assert.equal(new WindConfig(storage).values.avatarStyle, "POINTS");
  assert.equal(new WindConfig(storage).values.axes, false);
  assert.equal(JSON.parse(data).location, undefined);
  assert.equal(JSON.parse(data).landmarks, undefined);
});
test("world and normalized Pose: 33 points, hip origin, mirror, depth and bounded full body", () => {
  const lm = fixture();
  for (const world of [
    undefined,
    lm.map((p) => ({
      ...p,
      x: (p.x - 0.5) * 2,
      y: (p.y - 0.6) * 2,
      z: p.z * 2,
    })),
  ]) {
    const frame = mapper.avatarPose(lm, world);
    assert.equal(frame.source, world ? "POSE WORLD" : "POSE NORMALIZED");
    assert.equal(frame.points.filter(Boolean).length, 33);
    for (let k = 0; k < 3; k++)
      near((frame.points[23][k] + frame.points[24][k]) / 2, 0);
    assert.ok(frame.points[15][0] < 0);
    assert.ok(frame.points[16][0] > 0);
    assert.ok(frame.points[15][1] > frame.points[16][1]);
    assert.ok(frame.points[15][2] < 0);
    assert.ok(frame.points.flat().every((v) => Math.abs(v) <= 3.00001));
    assert.deepEqual(frame.windHands.left, mapper.fromPose(lm, world).left);
  }
  lm[15].visibility = 0;
  assert.equal(mapper.avatarPose(lm).points[15], null);
  lm[23].visibility = 0;
  assert.equal(mapper.avatarPose(lm), null);
});
test("33-point Pose fixtures preserve left/right tilt, lifted arms, depth and knee bend", () => {
  const lm = fixture(),
    baseline = mapper.avatarPose(lm);
  lm[11].x -= 0.1;
  lm[12].x -= 0.1;
  lm[15].y -= 0.1;
  lm[25].x = 0.7;
  lm[25].z = -0.2;
  const changed = mapper.avatarPose(lm);
  assert.ok(changed.points[11][0] > baseline.points[11][0]);
  assert.ok(changed.points[15][1] > baseline.points[15][1]);
  assert.ok(changed.points[25][0] < 0);
  assert.ok(changed.points[25][2] < 0);
});
test("PC TEST synthetic skeleton uses body tilt and independent common wind wrist coordinates", () => {
  const sample = { body: [0.3, 0, 0.2], left: [-4, 2, -1], right: [4, 1, 1] },
    frame = mapper.syntheticPose(sample);
  assert.equal(frame.source, "PC TEST SYNTHETIC");
  assert.equal(frame.points.length, 33);
  assert.deepEqual(frame.points[15], sample.left);
  assert.deepEqual(frame.points[16], sample.right);
  near(frame.points[11][0], -0.25);
  assert.ok(frame.points[11][2] > 0);
  assert.equal(mapper.syntheticPose({ body: null }), null);
});
test("avatar live size/style/off reuses buffers, smooths, holds/fades/recovers and disposes once", () => {
  const scene = new THREE.Scene(),
    a = new SkeletonAvatar(scene),
    frame = mapper.avatarPose(fixture()),
    cfg = { ...DEFAULTS, avatar: true };
  a.input(frame, 0);
  const geometry = a.jointGeometry,
    buffer = a.jointBuffer,
    material = a.lineMaterial;
  for (const size of [20, 100, 300]) {
    a.update(0, 1 / 60, { ...cfg, avatarSize: size });
    near(a.wrist("left")[0], (frame.points[15][0] * size) / 100);
    assert.equal(a.validCount, 33);
    assert.ok(a.rendered.every((v) => Math.abs(v) < 10));
  }
  a.update(0, 1 / 60, { ...cfg, avatarStyle: "POINTS" });
  assert.equal(a.lines.visible, false);
  assert.equal(a.joints.visible, true);
  a.update(0, 1 / 60, { ...cfg, avatar: false });
  assert.equal(a.group.visible, false);
  a.update(200, 1 / 60, cfg);
  near(a.opacity, 1);
  a.update(500, 1 / 60, cfg);
  near(a.opacity, 0.5);
  a.update(800, 1 / 60, cfg);
  assert.equal(a.group.visible, false);
  assert.equal(a.validCount, 0);
  a.input(frame, 900);
  a.update(900, 1 / 60, cfg);
  assert.equal(a.group.visible, true);
  const moved = {
    ...frame,
    points: frame.points.map(
      (p) => p && p.map((v, i) => v + (i === 0 ? 0.3 : 0)),
    ),
  };
  a.input(moved, 920);
  const before = a.wrist("left")[0];
  a.update(920, 0.01, cfg);
  assert.ok(a.wrist("left")[0] > before);
  assert.ok(a.wrist("left")[0] < moved.points[15][0]);
  assert.equal(a.jointGeometry, geometry);
  assert.equal(a.jointBuffer, buffer);
  assert.equal(a.lineMaterial, material);
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  a.dispose();
  a.dispose();
  assert.equal(disposals, 1);
  assert.equal(scene.children.length, 0);
});
test("invalid landmarks omit joints and connecting bones; large PC poses stay inside cube", () => {
  const a = new SkeletonAvatar(new THREE.Scene()),
    frame = mapper.syntheticPose({
      body: [1, 1, 1],
      left: [-10, 10, -10],
      right: null,
    });
  a.input(frame, 0);
  a.update(0, 0.02, { ...DEFAULTS, avatar: true, avatarSize: 300 });
  assert.equal(a.validCount, 28);
  assert.equal(a.wrist("right"), null);
  assert.ok(a.rendered.every((v) => Math.abs(v) <= 9.80001));
  assert.ok(a.lineGeometry.drawRange.count < 70);
  a.dispose();
});

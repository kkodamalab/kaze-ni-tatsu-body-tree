import test from "node:test";
import assert from "node:assert/strict";
import { WindEngine } from "../src/wind-engine/WindEngine.js";
import {
  WeatherWind,
  WEATHER_INTERVAL,
} from "../src/wind-engine/WeatherWind.js";
import {
  CoordinateMapper,
  windFromBearing,
} from "../src/wind-engine/CoordinateMapper.js";
import {
  WindConfig,
  DEFAULTS,
  STORAGE_KEY,
} from "../src/wind-engine/WindConfig.js";
import { HandWind } from "../src/wind-engine/HandWind.js";
const off = { weather: false, body: false, left: false, right: false };
const near = (a, b, epsilon = 1e-5) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const tick = (e, seconds = 1, sample) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (sample) e.input(sample, t * 1000 + 1);
    e.step(1 / 60);
  }
};
test("grid count, spacing, configuration limits and reset", () => {
  for (const n of [3, 10, 20]) {
    const e = new WindEngine({ ...off, gridX: n, gridY: n, gridZ: n });
    assert.equal(e.count, n ** 3);
    assert.equal(e.positions.length, n ** 3 * 3);
    near(e.positions[2], -9);
    near(e.positions[5] - e.positions[2], 18 / (n - 1));
    const initial = e.positions.slice();
    e.positions[0] = 0;
    e.reset();
    assert.deepEqual(e.positions, initial);
    e.dispose();
  }
  const e = new WindEngine({ gridX: 500, gridY: -1, gridZ: 5 });
  assert.equal(e.count, 20 * 3 * 5);
  e.configure({ ...e.config, gridZ: 7 });
  assert.equal(e.count, 420);
});
test("meteorological cardinal bearings: north -> south, east -> west", () => {
  [
    [0, [0, 0, 2]],
    [90, [-2, 0, 0]],
    [180, [0, 0, -2]],
    [270, [2, 0, 0]],
  ].forEach(([d, expected]) =>
    windFromBearing(d, 2).forEach((v, i) => near(v, expected[i])),
  );
  assert.deepEqual(
    windFromBearing(20, 0).map((v) => v || 0),
    [0, 0, 0],
  );
});
test("WEATHER ONLY: all particles translate equally, zero wind settles, interpolation is smooth", () => {
  const e = new WindEngine({ ...off, weather: true });
  e.weather.simulated(90, 4);
  e.step(0.016);
  assert.ok(e.weather.value[0] < 0 && e.weather.value[0] > -1);
  const start = e.positions.slice();
  tick(e, 2);
  const dx = e.positions[1500] - start[1500];
  assert.ok(dx < -0.5);
  for (let i = 3; i < e.positions.length; i += 3)
    near(e.velocities[i], e.velocities[0]);
  near(e.velocities[1], 0);
  e.weather.simulated(0, 0);
  tick(e, 20);
  assert.ok(Math.abs(e.velocities[0]) < 0.002);
  e.dispose();
});
test("BODY ONLY: absolute tilt + rate acts globally, calibration and lost tracking decay", () => {
  const e = new WindEngine({ ...off, body: true });
  tick(e, 1, { body: [0.3, 0, 0.2] });
  assert.ok(e.velocities[0] > 0.5);
  assert.ok(e.velocities[2] > 0.1);
  for (let i = 3; i < e.velocities.length; i += 3)
    near(e.velocities[i], e.velocities[0]);
  assert.ok(e.body.calibrate());
  e.input({ body: [0.3, 0, 0.2] }, 1100);
  tick(e, 2);
  assert.ok(Math.hypot(...e.body.value) < 0.01);
  e.input({ body: [-0.5, 0, 0] }, 4000);
  e.step(0.05);
  assert.ok(e.body.value[0] < 0);
  tick(e, 4);
  assert.ok(Math.hypot(...e.body.value) < 0.001);
  e.dispose();
});
for (const side of ["left", "right"])
  test(`${side.toUpperCase()} HAND ONLY: velocity, spherical Gaussian locality, radius and stop decay`, () => {
    const e = new WindEngine({ ...off, [side]: true, handRadius: 20 });
    e.input({ [side]: [0, 0, 0] }, 1);
    e.input({ [side]: [0.5, 0.5, 0] }, 101);
    e.step(0.1);
    const h = e[side];
    assert.ok(h.velocity[0] > 0 && h.velocity[1] > 0);
    const center = h.at(0.5, 0.5, 0, e.config);
    assert.ok(center[0] > 0);
    assert.deepEqual(h.at(9, 9, 9, e.config), [0, 0, 0]);
    const narrow = h.at(5, 0.5, 0, e.config);
    assert.equal(narrow[0], 0);
    e.configure({ ...e.config, handRadius: 50 });
    assert.ok(h.at(5, 0.5, 0, e.config)[0] > 0);
    for (let i = 0; i < 30; i++) {
      e.input({ [side]: [0.5, 0.5, 0] }, 201 + i * 100);
      e.step(0.1);
    }
    assert.ok(Math.hypot(...h.velocity) < 0.001);
    assert.equal(Math.hypot(...e.velocities.slice(-3)), 0);
    e.dispose();
  });
test("component switches and zero sensitivities are independent; ALL ON sums weather + body + hands", () => {
  const e = new WindEngine();
  e.weather.value = [1, 0, 0];
  e.weather.target = [1, 0, 0];
  e.body.value = [2, 0, 0];
  e.body.raw = [0.4, 0, 0];
  e.body.age = 0;
  e.left.position = e.right.position = [0, 0, 0];
  e.left.velocity = e.left.target = [3, 0, 0];
  e.right.velocity = e.right.target = [4, 0, 0];
  e.left.age = e.right.age = 0;
  e.positions.fill(0);
  e.step(1 / 60);
  near(e.velocities[0], 10 * (1 - Math.exp(-6 / 60)));
  e.configure({
    ...e.config,
    bodySensitivity: 0,
    leftSensitivity: 0,
    rightSensitivity: 0,
  });
  e.step(0.1);
  assert.deepEqual(e.body.value, [0, 0, 0]);
  assert.deepEqual(e.left.at(0, 0, 0, e.config), [0, 0, 0]);
  assert.deepEqual(e.right.at(0, 0, 0, e.config), [0, 0, 0]);
  e.configure({ ...e.config, ...off });
  tick(e, 3);
  assert.ok(Math.abs(e.velocities[0]) < 1e-6);
  e.dispose();
});
test("dt independence, invalid/hidden dt, speed bound, damping and WRAP", () => {
  const run = (hz) => {
    const e = new WindEngine({ ...off, weather: true });
    e.weather.value = e.weather.target = [3, 0, 0];
    for (let i = 0; i < hz; i++) e.step(1 / hz);
    return e;
  };
  const a = run(30),
    b = run(60),
    c = run(120);
  near(a.positions[0], b.positions[0]);
  near(b.positions[0], c.positions[0], 0.03);
  const before = a.time;
  a.step(2000);
  near(a.time - before, 0.1);
  a.step(NaN);
  assert.ok(a.positions.every(Number.isFinite));
  a.weather.value = a.weather.target = [1e5, 1e5, 1e5];
  tick(a, 3);
  for (let i = 0; i < a.velocities.length; i += 3)
    assert.ok(Math.hypot(...a.velocities.slice(i, i + 3)) <= 25.00001);
  assert.ok(a.positions.every((v) => v >= -10 && v < 10));
  a.configure({ ...a.config, speed: 0 });
  tick(a, 3);
  assert.ok(Math.abs(a.velocities[0]) < 0.00001);
  [a, b, c].forEach((e) => e.dispose());
});
test("mirrored MediaPipe and independent detection loss; no first-frame/reacquisition impulse", () => {
  const mapper = new CoordinateMapper();
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  lm[11] = { x: 0.25, y: 0.2, z: 0 };
  lm[12] = { x: 0.45, y: 0.2, z: 0 };
  lm[23] = { x: 0.4, y: 0.6, z: 0 };
  lm[24] = { x: 0.6, y: 0.6, z: 0 };
  lm[15] = { x: 0.3, y: 0.2, z: 0.1 };
  lm[16] = { x: 0.7, y: 0.8, z: -0.1, visibility: 0 };
  const input = mapper.fromPose(lm);
  assert.ok(input.body[0] > 0);
  assert.deepEqual(input.left, [4, 6, 2]);
  assert.equal(input.right, null);
  assert.equal(mapper.fromPose(null).body, null);
  const h = new HandWind("left");
  h.input([0, 0, 0], 0);
  assert.deepEqual(h.target, [0, 0, 0]);
  h.input([1, 0, 0], 0.1);
  assert.ok(h.target[0] > 0);
  h.input(null, 0.1);
  h.input([9, 0, 0], 0.1);
  assert.deepEqual(h.target, [0, 0, 0]);
});
test("settings clamp corruption, keep only permitted fields, never persist location or camera", () => {
  let saved;
  const storage = {
    getItem: () => '{"gridX":100,"speed":-10,"latitude":35,"camera":"image"}',
    setItem: (k, v) => {
      assert.equal(k, STORAGE_KEY);
      saved = v;
    },
  };
  const config = new WindConfig(storage);
  assert.equal(config.values.gridX, 20);
  assert.equal(config.values.speed, 0);
  config.save();
  assert.equal(JSON.parse(saved).latitude, undefined);
  assert.equal(JSON.parse(saved).camera, undefined);
  assert.deepEqual(config.reset(), DEFAULTS);
  assert.doesNotThrow(() =>
    new WindConfig({
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    }).reset(),
  );
});
test("Open-Meteo contract: request units, response metadata, refresh interval and cancel stale results", async () => {
  let url, resolve;
  const w = new WeatherWind({
    fetcher: async (u) => {
      url = new URL(u);
      return {
        ok: true,
        json: async () => ({
          current: {
            wind_speed_10m: 2,
            wind_direction_10m: 90,
            time: "2026-10-11T10:15",
          },
          current_units: { wind_speed_10m: "m/s" },
          timezone: "Asia/Tokyo",
        }),
      };
    },
  });
  await w.manual(35.61, 139.38);
  assert.equal(
    url.searchParams.get("current"),
    "wind_speed_10m,wind_direction_10m",
  );
  assert.equal(url.searchParams.get("wind_speed_unit"), "ms");
  assert.equal(url.searchParams.get("timezone"), "auto");
  assert.equal(w.data.speed, 2);
  assert.equal(w.data.time, "2026-10-11T10:15");
  assert.equal(WEATHER_INTERVAL, 600000);
  near(w.target[0], -2);
  w.fetcher = () => new Promise((r) => (resolve = r));
  const pending = w.refresh();
  w.simulated(0, 3);
  resolve({
    ok: true,
    json: async () => ({
      current: { wind_speed_10m: 2, wind_direction_10m: 90, time: "old" },
      current_units: { wind_speed_10m: "m/s" },
    }),
  });
  await pending;
  assert.equal(w.mode, "SIMULATED WIND");
  assert.equal(w.data.speed, 3);
  w.dispose();
});
test("GPS only on explicit request; permission denial, HTTP, malformed and network failures keep engine usable", async () => {
  let calls = 0;
  const w = new WeatherWind({
    geolocation: {
      getCurrentPosition: (_, reject) => {
        calls++;
        reject(Error("denied"));
      },
    },
  });
  assert.equal(calls, 0);
  await w.gps();
  assert.equal(calls, 1);
  assert.equal(w.location, null);
  assert.match(w.status, /取得できません/);
  for (const fetcher of [
    async () => ({ ok: false, status: 500 }),
    async () => {
      throw Error("offline");
    },
    async () => ({
      ok: true,
      json: async () => ({ current: { wind_speed_10m: NaN } }),
    }),
  ]) {
    w.fetcher = fetcher;
    await w.manual(35, 139);
    assert.equal(w.data, null);
    assert.deepEqual(w.target, [0, 0, 0]);
  }
  const e = new WindEngine({}, w);
  w.simulated(270, 3);
  tick(e, 1);
  assert.ok(e.positions.every(Number.isFinite));
  assert.ok(e.velocities[0] > 0);
  e.dispose();
});

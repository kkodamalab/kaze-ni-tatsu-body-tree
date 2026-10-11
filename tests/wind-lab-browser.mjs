import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (route) =>
  route.fulfill({
    contentType: "application/javascript",
    body:
      source +
      `\nwindow.labTest={get lab(){return labInstance},get game(){return {running,labActive,gameFrame,stream,pose}},inits:0,closes:0,detects:0,landmarks:null,poseDelay:0};initPose=async()=>{if(pose)return;window.labTest.inits++;if(window.labTest.poseDelay)await new Promise(r=>setTimeout(r,window.labTest.poseDelay));pose={detectForVideo:()=>{window.labTest.detects++;return {landmarks:window.labTest.landmarks?[window.labTest.landmarks]:[]}},close:()=>{window.labTest.closes++;}};};`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const lab = (fn) => page.evaluate(fn);
const preset = (label) =>
  page.getByRole("button", { name: label, exact: true }).click();
async function range(key, value) {
  await page.locator("#lab-" + key).fill(String(value));
}
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => window.labTest?.lab?.renderer);
  assert.equal(await lab(() => labTest.lab.engine.count), 1000);
  assert.equal(
    await page.locator("#labPc").getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    await page.locator("#labWeatherStatus").textContent(),
    /SIMULATED WIND/,
  );
  assert.equal(await lab(() => labTest.inits), 0);
  await page.clock.install();
  await preset("ALL OFF");
  const initialView = await lab(() => labTest.lab.view.position.toArray());
  const stage = await page.locator(".lab-stage").boundingBox();
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    stage.x + stage.width / 2 + 100,
    stage.y + stage.height / 2 + 30,
    { steps: 6 },
  );
  await page.mouse.up();
  await page.clock.runFor(100);
  assert.notDeepEqual(
    await lab(() => labTest.lab.view.position.toArray()),
    initialView,
  );
  const distance = await lab(() => labTest.lab.view.position.length());
  await page.mouse.wheel(0, 200);
  await page.clock.runFor(100);
  assert.notEqual(
    await lab(() => labTest.lab.view.position.length()),
    distance,
  );
  await page.locator("#labResetView").click();
  const resetView = await lab(() => labTest.lab.view.position.toArray());
  resetView.forEach((v, i) => assert.ok(Math.abs(v - initialView[i]) < 1e-6));

  await range("gridX", 3);
  await range("gridY", 4);
  await range("gridZ", 5);
  assert.equal(await lab(() => labTest.lab.engine.count), 60);
  await range("dotSize", 8);
  await page.clock.runFor(100);
  assert.equal(await lab(() => labTest.lab.field.material.size), 8);
  await preset("WEATHER ONLY");
  await range("direction", 270);
  await range("windSpeed", 3);
  await page.clock.runFor(1500);
  assert.ok(await lab(() => labTest.lab.engine.velocities[0] > 0));
  assert.deepEqual(
    await lab(() => {
      const c = labTest.lab.engine.components;
      return [c.body, ...["left", "right"].map((k) => c[k])].flat();
    }),
    Array(9).fill(0),
  );
  await preset("BODY ONLY");
  await range("test-bodyX", 0.4);
  await page.clock.runFor(800);
  assert.ok(await lab(() => labTest.lab.engine.velocities[0] > 0.5));
  await page.locator("#labCalibrate").click();
  await page.clock.runFor(1500);
  assert.ok(await lab(() => Math.abs(labTest.lab.engine.body.value[0]) < 0.01));
  await range("test-bodyX", -0.4);
  await page.clock.runFor(700);
  assert.ok(await lab(() => labTest.lab.engine.velocities[0] < 0));
  for (const [side, label] of [
    ["left", "LEFT HAND ONLY"],
    ["right", "RIGHT HAND ONLY"],
  ]) {
    await preset(label);
    await range("test-" + side + "X", 0);
    await page.clock.runFor(100);
    await range("test-" + side + "X", 1);
    await page.clock.runFor(100);
    const local = await page.evaluate((side) => {
      const e = labTest.lab.engine,
        h = e[side];
      return {
        near: h.at(...h.position, e.config)[0],
        far: h.at(-9, -9, -9, e.config)[0],
        other: e[side === "left" ? "right" : "left"].velocity,
      };
    }, side);
    assert.ok(local.near > 0);
    assert.equal(local.far, 0);
    assert.deepEqual(local.other, [0, 0, 0]);
  }
  await preset("ALL ON");
  await page.locator("#labAuto").click();
  await page.clock.runFor(1000);
  assert.ok(
    await lab(
      () =>
        Math.hypot(...labTest.lab.engine.left.velocity) > 0 &&
        Math.hypot(...labTest.lab.engine.right.velocity) > 0,
    ),
  );
  await range("trailDuration", 5);
  await range("trailOpacity", 80);
  await range("gridX", 20);
  await range("gridY", 20);
  await range("gridZ", 20);
  await page.clock.runFor(800);
  assert.equal(await lab(() => labTest.lab.engine.count), 8000);
  assert.ok(await lab(() => labTest.lab.field.trailArray.length <= 600000));
  assert.equal(await lab(() => labTest.lab.field.trailMaterial.opacity), 0.8);
  assert.ok(
    await lab(() => labTest.lab.field.trailGeometry.drawRange.count > 0),
  );
  await page.locator("#lab-particles").uncheck();
  await page.clock.runFor(50);
  assert.equal(await lab(() => labTest.lab.field.points.visible), false);
  await page.locator("#lab-trail").uncheck();
  await page.clock.runFor(50);
  assert.equal(await lab(() => labTest.lab.field.trails.visible), false);
  await page.locator("#labResetSettings").click();
  assert.equal(await lab(() => labTest.lab.engine.count), 1000);
  await page.locator("#labResetParticles").click();
  assert.equal(await lab(() => labTest.lab.engine.time), 0);
  await page.locator("#labResetView").click();
  assert.deepEqual(
    await lab(() => labTest.lab.controls.target.toArray()),
    [0, 0, 0],
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_, reject) => reject({ code: 1 }) },
    });
    labTest.lab.weather.geolocation = navigator.geolocation;
  });
  await page.locator("#labGps").click();
  assert.match(
    await page.locator("#labWeatherStatus").textContent(),
    /位置情報を取得できません/,
  );
  await page.clock.resume();
  await page.locator("#labManual").click();
  await page.waitForFunction(() =>
    labTest.lab.weather.status.includes("気象データを取得できません"),
  );
  assert.match(
    await page.locator("#labWeatherStatus").textContent(),
    /気象データを取得できません/,
  );
  await page.locator("#labSimulated").click();
  assert.ok(await lab(() => labTest.lab.engine.time > 0));
  await page.clock.resume();
  await page.route("https://api.open-meteo.com/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        current: {
          wind_speed_10m: 4,
          wind_direction_10m: 90,
          time: "2026-10-11T10:15",
        },
        current_units: { wind_speed_10m: "m/s" },
        timezone: "Asia/Tokyo",
      }),
    }),
  );
  await page.locator("#labManual").click();
  await page.waitForFunction(
    () => window.labTest.lab.weather.data?.speed === 4,
  );
  assert.match(
    await page.locator("#labWeatherDetails").textContent(),
    /2026-10-11T10:15/,
  );
  await page.evaluate(() => {
    labTest.lab.weather.geolocation = {
      getCurrentPosition: (resolve) =>
        resolve({
          coords: { latitude: 35.61, longitude: 139.38 },
          timestamp: 1760000000000,
        }),
    };
  });
  await page.locator("#labGps").click();
  await page.waitForFunction(
    () =>
      labTest.lab.weather.mode === "GPS WEATHER" &&
      labTest.lab.weather.data?.speed === 4,
  );
  assert.equal(await lab(() => labTest.lab.weather.location.latitude), 35.61);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.hiddenTime = labTest.lab.engine.time;
  });
  assert.equal(await lab(() => labTest.lab.raf), null);
  await page.waitForTimeout(100);
  assert.equal(
    await lab(() => labTest.lab.engine.time),
    await lab(() => hiddenTime),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => labTest.lab.engine.time > hiddenTime);
  const persisted = await lab(() => localStorage.getItem("wind-tree-lab-v1"));
  assert.ok(!persisted.includes("latitude"));
  assert.ok(!persisted.includes("longitude"));
  // Real Chromium camera stream with a synthetic Pose adapter; no external models.
  await page.clock.resume();
  await page.locator("#labCamera").click();
  await page.waitForFunction(() => window.labTest.lab.cameraOn);
  assert.equal(await lab(() => labTest.inits), 1);
  await page.locator("#labSkeleton").click();
  await page.waitForFunction(() => labTest.detects > 0);
  const streamCount = await lab(
    () =>
      labTest.game.stream
        .getVideoTracks()
        .filter((t) => t.readyState === "live").length,
  );
  assert.equal(streamCount, 1);
  const synthetic = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  synthetic[11] = { x: 0.2, y: 0.2, z: 0 };
  synthetic[12] = { x: 0.4, y: 0.2, z: 0 };
  synthetic[23] = { x: 0.4, y: 0.6, z: 0 };
  synthetic[24] = { x: 0.6, y: 0.6, z: 0 };
  synthetic[15] = { x: 0.3, y: 0.4, z: 0 };
  synthetic[16] = { x: 0.7, y: 0.4, z: 0 };
  await page.evaluate((lm) => (labTest.landmarks = lm), synthetic);
  await page.waitForFunction(() => labTest.lab.engine.body.raw?.[0] > 0);
  await page.evaluate(() => {
    window.oldLab = labTest.lab;
    window.oldTrack = labTest.game.stream.getVideoTracks()[0];
  });
  await page.locator("#labExit").click();
  assert.equal(await lab(() => oldTrack.readyState), "ended");
  assert.equal(await lab(() => oldLab.disposed), true);
  assert.equal(await lab(() => oldLab.raf), null);
  assert.equal(await lab(() => oldLab.engine.positions.length), 0);
  assert.equal(await lab(() => labTest.closes), 1);
  assert.equal(await lab(() => labTest.game.labActive), false);
  // Return to the game: a camera run reinitializes once, then Lab reuses that model.
  await page.locator("#durationNumber").fill("1");
  await page.locator("#startBtn").click();
  await page.waitForFunction(() => labTest.game.running);
  await page.waitForSelector("#finish:not(.hidden)");
  assert.equal(await lab(() => labTest.inits), 2);
  await page.locator("#againBtn").click();
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => labTest.lab?.renderer);
  await page.locator("#labCamera").click();
  await page.waitForFunction(() => labTest.lab.cameraOn);
  assert.equal(await lab(() => labTest.inits), 2);
  await page.locator("#labExit").click();
  assert.equal(await lab(() => labTest.closes), 2);
  // Exit while permission/model startup is pending must end tracks and release Pose.
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => labTest.lab?.renderer);
  await page.evaluate(() => (labTest.poseDelay = 500));
  await page.locator("#labCamera").click();
  await page.waitForFunction(
    () => labTest.inits === 3 && labTest.lab.cameraPending,
  );
  await page.locator("#labExit").click();
  await page.waitForFunction(
    () => labTest.game.pose === null && labTest.closes === 3,
  );
  assert.equal(await lab(() => labTest.game.stream), null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => labTest.lab?.renderer);
  assert.ok(
    await lab(() => document.querySelector("#windLab").scrollWidth <= 390),
  );
  await page.locator("#labAuto").scrollIntoViewIfNeeded();
  await page.locator("#labAuto").click();
  assert.equal(
    await page.locator("#labAuto").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#labResetParticles").scrollIntoViewIfNeeded();
  await page.locator("#labResetParticles").click();
  await page.evaluate(() => (document.querySelector("#windLab").scrollTop = 0));
  if (process.env.LAB_SCREENSHOT)
    await page.screenshot({ path: process.env.LAB_SCREENSHOT });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Wind Lab lattice/size/8000-particle bounded trails, all four isolated wind modes, calibration/auto motion, GPS denial/API error and success, privacy, shared Pose/camera, pending-start cancellation, disposal/game replay, mobile controls",
  );
} catch (error) {
  console.error(
    await page.evaluate(() => ({
      inits: window.labTest?.inits,
      closes: window.labTest?.closes,
      cameraPending: window.labTest?.lab?.cameraPending,
      message: document.querySelector("#labMessage")?.textContent,
      status: document.querySelector("#labWeatherStatus")?.textContent,
    })),
  );
  throw error;
} finally {
  await browser.close();
}

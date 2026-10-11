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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      source +
      `\nwindow.poseAudit={get lab(){return labInstance},inits:0,landmarks:null};initPose=async()=>{if(pose)return;poseAudit.inits++;pose={detectForVideo:()=>({landmarks:poseAudit.landmarks?[poseAudit.landmarks]:[]}),close(){}};};`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const preset = (name) =>
  page.getByRole("button", { name, exact: true }).click();
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => window.poseAudit.lab?.renderer);
  await page.locator("#labCamera").click();
  await page.waitForFunction(() => poseAudit.lab.cameraOn);
  assert.equal(await page.evaluate(() => poseAudit.inits), 1);
  await page.locator("#labSkeleton").click();
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
  lm[15] = { x: 0.7, y: 0.5, z: 0 };
  lm[16] = { x: 0.3, y: 0.5, z: 0 };
  await page.evaluate((lm) => (poseAudit.landmarks = lm), lm);
  await page.waitForFunction(() => poseAudit.lab.skeletonPoints === 33);
  await preset("BODY ONLY");
  await page.waitForFunction(() => poseAudit.lab.engine.velocities[1500] > 0.5);
  const global = await page.evaluate(() => {
    const v = poseAudit.lab.engine.velocities;
    return Array.from({ length: v.length / 3 }, (_, i) => v[i * 3]);
  });
  assert.ok(global.every((v) => Math.abs(v - global[0]) < 1e-5));
  for (const [side, index, label] of [
    ["left", 15, "LEFT HAND ONLY"],
    ["right", 16, "RIGHT HAND ONLY"],
  ]) {
    await preset(label);
    await page.evaluate(() => {
      poseAudit.lab.engine.velocities.fill(0);
    });
    let near = 0;
    for (let j = 0; j < 8; j++) {
      await page.evaluate(
        ({ index, j }) => {
          poseAudit.landmarks[index].x = 0.5 - j * 0.02;
        },
        { index, j },
      );
      await page.waitForTimeout(70);
      near = Math.max(
        near,
        await page.evaluate((side) => {
          const e = poseAudit.lab.engine,
            h = e[side];
          return Math.hypot(...h.at(...h.position, e.config));
        }, side),
      );
    }
    assert.ok(near > 0.1);
    const result = await page.evaluate((side) => {
      const e = poseAudit.lab.engine,
        h = e[side];
      return {
        far: h.at(-9, -9, -9, e.config),
        other: e[side === "left" ? "right" : "left"].velocity,
        nearParticleSpeed: Math.max(...e.velocities.map(Math.abs)),
      };
    }, side);
    assert.deepEqual(result.far, [0, 0, 0]);
    assert.deepEqual(result.other, [0, 0, 0]);
    assert.ok(result.nearParticleSpeed > 0);
  }
  await preset("ALL ON");
  await page.evaluate(() => {
    const w = poseAudit.lab.weather;
    w.value = w.target = [1, 0, 1];
  });
  for (let j = 0; j < 5; j++) {
    await page.evaluate((j) => {
      poseAudit.landmarks[15].x = 0.35 + j * 0.02;
      poseAudit.landmarks[16].y = 0.5 - j * 0.02;
    }, j);
    await page.waitForTimeout(70);
  }
  const components = await page.evaluate(() => poseAudit.lab.engine.components);
  for (const name of ["weather", "body", "left", "right"])
    assert.ok(Math.hypot(...components[name]) > 0.01, name);
  await page.waitForFunction(
    () =>
      poseAudit.lab.diagnostics.poseFps > 0 &&
      poseAudit.lab.diagnostics.renderFps > 0,
  );
  const debug = await page.locator("#labDebug").textContent();
  for (const text of [
    "POSE DETECTED",
    "LANDMARKS 33/33",
    "BODY AXIS XYZ",
    "LEFT position",
    "RIGHT position",
    "INFERENCE FPS",
    "RENDER FPS",
  ])
    assert.ok(debug.includes(text), text);
  assert.equal(await page.evaluate(() => poseAudit.inits), 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: synthetic 33-point MediaPipe -> mapper -> single WindEngine integration; BODY global / LEFT and RIGHT local / ALL composition; skeleton and diagnostic XYZ/velocity/wind/FPS; one Pose instance (no real participant tested)",
  );
} finally {
  await browser.close();
}

// npm install --prefix /workspace/.onboarding/wind-tree --cache /workspace/.onboarding/npm-cache playwright@1.58.2
// PLAYWRIGHT_MODULE=/workspace/.onboarding/wind-tree/node_modules/playwright/index.mjs node tests/browser.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1000, height: 800 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (route) =>
  route.fulfill({
    contentType: "application/javascript",
    body:
      source +
      `\nwindow.checkGame={get state(){return {running,test,growth,axis,bodyWind:autumn.bodyWind,leaves:autumn.leaves.map(p=>({...p})),hands:hands.map(h=>({...h})),rows:rows.length}},features(lm,dt){return feat(lm,dt)},lost(){test=false;pose=null;lastPoseT=0;lastInputT=0},reset(){autumn.reset()}};`,
  }),
);
await page.route("https://**/*", (route) => route.abort()); // Demo must function with external assets unavailable.
try {
  await page.clock.install();
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  // Exercise the production feature extractor with one missing wrist.
  const extracted = await page.evaluate(() => {
    const lm = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 1,
    }));
    lm[11] = { x: 0.3, y: 0.3, visibility: 1 };
    lm[12] = { x: 0.5, y: 0.3, visibility: 1 };
    lm[23] = { x: 0.4, y: 0.7, visibility: 1 };
    lm[24] = { x: 0.6, y: 0.7, visibility: 1 };
    lm[15] = { x: 0.3, y: 0.5, visibility: 1 };
    lm[16].visibility = 0;
    checkGame.features(lm, 16);
    lm[15].x = 0.26;
    const f = checkGame.features(lm, 32);
    return { f, hands: checkGame.state.hands };
  });
  assert.ok(extracted.f.axis > 0);
  assert.ok(extracted.hands[0].vx > 0);
  assert.equal(extracted.hands[1].active, false);
  await page.click("#testBtn");
  await page.clock.runFor(2300);
  assert.equal(await page.evaluate(() => checkGame.state.running), true);
  await page.locator("#axisSlider").fill("15");
  await page.clock.runFor(1000);
  assert.ok((await page.evaluate(() => checkGame.state.bodyWind)) > 100);
  await page.locator("#axisSlider").fill("-15");
  await page.clock.runFor(1500);
  assert.ok((await page.evaluate(() => checkGame.state.bodyWind)) < -100);
  await page.locator("#axisSlider").fill("0");
  await page.click("#skeletonToggle");
  assert.equal(
    await page.locator("#skeletonToggle").getAttribute("aria-pressed"),
    "true",
  );
  for (const side of ["left", "right"])
    await page.locator(`#${side}Slider`).fill("1");
  for (let i = 0; i < 6; i++) {
    await page.locator("#leftX").fill(String(30 + i * 3));
    await page.locator("#rightY").fill(String(50 - i * 3));
    await page.clock.runFor(32);
  }
  const hands = await page.evaluate(() => checkGame.state.hands);
  assert.ok(hands[0].vx > 0);
  assert.ok(hands[1].vy < 0);
  await page.click("#skeletonToggle");
  assert.equal(await page.locator("#skeletonHud").isVisible(), false);
  assert.ok(
    await page.evaluate(() => checkGame.state.hands.every((h) => h.active)),
  );
  await page.setViewportSize({ width: 400, height: 900 });
  await page.clock.runFor(1000);
  assert.ok(
    await page.evaluate(() =>
      checkGame.state.leaves.every(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
    ),
  );
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.clock.runFor(5000);
  assert.ok((await page.evaluate(() => checkGame.state.growth)) > 0.1);
  await page.evaluate(() => checkGame.lost());
  await page.clock.runFor(800);
  assert.ok(Math.abs(await page.evaluate(() => checkGame.state.axis)) < 1);
  assert.ok(
    await page.evaluate(() => checkGame.state.hands.every((h) => !h.active)),
  );
  const before = await page.evaluate(() => checkGame.state.leaves[0].y);
  await page.clock.runFor(200);
  assert.notEqual(
    await page.evaluate(() => checkGame.state.leaves[0].y),
    before,
  );
  await page.clock.runFor(30000);
  assert.equal(await page.locator("#finish").isVisible(), true);
  assert.equal(await page.locator("#timer").textContent(), "0");
  const stopped = await page.evaluate(() => checkGame.state.leaves);
  await page.clock.runFor(500);
  assert.deepEqual(await page.evaluate(() => checkGame.state.leaves), stopped);
  await page.click("#researchToggle");
  const downloadEvent = page.waitForEvent("download");
  await page.click("#csvBtn");
  const download = await downloadEvent;
  const csv = await readFile(await download.path(), "utf8");
  const cols = csv.split("\n")[0].split(",");
  for (const col of [
    "time_ms",
    "bodyAxisAngle",
    "bodyStability",
    "leftHandMotion",
    "rightHandMotion",
    "handMotion",
    "windStrength",
    "treeGrowth",
    "bodyAxisWind",
    "leftHandWind",
    "rightHandWind",
    "leafCount",
  ])
    assert.ok(cols.includes(col));
  assert.ok(csv.split("\n").length > 100);
  await page.click("#againBtn");
  await page.click("#testBtn");
  await page.clock.runFor(2300);
  assert.equal(await page.evaluate(() => checkGame.state.running), true);
  assert.ok((await page.evaluate(() => checkGame.state.growth)) < 0.05);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: offline demo, tilt, both hands, skeleton toggle, resize, growth, tracking loss, 30-second finish, stopped leaves, CSV and replay",
  );
} finally {
  await browser.close();
}

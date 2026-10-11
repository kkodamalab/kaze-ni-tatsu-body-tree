// Optional online smoke: real weather and the existing real Pose instance.
// curl uses the OS trust store for the cloud proxy; TLS verification stays enabled.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_URL || "http://127.0.0.1:8000/";
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      source +
      "\nwindow.liveLab={get lab(){return labInstance},get pose(){return pose},get stream(){return stream}};",
  }),
);
await page.route("https://**/*", async (route) => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  if (
    ![
      "cdn.jsdelivr.net",
      "storage.googleapis.com",
      "api.open-meteo.com",
    ].includes(new URL(url).hostname)
  )
    return route.abort();
  try {
    const { stdout } = await run(
      "curl",
      ["--fail", "--silent", "--show-error", "--location", url],
      { encoding: "buffer", maxBuffer: 40 * 1024 * 1024 },
    );
    await route.fulfill({
      body: stdout,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": url.endsWith(".wasm")
          ? "application/wasm"
          : url.endsWith(".task")
            ? "application/octet-stream"
            : url.includes("/forecast?")
              ? "application/json"
              : "application/javascript",
      },
    });
  } catch (e) {
    await route.abort();
  }
});
try {
  await page.goto(base);
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => window.liveLab?.lab?.renderer);
  await page.locator("#labManual").click();
  await page.waitForFunction(
    () => liveLab.lab.weather.data?.time,
    {},
    { timeout: 30000 },
  );
  const weather = await page.evaluate(() => ({ ...liveLab.lab.weather.data }));
  assert.ok(weather.speed >= 0);
  assert.ok(weather.direction >= 0 && weather.direction <= 360);
  await page.locator("#labCamera").click();
  await page.waitForFunction(
    () => liveLab.lab.cameraOn,
    {},
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => liveLab.lab.lastVideo > 0,
    {},
    { timeout: 15000 },
  );
  assert.ok(
    await page.evaluate(
      () => liveLab.pose && liveLab.stream.getVideoTracks().length === 1,
    ),
  );
  assert.equal(await page.evaluate(() => liveLab.lab.pc), false);
  await page.screenshot({
    path: process.env.LAB_SCREENSHOT || "/tmp/wind-lab-live.png",
  });
  await page.evaluate(
    () => (window.track = liveLab.stream.getVideoTracks()[0]),
  );
  await page.locator("#labExit").click();
  assert.equal(await page.evaluate(() => track.readyState), "ended");
  assert.equal(await page.evaluate(() => liveLab.pose), null);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real Open-Meteo current wind " +
      JSON.stringify(weather) +
      "; real Pose initialization/inference on generated camera, one video track, camera/Pose disposal",
  );
} finally {
  await browser.close();
}

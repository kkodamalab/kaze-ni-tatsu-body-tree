// Optional network smoke test: real MediaPipe models, Chromium's generated camera.
// No real face image is used. TLS verification remains enabled on asset downloads.
import assert from "node:assert/strict";
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
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage();
try {
  // Use the OS trust store through curl when Chromium lacks the cloud proxy CA.
  await page.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (
      !["cdn.jsdelivr.net", "storage.googleapis.com"].includes(
        new URL(url).hostname,
      )
    )
      return route.abort();
    const { stdout } = await run(
      "curl",
      ["--fail", "--silent", "--show-error", "--location", url],
      { encoding: "buffer", maxBuffer: 40 * 1024 * 1024 },
    );
    await route.fulfill({
      body: stdout,
      headers: {
        "content-type": url.endsWith(".wasm")
          ? "application/wasm"
          : url.endsWith(".task")
            ? "application/octet-stream"
            : "application/javascript",
        "access-control-allow-origin": "*",
      },
    });
  });
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#photoConsent").check();
  await page.click("#startBtn");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#photoStatus")
        .textContent.includes("顔が見つかりません"),
    {},
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => Number(document.querySelector("#timer").textContent) < 30,
    {},
    { timeout: 15000 },
  );
  assert.equal(await page.locator("#finish").isVisible(), false);
  console.log(
    "PASS: real Pose and Face model initialization, Face worker inference on a generated camera, no-face handling and independent game clock",
  );
} finally {
  await browser.close();
}

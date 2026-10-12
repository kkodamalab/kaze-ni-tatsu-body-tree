import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  }),
  errors = [];
let workers = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("worker", (w) => {
  if (w.url().endsWith("pose-worker.js")) workers++;
});
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      source +
      `\nwindow.phase5={get lab(){return labInstance},get pose(){return pose}};`,
  }),
);
await page.route("**/pose-worker.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body: `let sequence,kind='A',start=null,delay=0;self.onmessage=async({data:d})=>{if(d.type==='init'){({poseSequence:sequence}=await import('./src/wind-lab/PoseSequences.js'));self.postMessage({type:'ready'});}if(d.type==='test'){kind=d.kind;start=null;delay=d.delay||0;}if(d.type==='frame'){start??=d.timestamp;const sample=sequence(kind,(d.timestamp-start)/1000);d.bitmap.close();setTimeout(()=>self.postMessage({type:'result',timestamp:d.timestamp,generation:d.generation,inferenceMs:delay,result:{landmarks:sample.landmarks?[sample.landmarks]:[],worldLandmarks:sample.worldLandmarks?[sample.worldLandmarks]:[]}}),delay);}}`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const preset = (name) =>
  page.getByRole("button", { name, exact: true }).click();
const set = (kind) =>
  page.evaluate(
    (kind) => phase5.pose.worker.postMessage({ type: "test", kind }),
    kind,
  );
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => phase5.lab?.renderer);
  await page.locator("#lab-avatar").check();
  await page.locator("#lab-handDebug").check();
  // Camera-free A–G reuse the mapper, body and hands; no Pose model is needed.
  for (const kind of ["A", "B", "C", "D", "E", "F", "G"]) {
    await page.locator("#labPoseTest").selectOption(kind);
    await page.waitForTimeout(160);
    assert.ok(
      await page.evaluate(() =>
        phase5.lab.engine.positions.every(Number.isFinite),
      ),
    );
  }
  assert.equal(workers, 0);
  await page.locator("#labPoseTest").selectOption("");
  await page.locator("#labCamera").click();
  await page.waitForFunction(
    () => phase5.lab.cameraOn && phase5.pose.result?.timestamp > 0,
  );
  assert.equal(workers, 1);
  await preset("BODY ONLY");
  await set("A");
  await page.waitForTimeout(400);
  assert.ok(
    await page.evaluate(
      () => Math.hypot(...phase5.lab.engine.body.value) < 0.03,
    ),
  );
  await set("B");
  await page.evaluate(() => phase5.lab.engine.velocities.fill(0));
  await page.waitForFunction(() => phase5.lab.engine.body.value[0] > 0.3);
  assert.ok(
    await page.evaluate(() => {
      const v = phase5.lab.engine.velocities;
      return Array.from({ length: v.length / 3 }, (_, i) => v[i * 3]).every(
        (x) => Math.abs(x - v[0]) < 1e-5,
      );
    }),
  );
  await set("C");
  await page.waitForFunction(() => phase5.lab.engine.body.value[2] > 0.2);
  await page.locator("#labCalibrate").click();
  assert.equal(
    await page.evaluate(() => phase5.lab.engine.body.calibrated),
    true,
  );
  for (const [kind, side, label] of [
    ["D", "left", "LEFT HAND ONLY"],
    ["E", "right", "RIGHT HAND ONLY"],
  ]) {
    await preset(label);
    await set(kind);
    await page.waitForFunction(
      (side) => Math.hypot(...phase5.lab.engine[side].velocity) > 0.2,
      side,
    );
    assert.deepEqual(
      await page.evaluate(
        (side) =>
          phase5.lab.engine[side].at(-9, -9, -9, phase5.lab.engine.config),
        side,
      ),
      [0, 0, 0],
    );
    for (const size of [20, 100, 300]) {
      await page.locator("#lab-avatarSize").fill(String(size));
      await page.waitForTimeout(50);
      assert.ok(
        await page.evaluate(
          (side) =>
            phase5.lab.avatar
              .wrist(side)
              .every(
                (v, i) =>
                  Math.abs(v - phase5.lab.engine[side].position[i]) < 1e-5,
              ),
          side,
        ),
      );
      assert.ok(
        await page.evaluate(
          (side) =>
            phase5.lab.debug.handMarkers[side === "left" ? 0 : 1].position
              .toArray()
              .every(
                (v, i) =>
                  Math.abs(v - phase5.lab.engine[side].position[i]) < 1e-5,
              ),
          side,
        ),
      );
    }
  }
  await preset("ALL ON");
  await set("F");
  await page.waitForFunction(
    () =>
      Math.hypot(...phase5.lab.engine.left.velocity) > 0.1 &&
      Math.hypot(...phase5.lab.engine.right.velocity) > 0.1,
  );
  for (const mode of ["DOT", "KIDS", "ART"]) {
    await page.locator(`[data-mode=${mode}]`).click();
    await page.waitForTimeout(60);
    assert.ok(
      await page.evaluate(() =>
        phase5.lab.avatar
          .wrist("left")
          .every(
            (v, i) => Math.abs(v - phase5.lab.engine.left.position[i]) < 1e-5,
          ),
      ),
    );
    assert.equal(workers, 1);
  }
  await page.locator("[data-mode=DOT]").click();
  await page.locator("#labDuration").evaluate((i) => (i.value = "60")); // hidden in DOT; use play start in KIDS for growth-loss coverage.
  await page.locator("[data-mode=KIDS]").click();
  await page.locator("#labDuration").fill("60");
  await page.locator("#labStartPlay").click();
  await set("G");
  await page.waitForFunction(() => phase5.lab.play.growth.elapsedMs > 300);
  await page.waitForFunction(() => phase5.lab.play.growth.snapshot().waiting);
  await page.waitForFunction(() => !phase5.lab.avatar.group.visible);
  await page.waitForFunction(
    () =>
      phase5.lab.avatar.group.visible &&
      !phase5.lab.play.growth.snapshot().waiting,
  );
  // Delayed worker inference leaves the Three.js RAF running and drops stale samples.
  await page.evaluate(() => {
    phase5.pose.worker.postMessage({ type: "test", kind: "A", delay: 700 });
    window.previousRender = phase5.lab.engine.time;
  });
  await page.waitForTimeout(1000);
  assert.ok(
    await page.evaluate(() => phase5.lab.engine.time > previousRender + 0.5),
  );
  await page.evaluate(() =>
    phase5.pose.worker.postMessage({ type: "test", kind: "A", delay: 0 }),
  );
  await page.locator("[data-mode=DOT]").click();
  const download = page.waitForEvent("download");
  await page.locator("#labTrackingCsv").click();
  const file = await download,
    contents = await readFile(await file.path(), "utf8");
  for (const column of [
    "timestamp",
    "pose_detected",
    "left_hand_vx",
    "body_tilt_x",
    "inference_fps",
  ])
    assert.ok(contents.split("\n")[0].includes(column));
  await page.locator(".lab-tracking").evaluate((d) => (d.open = false));
  assert.equal(await page.locator("#labTrackingDebug").isVisible(), false);
  await page.locator(".lab-tracking").evaluate((d) => (d.open = true));
  await page.locator("#lab-gridX").fill("20");
  await page.locator("#lab-gridY").fill("20");
  await page.locator("#lab-gridZ").fill("20");
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => phase5.lab.engine.count), 8000);
  await page.locator("#labExit").click();
  assert.equal(await page.evaluate(() => phase5.pose), null);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: A–G shared Pose mapper/physics; body/depth/calibration/local hands; wrist=physical center at20/100/300 and all modes; one shared worker; loss/recovery; delayed inference keeps RAF; tracking CSV/folded debug;8000 particles/disposal (synthetic only)",
  );
} finally {
  await browser.close();
}

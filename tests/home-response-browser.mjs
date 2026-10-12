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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      app +
      "\nwindow.responseAudit={get lab(){return labInstance},get pose(){return pose}};",
  }),
);
await page.route("**/pose-worker.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body: `let sequence,speed=.1,start;self.onmessage=async({data:d})=>{if(d.type==='init'){({poseSequence:sequence}=await import('./src/wind-lab/PoseSequences.js'));postMessage({type:'ready'});}if(d.type==='test'){speed=d.speed;start=null;}if(d.type==='frame'){start??=d.timestamp;const sample=sequence('A',0);sample.worldLandmarks=null;sample.landmarks[15].x=.55+Math.sin((d.timestamp-start)/1000)*speed;sample.landmarks[15].y=.55;d.bitmap.close();setTimeout(()=>postMessage({type:'result',timestamp:d.timestamp,generation:d.generation,result:{landmarks:[sample.landmarks],worldLandmarks:[]}}),35);}}`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator("#homeDetails").getAttribute("open"), null);
    const layout = await page.evaluate(() => {
      const p = document.querySelector("#start"),
        b = document.querySelector("#startBtn");
      return {
        overflow: getComputedStyle(p).overflowY,
        maxHeight: getComputedStyle(p).maxHeight,
        width: document.documentElement.scrollWidth,
        button: b.getBoundingClientRect().bottom,
        title: parseFloat(
          getComputedStyle(document.querySelector("#start h1")).fontSize,
        ),
      };
    });
    assert.equal(layout.overflow, "visible");
    assert.equal(layout.maxHeight, "none");
    assert.ok(layout.width <= width);
    assert.ok(layout.button < 900);
    assert.ok(layout.title <= 42);
    await page.locator("#homeDetails > summary").click();
    assert.equal(await page.locator("#photoConsent").isChecked(), false);
    assert.equal(await page.locator("#photoConsent").isVisible(), true);
    assert.equal(await page.locator("#smileEnabled").isVisible(), true);
    assert.equal(
      await page
        .locator("#homeDetails")
        .evaluate((e) => getComputedStyle(e).overflowY),
      "visible",
    );
    await page.screenshot({
      path: "/tmp/home-response-" + width + ".png",
      fullPage: true,
    });
    await page.locator("#homeDetails > summary").click();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => responseAudit.lab?.engine);
  assert.equal(
    await page.locator("#lab-responsePreset").inputValue(),
    "NORMAL",
  );
  for (const name of ["SOFT", "NORMAL", "STRONG"]) {
    await page.locator("#lab-responsePreset").selectOption(name);
    assert.equal(
      await page.evaluate(() => responseAudit.lab.engine.config.responsePreset),
      name,
    );
  }
  await page.locator("#lab-leftSensitivity").fill("179");
  assert.equal(
    await page.locator("#lab-responsePreset").inputValue(),
    "CUSTOM",
  );
  await page.locator("#lab-responsePreset").selectOption("NORMAL");
  await page.locator("#lab-avatar").check();
  await page.locator("#lab-handDebug").check();
  const colors = await page.evaluate(() => {
    const l = responseAudit.lab;
    return [
      l.avatar.lineMaterial.color.getHex(),
      ...l.debug.spheres.map((s) => s.material.color.getHex()),
      ...l.debug.handMarkers.map((s) => s.material.color.getHex()),
      ...l.debug.handArrows.map((s) => s.line.material.color.getHex()),
    ];
  });
  assert.deepEqual(
    colors,
    [0x20b8e8, 0xe94f91, 0xf4b942, 0xe94f91, 0xf4b942, 0xe94f91, 0xf4b942],
  );
  assert.ok(
    await page.evaluate(() =>
      responseAudit.lab.debug.spheres.every((s) => s.material.wireframe),
    ),
  );
  await page.locator("#lab-handDebug").uncheck();
  await page.waitForFunction(() =>
    responseAudit.lab.debug.spheres.every((s) => !s.visible),
  );
  await page.locator("#lab-axes").uncheck();
  await page.waitForFunction(() => !responseAudit.lab.debug.axes.visible);
  await page.locator("#labCamera").click();
  await page.waitForFunction(() => responseAudit.pose?.result?.timestamp > 0);
  await page
    .getByRole("button", { name: "LEFT HAND ONLY", exact: true })
    .click();
  const response = [];
  for (const speed of [0.025, 0.08]) {
    await page.evaluate((speed) => {
      const l = responseAudit.lab;
      l.engine.reset();
      l.poseTest = "";
      l.engine.left.previous = null;
      l.engine.left.position = null;
      l.engine.left.age = Infinity;
      responseAudit.pose.worker.postMessage({ type: "test", speed });
    }, speed);
    await page.waitForTimeout(1600);
    const result = await page.evaluate(() => ({
      wristSpeed: responseAudit.lab.engine.left.wristSpeed,
      wind: Math.hypot(
        ...responseAudit.lab.engine.left.at(
          ...responseAudit.lab.engine.left.position,
          responseAudit.lab.engine.config,
        ),
      ),
      ...responseAudit.lab.engine.motion,
    }));
    assert.ok(result.displacement1s > 0.001);
    assert.ok(result.meanSpeed > 0.001);
    assert.ok(result.leftCount > 0);
    response.push(result);
  }
  assert.ok(response[1].displacement1s > response[0].displacement1s);
  console.log("WORKER MEASURE", JSON.stringify(response));
  for (const mode of ["DOT", "KIDS", "ART"]) {
    await page.locator("[data-mode=" + mode + "]").click();
    await page.locator(".lab-details").evaluate((e) => (e.open = true));
    await page.locator(".lab-tracking").evaluate((e) => (e.open = true));
    await page.waitForFunction(
      () =>
        responseAudit.lab.avatar.group.visible &&
        responseAudit.lab.engine.motion.displacement1s > 0.001,
    );
    assert.equal(
      await page.evaluate(() => responseAudit.lab.engine.config.responsePreset),
      "NORMAL",
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#labTrackingDebug")
        .textContent.includes("PARTICLE DISPLACEMENT LAST 1s"),
    );
  }
  await page.locator("#labExit").click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: home1280/768/390/no nested scroll/consent; shared presets/custom/colors/debug/axis/avatar; actual particle travel through async Worker, slow/fast and DOT/KIDS/ART (no real participant)",
  );
} finally {
  await browser.close();
}

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
page.on("pageerror", (e) => errors.push(e.message));
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      source +
      `\nwindow.audit={get lab(){return labInstance},inits:0,valid:true};initPose=async()=>{if(pose)return;audit.inits++;pose={detectForVideo:()=>({landmarks:audit.valid?[Array.from({length:33},(_,i)=>({x:i===15?.7:i===16?.3:.5,y:i===11||i===12?.2:i===23||i===24?.7:.5,z:0,visibility:1}))]:[]}),close(){}};};`,
  }),
);
await page.route("**/face-worker.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body: `self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});if(data.type==='frame'){data.bitmap.close();self.postMessage({type:'result',timestamp:data.timestamp,observation:{detected:true,score:1,quality:.95}})}}`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const mode = (m) => page.locator(`[data-mode=${m}]`).click();
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => audit.lab?.play);
  assert.equal(await page.evaluate(() => audit.lab.mode), "DOT");
  await page.evaluate(() => {
    const l = audit.lab;
    window.originalEngine = l.engine;
    window.positions = l.engine.positions;
    window.velocity = l.engine.velocities;
    l.setMode("KIDS");
    l.setMode("ART");
    l.setMode("DOT");
  });
  assert.equal(
    await page.evaluate(
      () =>
        audit.lab.engine === originalEngine &&
        audit.lab.engine.positions === positions &&
        audit.lab.engine.velocities === velocity,
    ),
    true,
  );
  await mode("KIDS");
  assert.equal(await page.locator(".lab-details").getAttribute("open"), null);
  assert.equal(await page.locator("#labDebug").isVisible(), false);
  await page.locator("#labDuration").fill("2");
  await page.locator("#labStartPlay").click();
  await page.waitForFunction(() => audit.lab.play.growth.elapsedMs > 300);
  await page.locator("#labPausePlay").click();
  const paused = await page.evaluate(() => audit.lab.play.growth.elapsedMs);
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => audit.lab.play.growth.elapsedMs),
    paused,
  );
  await mode("ART");
  assert.equal(
    await page.evaluate(() => audit.lab.play.growth.elapsedMs),
    paused,
  );
  await page.locator("#labPausePlay").click();
  await page.waitForFunction(() => audit.lab.play.growth.phase === "finished");
  await page.waitForFunction(
    () => !document.querySelector("#labResult").hidden,
  );
  assert.equal(
    await page.evaluate(() => audit.lab.play.growth.snapshot().growth),
    1,
  );
  assert.equal(await page.locator("#lab-noPhotos").isVisible(), true);
  const csvPromise = page.waitForEvent("download");
  await page.locator("#labPlayCsv").click();
  assert.match((await csvPromise).suggestedFilename(), /wind-lab/);
  await page.locator("#labAgain").click();
  await page.locator("#labCamera").click();
  await page.waitForFunction(() => audit.lab.cameraOn);
  assert.equal(await page.evaluate(() => audit.inits), 1);
  await page.locator("#labDuration").fill("1");
  await page.locator("#labStartPlay").click();
  await page.waitForFunction(() => audit.lab.play.growth.phase === "finished");
  assert.equal(
    await page.evaluate(() => audit.lab.play.photos.photos.length),
    0,
  );
  assert.equal(await page.evaluate(() => audit.lab.play.face.enabled), false);
  await page.locator("#labAgain").click();
  await page.locator("#labDuration").fill("4");
  await page.locator("#labPhotoConsent").check();
  await page.locator("#labStartPlay").click();
  await page.waitForFunction(() => audit.lab.play.photos.photos.length > 0);
  await page.evaluate(() => (audit.valid = false));
  await page.waitForTimeout(1100);
  const lost = await page.evaluate(() => audit.lab.play.growth.elapsedMs);
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => audit.lab.play.growth.elapsedMs),
    lost,
  );
  assert.equal(
    await page.evaluate(() => audit.lab.play.growth.snapshot().waiting),
    true,
  );
  await mode("KIDS");
  assert.equal(await page.evaluate(() => audit.inits), 1);
  assert.ok(await page.evaluate(() => audit.lab.play.photos.photos.length > 0));
  await page.evaluate(() => (audit.valid = true));
  await page.waitForFunction(() => audit.lab.play.growth.phase === "finished");
  await page.waitForFunction(
    () => !document.querySelector("#labResult").hidden,
  );
  await page.screenshot({ path: "/tmp/wind-grown-tree.png" });
  assert.equal(await page.evaluate(() => audit.lab.modes.tree.visible), true);
  await page.locator("#lab-photoGrid button").first().click();
  await page.locator("#lab-choosePhotoBtn").click();
  assert.equal(
    await page.evaluate(
      () => windTreePhotoGift.getSelectedGift().blob instanceof Blob,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => windTreePhotoGift.getSelectedGift().result.growth,
    ),
    1,
  );
  const imagePromise = page.waitForEvent("download");
  await page.locator("#lab-savePhotoBtn").click();
  assert.match((await imagePromise).suggestedFilename(), /\.jpg$/);
  await page.locator("#lab-deletePhotoBtn").click();
  assert.equal(
    await page.evaluate(() => windTreePhotoGift.getSelectedGift()),
    null,
  );
  await page.locator("#labAgain").click();
  assert.equal(
    await page.evaluate(() => audit.lab.play.photos.photos.length),
    0,
  );
  assert.equal(await page.locator("#labPhotoConsent").isChecked(), false);
  // Repeated mode replacement disposes GPU geometry/textures without changing camera/model.
  await page.evaluate(() => {
    const l = audit.lab;
    for (let i = 0; i < 20; i++) {
      l.setMode(i % 2 ? "KIDS" : "ART");
      l.renderer.render(l.scene, l.view);
    }
    l.setMode("DOT");
    l.renderer.render(l.scene, l.view);
  });
  assert.equal(await page.evaluate(() => audit.inits), 1);
  assert.ok(
    await page.evaluate(() => audit.lab.renderer.info.memory.textures <= 1),
  );
  await page.evaluate(() => {
    const l = audit.lab;
    l.apply({ ...l.engine.config, gridX: 20, gridY: 20, gridZ: 20 });
    for (const mode of ["DOT", "KIDS", "ART"]) {
      l.setMode(mode);
      for (const component of ["weather", "body", "left", "right"]) {
        l.apply({
          ...l.engine.config,
          weather: component === "weather",
          body: component === "body",
          left: component === "left",
          right: component === "right",
        });
        l.engine.input(
          { body: [0.3, 0, 0], left: [-3, 0, 0], right: [3, 0, 0] },
          performance.now() + 1,
        );
        l.engine.input(
          { body: [0.4, 0, 0], left: [-2, 0, 0], right: [4, 0, 0] },
          performance.now() + 101,
        );
        l.engine.step(0.1);
        l.field.update();
        l.renderer.render(l.scene, l.view);
        if (
          l.engine.count !== 8000 ||
          !l.engine.velocities.every(Number.isFinite)
        )
          throw Error("mode field failure");
      }
    }
    l.apply({ ...l.engine.config, gridX: 10, gridY: 10, gridZ: 10 });
  });
  await mode("KIDS");
  await page.screenshot({ path: "/tmp/wind-kids.png" });
  await mode("ART");
  await page.screenshot({ path: "/tmp/wind-art.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mode("KIDS");
  assert.ok(
    await page.evaluate(
      () => document.querySelector("#windLab").scrollWidth <= 390,
    ),
  );
  await page.locator("#labStartPlay").scrollIntoViewIfNeeded();
  assert.equal(await page.locator("#labStartPlay").isVisible(), true);
  await page.evaluate(() => {
    window.closedLab = audit.lab;
    window.track = audit.lab.video.srcObject.getTracks()[0];
  });
  await page.locator("#labExit").click();
  assert.equal(
    await page.evaluate(
      () =>
        closedLab.disposed &&
        closedLab.raf === null &&
        closedLab.play.photos.photos.length === 0 &&
        track.readyState === "ended",
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared mode physics, growth/pause/lost input, generated-camera smile/photo/gift/save/delete/reset, resource disposal and mobile layout",
  );
} finally {
  await browser.close();
}

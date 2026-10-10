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
  viewport: { width: 1000, height: 900 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
// Use a local generated camera frame and deterministic Worker outputs, never a real participant.
const camera = `async function cameraStart(){if(window.simulateDenied)throw new Error('NotAllowedError');const image=document.createElement('canvas');image.width=640;image.height=480;const context=image.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,320,480);context.fillStyle='#0000ff';context.fillRect(320,0,320,480);stream=image.captureStream(10);video.srcObject=stream;await video.play();pose={detectForVideo:()=>({landmarks:[]})};}`;
const hooks = `window.checkSettings={get state(){return{clock:clock.snapshot(),running,finishCount,gains:{...gains},sensitivities:{...sensitivities},photos:photos.photos.map(({blob,...p})=>({...p,size:blob.size})),faceEnabled:faceCapture.enabled,selectedId:photos.selectedId}},observation(score,detected=true){faceCapture.worker?.onmessage({data:{type:'result',timestamp:performance.now(),observation:{detected,score,quality:.95}}})},manualFaces(){clearInterval(faceCapture.interval);},fillPhotos(){const sample=photos.photos[0];for(let i=photos.photos.length;i<10;i++)photos.add(sample.blob,{...sample,elapsedSec:i,quality:.8},photos.trialId);photoUI.render()},hidden(value){Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'))}};`;
await page.route("**/app.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body:
      source.replace(
        /async function cameraStart\(\) \{[\s\S]*?\n\}\nfunction confidence/,
        camera + "\nfunction confidence",
      ) +
      "\n" +
      hooks,
  }),
);
let failModel = false;
await page.route("**/face-worker.js", (r) =>
  r.fulfill({
    contentType: "application/javascript",
    body: failModel
      ? `self.onmessage=()=>self.postMessage({type:'error',message:'笑顔モデルを読み込めませんでした。撮影なしでゲームを続けます。'})`
      : `self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});if(data.type==='frame'){data.bitmap.close();self.postMessage({type:'result',timestamp:data.timestamp,observation:{detected:false,score:0,quality:0}})}}`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const state = () => page.evaluate(() => checkSettings.state);
async function replay() {
  await page.click("#againBtn");
  assert.equal((await state()).photos.length, 0);
  assert.equal(await page.locator("#photoConsent").isChecked(), false);
}
try {
  await page.clock.install();
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#durationNumber").fill("61");
  await page.click("#testBtn");
  assert.equal((await state()).clock.phase, "idle");
  assert.ok(
    (await page.locator("#durationError").textContent()).includes("整数"),
  );
  await page.locator("#durationRange").fill("1");
  assert.equal(await page.locator("#durationNumber").inputValue(), "1");
  for (const side of ["body", "left", "right"]) {
    await page.locator(`#${side}Sensitivity`).fill("0");
    assert.equal((await state()).gains[side], 0);
    await page.locator(`#${side}Sensitivity`).fill("70");
    assert.ok((await state()).gains[side] > 1);
    await page.locator(`#${side}Sensitivity`).fill("100");
    assert.equal((await state()).gains[side], 3);
  }
  await page.reload();
  assert.deepEqual((await state()).sensitivities, {
    body: 100,
    left: 100,
    right: 100,
  });
  assert.equal(await page.locator("#photoConsent").isChecked(), false);
  await page.locator("#durationNumber").fill("1");
  await page.click("#testBtn");
  assert.equal(await page.locator("#message").textContent(), "3");
  await page.clock.runFor(1020);
  assert.equal(await page.locator("#message").textContent(), "2");
  await page.clock.runFor(1000);
  assert.equal(await page.locator("#message").textContent(), "1");
  await page.evaluate(() => checkSettings.hidden(true));
  await page.clock.fastForward(10000);
  assert.equal((await state()).clock.phase, "countdown");
  await page.evaluate(() => checkSettings.hidden(false));
  await page.clock.runFor(1100);
  assert.equal((await state()).running, true);
  await page.evaluate(() => checkSettings.hidden(true));
  const elapsed = (await state()).clock.elapsedMs;
  await page.clock.fastForward(10000);
  assert.equal((await state()).clock.elapsedMs, elapsed);
  await page.evaluate(() => checkSettings.hidden(false));
  await page.clock.runFor(1000);
  assert.equal((await state()).finishCount, 1);
  assert.equal((await state()).clock.elapsedMs, 1000);
  await page.clock.fastForward(5000);
  assert.equal((await state()).finishCount, 1);
  await page.setViewportSize({ width: 400, height: 850 });
  assert.equal(await page.locator("#testPanel").isVisible(), false);
  await replay();
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => (window.simulateDenied = true));
  await page.click("#startBtn");
  assert.equal((await state()).clock.phase, "idle");
  assert.ok(
    (await page.locator("#startStatus").textContent()).includes(
      "カメラを開始できません",
    ),
  );
  await page.evaluate(() => (window.simulateDenied = false));
  // Camera game without explicit consent never enables Face or captures photos.
  await page.locator("#durationNumber").fill("1");
  await page.click("#startBtn");
  await page.clock.runFor(4100);
  assert.equal((await state()).faceEnabled, false);
  assert.equal((await state()).photos.length, 0);
  assert.equal((await state()).finishCount, 1);
  await replay();
  // Model failure is isolated from Pose, physics and the clock.
  failModel = true;
  await page.locator("#photoConsent").check();
  await page.click("#startBtn");
  await page.waitForFunction(() =>
    document
      .querySelector("#photoStatus")
      .textContent.includes("読み込めません"),
  );
  await page.clock.runFor(4100);
  assert.equal((await state()).finishCount, 1);
  assert.equal((await state()).photos.length, 0);
  await replay();
  failModel = false;
  // Synthetic face scores trigger real mirrored JPEG creation from the generated frame.
  await page.locator("#durationNumber").fill("30");
  await page.locator("#photoConsent").check();
  await page.click("#startBtn");
  await page.waitForFunction(() =>
    document
      .querySelector("#photoStatus")
      .textContent.includes("笑顔を待っています"),
  );
  await page.clock.runFor(3100);
  // Disable automatic fake no-face frames so only explicit test observations drive the gate.
  await page.evaluate(() => checkSettings.manualFaces());
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => checkSettings.observation(1));
    await page.clock.runFor(125);
  }
  await page.waitForFunction(
    () => checkSettings.state.photos.length === 1,
    {},
    { timeout: 5000 },
  );
  assert.ok((await state()).photos[0].size > 0);
  await page.evaluate(() => checkSettings.fillPhotos());
  assert.equal((await state()).photos.length, 10);
  await page.clock.fastForward(30000);
  assert.equal((await state()).finishCount, 1);
  assert.equal(await page.locator(".photoThumb").count(), 10);
  await page.locator(".photoThumb").first().click();
  assert.equal(await page.locator("#photoDialog").isVisible(), true);
  await page.click("#choosePhotoBtn");
  const gift = await page.evaluate(() => {
    const gift = windTreePhotoGift.getSelectedGift();
    return {
      blob: gift.blob instanceof Blob,
      ...gift,
      blobSize: gift.blob.size,
    };
  });
  assert.equal(gift.blobSize > 0, true);
  assert.equal(gift.gameName, "kaze-ni-tatsu-body-tree");
  assert.equal(gift.result.configuredDurationSec, 30);
  const downloading = page.waitForEvent("download");
  await page.click("#savePhotoBtn");
  const download = await downloading;
  assert.ok(download.suggestedFilename().endsWith(".jpg"));
  await page.click("#deletePhotoBtn");
  assert.equal((await state()).photos.length, 9);
  assert.equal(
    await page.evaluate(() => windTreePhotoGift.getSelectedGift()),
    null,
  );
  const oldUrls = (await state()).photos.map((p) => p.url);
  await replay();
  assert.equal(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    }, oldUrls[0]),
    false,
  );
  assert.equal((await state()).selectedId, null);
  assert.equal((await state()).faceEnabled, false);
  // 60 seconds completes despite a missing pose and no drawable frames during a large gap.
  await page.locator("#durationNumber").fill("60");
  await page.click("#testBtn");
  await page.clock.fastForward(63000);
  assert.equal((await state()).clock.elapsedMs, 60000);
  assert.equal((await state()).finishCount, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: duration validation/1s/60s/countdown/pause, independent sensitivity settings and storage, no consent, Face failure, JPEG capture, 10-photo grid, gift interface, save/delete and replay cleanup",
  );
} finally {
  await browser.close();
}

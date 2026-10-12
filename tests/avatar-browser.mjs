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
      `\nwindow.avatarAudit={get lab(){return labInstance},inits:0,landmarks:null,world:null};initPose=async()=>{if(pose)return;avatarAudit.inits++;pose={detectForVideo:()=>({landmarks:avatarAudit.landmarks?[avatarAudit.landmarks]:[],worldLandmarks:avatarAudit.world?[avatarAudit.world]:[]}),close(){}};};`,
  }),
);
await page.route("https://**/*", (r) => r.abort());
const mode = async (value) => {
  await page.locator(`[data-mode=${value}]`).click();
  await page.locator(".lab-details").evaluate((d) => (d.open = true));
};
const wait = (fn) => page.waitForFunction(fn);
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8000/");
  await page.locator("#windLabBtn").click();
  await wait(() => avatarAudit.lab?.avatar);
  assert.equal(await page.locator("#lab-axes").count(), 1);
  assert.equal(await page.locator("#lab-axes").isChecked(), true);
  assert.equal(await page.locator("#lab-avatar").isChecked(), false);
  // Freeze physics and snapshot resource identity: visual controls must not reset anything.
  await page.evaluate(() => {
    const l = avatarAudit.lab;
    l.apply({ ...l.engine.config, speed: 0 });
    window.saved = {
      engine: l.engine,
      p: l.engine.positions,
      v: l.engine.velocities,
      history: l.field.history,
      geometry: l.avatar.jointGeometry,
      material: l.avatar.lineMaterial,
      view: l.view.position.toArray(),
    };
  });
  for (const m of ["DOT", "KIDS", "ART"]) {
    await mode(m);
    await page.locator("#lab-axes").uncheck();
    await wait(
      () =>
        !avatarAudit.lab.debug.axes.visible &&
        !avatarAudit.lab.debug.weatherArrow.visible,
    );
    assert.equal(await page.locator("#lab-avatar-axes").isChecked(), false);
    await page.locator("#lab-avatar-axes").check();
    assert.equal(await page.locator("#lab-axes").isChecked(), true);
    await page.locator("#lab-avatar-axes").uncheck();
    await page.locator("#lab-axes").check();
    await wait(() => avatarAudit.lab.debug.axes.visible);
    await page.locator("#lab-avatar").check();
    await wait(() => avatarAudit.lab.avatar.group.visible);
    assert.equal(
      await page.evaluate(() => avatarAudit.lab.avatar.source),
      "PC TEST SYNTHETIC",
    );
    for (const size of [20, 100, 183, 300]) {
      await page.locator("#lab-avatarSize").fill(String(size));
      await wait(
        () =>
          avatarAudit.lab.avatar.config.avatarSize ===
          Number(document.querySelector("#lab-avatarSize").value),
      );
      const status = await page.evaluate(() => ({
        scale: avatarAudit.lab.avatar.displayScale,
        bounds: Math.max(...avatarAudit.lab.avatar.rendered.map(Math.abs)),
        count: avatarAudit.lab.avatar.validCount,
      }));
      assert.equal(status.count, 33);
      assert.ok(status.bounds < 10);
      assert.ok(status.scale > 0);
    }
    await page.locator("#lab-avatarStyle").selectOption("POINTS");
    await wait(() => !avatarAudit.lab.avatar.lines.visible);
    await page.locator("#lab-avatarStyle").selectOption("SKELETON");
    await wait(() => avatarAudit.lab.avatar.lines.visible);
    assert.equal(
      await page.evaluate(() => {
        const l = avatarAudit.lab;
        return (
          l.engine === saved.engine &&
          l.engine.positions === saved.p &&
          l.engine.velocities === saved.v &&
          l.field.history === saved.history &&
          l.avatar.jointGeometry === saved.geometry &&
          l.avatar.lineMaterial === saved.material &&
          l.view.position.toArray().every((v, i) => v === saved.view[i])
        );
      }),
      true,
    );
  }
  await mode("DOT");
  await page.locator("#lab-avatarSize").fill("100");
  await page.locator("#lab-test-leftX").fill("-3");
  await page.locator("#lab-test-rightY").fill("3");
  await wait(
    () =>
      Math.abs(avatarAudit.lab.avatar.wrist("left")[0] + 3) < 0.02 &&
      Math.abs(avatarAudit.lab.avatar.wrist("right")[1] - 3) < 0.02,
  );
  assert.ok(
    await page.evaluate(
      () => Math.abs(avatarAudit.lab.engine.left.position[0] + 3) < 0.02,
    ),
  );
  await page.locator("#lab-test-bodyX").fill("0.5");
  await wait(() => avatarAudit.lab.avatar.current[11 * 3] > 0.2);
  await page.locator("#lab-test-bodyZ").fill("0.4");
  await wait(() => avatarAudit.lab.avatar.current[11 * 3 + 2] > 0.9);
  await page.locator("#lab-axes").uncheck();
  await page.locator("#lab-avatarStyle").selectOption("POINTS");
  await page.reload();
  await page.locator("#windLabBtn").click();
  await wait(() => avatarAudit.lab?.avatar);
  assert.equal(await page.locator("#lab-axes").isChecked(), false);
  assert.equal(await page.locator("#lab-avatar").isChecked(), true);
  assert.equal(await page.locator("#lab-avatarStyle").inputValue(), "POINTS");
  await page.locator("#lab-avatarStyle").selectOption("SKELETON");
  await page.locator("#labCamera").click();
  await wait(() => avatarAudit.lab.cameraOn);
  assert.equal(await page.evaluate(() => avatarAudit.inits), 1);
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.35,
    z: 0,
    visibility: 1,
    presence: 1,
  }));
  lm[11] = { x: 0.4, y: 0.3, z: -0.05 };
  lm[12] = { x: 0.6, y: 0.3, z: -0.05 };
  lm[23] = { x: 0.45, y: 0.6, z: 0 };
  lm[24] = { x: 0.55, y: 0.6, z: 0 };
  lm[15] = { x: 0.8, y: 0.4, z: -0.1 };
  lm[16] = { x: 0.2, y: 0.4, z: 0.1 };
  lm[27] = { x: 0.45, y: 0.95, z: 0 };
  lm[28] = { x: 0.55, y: 0.95, z: 0 };
  await page.evaluate((lm) => {
    avatarAudit.landmarks = lm;
    avatarAudit.world = lm.map((p) => ({
      ...p,
      x: (p.x - 0.5) * 2,
      y: (p.y - 0.6) * 2,
      z: p.z * 2,
    }));
  }, lm);
  await wait(
    () =>
      avatarAudit.lab.avatar.source === "POSE WORLD" &&
      avatarAudit.lab.avatar.validCount === 33 &&
      avatarAudit.lab.avatar.group.visible,
  );
  await page.waitForFunction(
    () =>
      avatarAudit.lab.avatar.wrist("left")[1] > 0.5 &&
      avatarAudit.lab.avatar.wrist("left")[2] < 0,
  );
  const left = await page.evaluate(() => avatarAudit.lab.avatar.wrist("left"));
  assert.ok(left[0] < 0);
  assert.ok(left[1] > 0);
  assert.ok(left[2] < 0);
  assert.ok(
    await page.evaluate(
      () =>
        Math.abs(
          avatarAudit.lab.avatar.wrist("left")[0] -
            avatarAudit.lab.engine.left.position[0],
        ) < 1e-5,
    ),
  );
  await page.evaluate(() => {
    avatarAudit.landmarks[15].y -= 0.15;
    avatarAudit.landmarks[11].x -= 0.1;
    avatarAudit.landmarks[12].x -= 0.1;
    avatarAudit.world = avatarAudit.landmarks.map((p) => ({
      ...p,
      x: (p.x - 0.5) * 2,
      y: (p.y - 0.6) * 2,
      z: p.z * 2,
    }));
  });
  await wait(() => avatarAudit.lab.avatar.wrist("left")[1] > 2.2);
  await wait(() => avatarAudit.lab.avatar.current[11 * 3] > 1.6);
  await page.locator("#labSkeleton").click();
  await wait(() => avatarAudit.lab.skeletonPoints === 33);
  assert.equal(await page.evaluate(() => avatarAudit.inits), 1);
  await page.evaluate(() => (avatarAudit.world = null));
  await wait(() => avatarAudit.lab.avatar.source === "POSE NORMALIZED");
  await wait(() =>
    document
      .querySelector("#labDebug")
      .textContent.includes("AVATAR LEFT wrist"),
  );
  assert.match(await page.locator("#labDebug").textContent(), /LEFT position/);
  await page.evaluate(() => {
    avatarAudit.landmarks[23].visibility =
      avatarAudit.landmarks[24].visibility = 0.1;
  });
  for (const m of ["DOT", "KIDS", "ART"]) {
    await mode(m);
    for (const size of [20, 100, 183, 300]) {
      await page.evaluate((size) => {
        const l = avatarAudit.lab;
        l.apply({ ...l.engine.config, avatarSize: size });
      }, size);
      await wait(() => avatarAudit.lab.avatar.validCount === 31);
      await page.waitForTimeout(800);
      assert.equal(
        await page.evaluate(
          () =>
            avatarAudit.lab.avatar.group.visible &&
            avatarAudit.lab.avatar.lineGeometry.drawRange.count > 0,
        ),
        true,
      );
    }
  }
  await page.evaluate(() => (avatarAudit.landmarks = null));
  await wait(() => avatarAudit.lab.avatar.state === "LOST");
  assert.equal(
    await page.evaluate(() => avatarAudit.lab.avatar.group.visible),
    false,
  );
  await wait(() => !document.querySelector("#labAvatarStatus").hidden);
  assert.match(
    await page.locator("#labAvatarStatus").textContent(),
    /LAST POSE AGE[\s\S]*RENDER VISIBLE NO[\s\S]*HIDDEN REASON POSE EXPIRED/,
  );
  await page.evaluate((lm) => (avatarAudit.landmarks = lm), lm);
  await wait(
    () =>
      avatarAudit.lab.avatar.group.visible &&
      avatarAudit.lab.avatar.state === "DETECTED",
  );
  for (const m of ["KIDS", "ART", "DOT"]) {
    await mode(m);
    assert.equal(await page.evaluate(() => avatarAudit.inits), 1);
    await wait(() => avatarAudit.lab.avatar.group.visible);
    await page.screenshot({ path: "/tmp/avatar-" + m.toLowerCase() + ".png" });
  }
  await page.evaluate(() => {
    const l = avatarAudit.lab;
    l.apply({ ...l.engine.config, gridX: 20, gridY: 20, gridZ: 20 });
    l.renderer.render(l.scene, l.view);
    window.gpu = l.renderer.info.memory.geometries;
    for (let i = 0; i < 60; i++) {
      l.apply({
        ...l.engine.config,
        avatar: !!(i % 2),
        avatarStyle: i % 2 ? "POINTS" : "SKELETON",
      });
      l.avatar.update(performance.now(), 0.016, l.engine.config);
      l.renderer.render(l.scene, l.view);
    }
    if (l.renderer.info.memory.geometries !== gpu)
      throw Error("avatar resource leak");
  });
  assert.equal(await page.evaluate(() => avatarAudit.lab.engine.count), 8000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#lab-avatar").check();
  await page.locator("#lab-avatarSize").fill("20");
  await page.locator("#lab-avatarStyle").selectOption("POINTS");
  assert.ok(
    await page.evaluate(
      () => document.querySelector("#windLab").scrollWidth <= 390,
    ),
  );
  await page.evaluate(() => (window.closedAvatar = avatarAudit.lab.avatar));
  await page.locator("#labExit").click();
  assert.equal(
    await page.evaluate(
      () => closedAvatar.disposed && closedAvatar.group.children.length === 0,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: XYZ shared controls/all modes/no resets/storage; upper-body Pose31 joints at20/100/183/300 and missing-pose diagnostics; shared 33-point avatar size/style/PC TEST and synthetic 33-point Pose fixtures/world fallback/gestures/fade/recovery; one camera/Pose; 8000 particles; 60 toggles without GPU growth; mobile/disposal (no real participant)",
  );
} finally {
  await browser.close();
}

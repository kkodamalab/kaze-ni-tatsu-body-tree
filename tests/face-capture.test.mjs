import test from "node:test";
import assert from "node:assert/strict";
import { FaceCapture } from "../face-capture.mjs";
import { PhotoSession } from "../photos.mjs";
test("Face worker loads only on explicit start, errors disable capture, and stop disposes it", () => {
  let worker,
    created = 0;
  const statuses = [];
  const capture = new FaceCapture({
    video: {},
    session: new PhotoSession(),
    getElapsed: () => 0,
    isPlaying: () => false,
    onPhoto: () => assert.fail("no capture while inactive"),
    onStatus: (s) => statuses.push(s),
    workerFactory: () => {
      created++;
      return (worker = {
        postMessage() {},
        terminate() {
          this.terminated = true;
        },
      });
    },
  });
  assert.equal(created, 0);
  assert.equal(capture.enabled, false);
  capture.start(0.6);
  assert.equal(created, 1);
  worker.onmessage({ data: { type: "error", message: "failed" } });
  assert.equal(capture.enabled, false);
  assert.equal(worker.terminated, true);
  assert.equal(statuses.at(-1), "failed");
});
test("Face frame scheduling rejects duplicates and closes frames when the trial is stopped", async () => {
  let requests = 0,
    closed = 0,
    resolveBitmap;
  const video = {
    videoWidth: 960,
    videoHeight: 720,
    currentTime: 1,
    readyState: 2,
  };
  let active = true;
  const capture = new FaceCapture({
    video,
    session: new PhotoSession(),
    getElapsed: () => 100,
    isPlaying: () => active,
    onPhoto() {},
    onStatus() {},
    workerFactory: () => ({
      postMessage(data) {
        if (data.type === "frame") requests++;
      },
      terminate() {},
    }),
  });
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({
    close() {
      closed++;
    },
  });
  try {
    capture.start(0.6);
    await capture.frame();
    assert.equal(requests, 1);
    capture.busy = false;
    await capture.frame();
    assert.equal(requests, 1);
    video.currentTime = 2;
    active = false;
    await capture.frame();
    assert.equal(requests, 1);
    active = true;
    globalThis.createImageBitmap = () =>
      new Promise((resolve) => (resolveBitmap = resolve));
    const pending = capture.frame();
    capture.stop();
    resolveBitmap({
      close() {
        closed++;
      },
    });
    await pending;
    assert.equal(requests, 1);
    assert.equal(closed, 1);
  } finally {
    capture.stop();
    globalThis.createImageBitmap = original;
  }
});

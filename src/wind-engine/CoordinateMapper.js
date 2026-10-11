import { SPACE_SIZE } from "./WindConfig.js";
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const zero = () => [0, 0, 0];
export function windFromBearing(direction, speed, gain = 1) {
  const r = (direction * Math.PI) / 180; // +X east, +Y up, -Z north. Meteorological FROM -> motion TO.
  return [-Math.sin(r) * speed * gain, 0, Math.cos(r) * speed * gain];
}
export function validLandmark(p) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.min(p.visibility ?? 1, p.presence ?? 1) >= 0.45
  );
}
export class CoordinateMapper {
  constructor(size = SPACE_SIZE) {
    this.size = size;
  }
  resetAvatar() {
    this.avatarReference = null;
  }
  point(p) {
    return [
      (0.5 - p.x) * this.size,
      (0.5 - p.y) * this.size,
      clamp(Number.isFinite(p.z) ? p.z : 0, -0.5, 0.5) * this.size,
    ];
  }
  // Display-space adapter: same mirror/axis convention as point(), with hip origin.
  // Wind positions deliberately retain the existing camera-space mapping.
  avatarPose(landmarks, worldLandmarks) {
    const lm = landmarks || [];
    if (![23, 24].every((i) => validLandmark(lm[i]))) return null;
    const finite3 = (p) => validLandmark(p) && Number.isFinite(p.z);
    const world =
      worldLandmarks?.length >= 33 &&
      [11, 12, 23, 24].every((i) => finite3(worldLandmarks[i]));
    const input = world ? worldLandmarks : lm;
    const hip = ["x", "y", "z"].map(
      (k) => ((input[23][k] || 0) + (input[24][k] || 0)) / 2,
    );
    const points = Array.from({ length: 33 }, (_, i) => {
      const p = input[i];
      if (!validLandmark(lm[i]) || !validLandmark(p)) return null;
      // Monocular depth is bounded to prioritize X/Y and resist outlier Z estimates.
      return [
        hip[0] - p.x,
        hip[1] - p.y,
        clamp((Number.isFinite(p.z) ? p.z : 0) - hip[2], -1, 1),
      ];
    });
    const extent = Math.max(
      0.05,
      ...points
        .filter(Boolean)
        .flatMap((p) => [Math.abs(p[0]), Math.abs(p[1])]),
    );
    const source = world ? "POSE WORLD" : "POSE NORMALIZED";
    // Freeze the initial display scale so lifting a hand does not shrink the whole body.
    if (this.avatarReference?.source !== source)
      this.avatarReference = { source, extent };
    const reference = this.avatarReference.extent;
    const scale = (this.size * 0.15) / reference;
    return {
      points: points.map((p) =>
        p
          ? [
              p[0] * scale,
              p[1] * scale,
              clamp(p[2], -reference * 0.7, reference * 0.7) * scale,
            ]
          : null,
      ),
      source,
      windHands: {
        left: validLandmark(lm[15]) ? this.point(lm[15]) : null,
        right: validLandmark(lm[16]) ? this.point(lm[16]) : null,
      },
    };
  }
  syntheticPose(sample) {
    if (
      !sample?.body ||
      sample.body.length !== 3 ||
      !sample.body.every(Number.isFinite)
    )
      return null;
    const [x, y, z] = sample.body;
    const points = Array.from({ length: 33 }, () => [0, 0, 0]);
    const upper = (px, py, pz = 0) => [px + x * py, py + y * 0.4, pz + z * py];
    for (let i = 0; i <= 10; i++)
      points[i] = upper(
        ((i % 3) - 1) * 0.18,
        3.5 + (i === 0 ? 0.15 : 0),
        -0.12,
      );
    points[11] = upper(-1, 2.5);
    points[12] = upper(1, 2.5);
    points[23] = [-0.65, 0, 0];
    points[24] = [0.65, 0, 0];
    for (const [wrist, elbow, shoulder, side] of [
      [15, 13, 11, "left"],
      [16, 14, 12, "right"],
    ]) {
      const hand =
        sample[side]?.length === 3 && sample[side].every(Number.isFinite)
          ? sample[side].map((v) => clamp(v, -this.size / 2, this.size / 2))
          : null;
      points[wrist] = hand;
      points[elbow] = hand
        ? hand.map((v, i) => (v + points[shoulder][i]) / 2)
        : null;
      for (const i of side === "left" ? [17, 19, 21] : [18, 20, 22])
        points[i] = hand ? hand.map((v, k) => v + (k === 1 ? 0.12 : 0)) : null;
    }
    for (const [knee, ankle, heel, toe, px] of [
      [25, 27, 29, 31, -0.65],
      [26, 28, 30, 32, 0.65],
    ]) {
      points[knee] = [px, -1.8, 0.12];
      points[ankle] = [px, -3.6, 0];
      points[heel] = [px, -3.7, 0.2];
      points[toe] = [px, -3.7, -0.45];
    }
    return {
      points,
      source: "PC TEST SYNTHETIC",
      windHands: { left: points[15], right: points[16] },
    };
  }
  fromPose(landmarks, worldLandmarks) {
    const lm = landmarks || [];
    let body = null;
    if ([11, 12, 23, 24].every((i) => validLandmark(lm[i]))) {
      const avg = (a, b, k) => ((a[k] || 0) + (b[k] || 0)) / 2;
      const sx = avg(lm[11], lm[12], "x"),
        sy = avg(lm[11], lm[12], "y"),
        hx = avg(lm[23], lm[24], "x"),
        hy = avg(lm[23], lm[24], "y");
      const height = Math.max(0.08, hy - sy);
      const depth =
        worldLandmarks &&
        [11, 12, 23, 24].every((i) => validLandmark(worldLandmarks[i]))
          ? worldLandmarks
          : lm;
      body = [
        clamp((hx - sx) / height, -1, 1),
        clamp((height - 0.3) * 2, -1, 1),
        clamp(
          (avg(depth[11], depth[12], "z") - avg(depth[23], depth[24], "z")) /
            Math.max(0.2, depth === lm ? height : 0.5),
          -1,
          1,
        ),
      ];
    }
    return {
      body,
      left: validLandmark(lm[15]) ? this.point(lm[15]) : null,
      right: validLandmark(lm[16]) ? this.point(lm[16]) : null,
    };
  }
}

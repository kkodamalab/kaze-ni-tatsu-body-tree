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
  point(p) {
    return [
      (0.5 - p.x) * this.size,
      (0.5 - p.y) * this.size,
      clamp(Number.isFinite(p.z) ? p.z : 0, -0.5, 0.5) * this.size,
    ];
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

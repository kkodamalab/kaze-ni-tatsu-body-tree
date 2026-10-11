import { zero, clamp } from "./CoordinateMapper.js";
export class BodyWind {
  constructor() {
    this.value = zero();
    this.neutral = zero();
    this.raw = null;
    this.previous = null;
    this.rate = zero();
    this.age = Infinity;
  }
  input(axis, dt) {
    if (axis?.length === 3 && axis.every(Number.isFinite)) {
      this.raw = axis.map((v) => clamp(v, -1, 1));
      this.rate = this.raw.map((v, i) =>
        dt > 0 && dt <= 0.25 && this.previous
          ? clamp((v - this.previous[i]) / dt, -3, 3)
          : 0,
      );
      this.previous = [...this.raw];
      this.age = 0;
    } else {
      this.raw = null;
      this.previous = null;
      this.rate = zero();
      this.age = Infinity;
    }
  }
  calibrate() {
    if (this.raw) {
      this.neutral = [...this.raw];
      this.previous = [...this.raw];
      this.rate = zero();
      this.value = zero();
      return true;
    }
    return false;
  }
  update(dt, c) {
    this.age += dt;
    const active = c.body && this.raw && this.age <= 0.25;
    const a = 1 - Math.exp(-dt / (0.02 + (c.bodySmoothing / 100) * 0.6));
    for (let i = 0; i < 3; i++) {
      const target = active
        ? (((this.raw[i] - this.neutral[i]) * 5 + this.rate[i] * 0.35) *
            c.bodySensitivity) /
          100
        : 0;
      this.value[i] += (target - this.value[i]) * a;
    }
    if (!c.body || c.bodySensitivity === 0) this.value.fill(0);
    return this.value;
  }
}

import { zero, clamp } from "./CoordinateMapper.js";
import { SPACE_SIZE } from "./WindConfig.js";
export class HandWind {
  constructor(side) {
    this.side = side;
    this.position = null;
    this.previous = null;
    this.velocity = zero();
    this.target = zero();
    this.age = Infinity;
  }
  input(position, dt) {
    if (position?.length === 3 && position.every(Number.isFinite)) {
      this.position = position.map((v) =>
        clamp(v, -SPACE_SIZE / 2, SPACE_SIZE / 2),
      );
      this.target = this.position.map((v, i) =>
        dt > 0 && dt <= 0.25 && this.previous
          ? clamp((v - this.previous[i]) / dt, -20, 20)
          : 0,
      );
      this.previous = [...this.position];
      this.age = 0;
    } else {
      this.previous = null;
      this.target = zero();
      this.age = Infinity;
    }
  }
  update(dt, c) {
    this.age += dt;
    const active = c[this.side] && this.age <= 0.25;
    const a = 1 - Math.exp(-dt / 0.12);
    this.velocity = this.velocity.map(
      (v, i) => v + ((active ? this.target[i] : 0) - v) * a,
    );
    if (!c[this.side] || c[this.side + "Sensitivity"] === 0)
      this.velocity.fill(0);
  }
  at(x, y, z, c, out = zero()) {
    out.fill(0);
    if (!this.position || !c[this.side]) return out;
    const radius = (SPACE_SIZE * c.handRadius) / 100;
    const r2 =
      (x - this.position[0]) ** 2 +
      (y - this.position[1]) ** 2 +
      (z - this.position[2]) ** 2;
    if (r2 > radius * radius) return out;
    const weight =
      (Math.exp(-r2 / (2 * (radius / 2) ** 2)) * c[this.side + "Sensitivity"]) /
      100;
    for (let i = 0; i < 3; i++) out[i] = this.velocity[i] * weight;
    return out;
  }
}

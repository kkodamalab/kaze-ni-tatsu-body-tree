import * as THREE from "../../vendor/three/three.module.js";
import { SPACE_SIZE } from "./WindConfig.js";
export class ParticleField {
  constructor(scene, engine) {
    this.scene = scene;
    this.engine = engine;
    this.rebuild();
  }
  rebuild() {
    this.dispose();
    const e = this.engine,
      c = e.config;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(e.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.material = new THREE.PointsMaterial({
      color: 0xc8f1ff,
      size: c.dotSize,
      sizeAttenuation: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    // At most 100k line segments (~2.4MB geometry); history sampled independently of FPS.
    this.samples = Math.min(51, Math.max(2, Math.floor(100000 / e.count) + 1));
    this.history = Array.from(
      { length: this.samples },
      () => new Float32Array(e.positions.length),
    );
    this.times = new Float64Array(this.samples).fill(-Infinity);
    this.cursor = 0;
    this.lastSample = -Infinity;
    this.trailArray = new Float32Array((this.samples - 1) * e.count * 6);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.trailArray, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.trailGeometry.setDrawRange(0, 0);
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: 0x80cfff,
      transparent: true,
      opacity: c.trailOpacity / 100,
      depthWrite: false,
    });
    this.trails = new THREE.LineSegments(
      this.trailGeometry,
      this.trailMaterial,
    );
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);
    this.capture();
  }
  capture() {
    const e = this.engine;
    this.history[this.cursor].set(e.positions);
    this.times[this.cursor] = e.time;
    this.cursor = (this.cursor + 1) % this.samples;
    this.lastSample = e.time;
    this.drawHistory();
  }
  drawHistory() {
    const c = this.engine.config,
      now = this.engine.time;
    let out = 0;
    for (let offset = 1; offset < this.samples; offset++) {
      const a = (this.cursor - offset + this.samples) % this.samples,
        b = (a - 1 + this.samples) % this.samples;
      if (
        !Number.isFinite(this.times[b]) ||
        now - this.times[b] > c.trailDuration
      )
        continue;
      const p = this.history[a],
        q = this.history[b];
      for (let j = 0; j < p.length; j += 3) {
        if (
          Math.abs(p[j] - q[j]) > SPACE_SIZE / 2 ||
          Math.abs(p[j + 1] - q[j + 1]) > SPACE_SIZE / 2 ||
          Math.abs(p[j + 2] - q[j + 2]) > SPACE_SIZE / 2
        )
          continue;
        for (let k = 0; k < 3; k++) this.trailArray[out++] = q[j + k];
        for (let k = 0; k < 3; k++) this.trailArray[out++] = p[j + k];
      }
    }
    this.trailGeometry.setDrawRange(0, out / 3);
    this.trailGeometry.attributes.position.needsUpdate = true;
  }
  update() {
    const c = this.engine.config;
    this.points.visible = c.particles;
    this.material.size = c.dotSize;
    this.geometry.attributes.position.needsUpdate = true;
    this.trails.visible = c.trail && c.trailDuration > 0;
    this.trailMaterial.opacity = c.trailOpacity / 100;
    const interval = Math.max(0.1, c.trailDuration / (this.samples - 1));
    if (this.engine.time - this.lastSample >= interval) this.capture();
  }
  dispose() {
    for (const object of [this.points, this.trails]) {
      if (object) {
        this.scene.remove(object);
        object.geometry.dispose();
        object.material.dispose();
      }
    }
    this.points = this.trails = null;
    this.history = this.trailArray = null;
    this.geometry =
      this.trailGeometry =
      this.material =
      this.trailMaterial =
        null;
  }
}

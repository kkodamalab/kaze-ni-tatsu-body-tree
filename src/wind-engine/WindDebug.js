import * as THREE from "../../vendor/three/three.module.js";
import { SPACE_SIZE } from "./WindConfig.js";
export class WindDebug {
  constructor(scene) {
    this.scene = scene;
    this.axes = new THREE.AxesHelper(12);
    scene.add(this.axes);
    this.spheres = [0x56e2be, 0xffa56b].map((color) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      scene.add(mesh);
      return mesh;
    });
    this.weatherArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -11, 0),
      3,
      0x88cfff,
    );
    scene.add(this.weatherArrow);
  }
  update(engine) {
    const c = engine.config;
    this.axes.visible = c.axes;
    [engine.left, engine.right].forEach((h, i) => {
      const s = this.spheres[i];
      s.visible =
        c.handDebug && c[h.side] && h.position !== null && h.age < 0.3;
      if (h.position) s.position.set(...h.position);
      s.scale.setScalar((SPACE_SIZE * c.handRadius) / 100);
    });
    const v = engine.components?.weather || [0, 0, 0];
    this.weatherArrow.visible = c.axes && Math.hypot(...v) > 0.01;
    if (this.weatherArrow.visible) {
      this.weatherArrow.setDirection(new THREE.Vector3(...v).normalize());
      this.weatherArrow.setLength(Math.min(8, Math.hypot(...v)));
    }
  }
  text(engine, metrics = {}) {
    const f = (v) => v.map((x) => x.toFixed(2)).join(", ");
    const components = engine.components || {
      weather: [0, 0, 0],
      body: [0, 0, 0],
      left: [0, 0, 0],
      right: [0, 0, 0],
    };
    const position = (h) => (h.position ? f(h.position) : "—");
    const local = (h) =>
      h.position ? f(h.at(...h.position, engine.config)) : "0, 0, 0";
    return `${engine.count} particles | +X EAST / +Y UP / -Z NORTH\nPOSE ${engine.body.age <= 0.25 ? "DETECTED" : "LOST"} | LANDMARKS ${metrics.landmarkCount || 0}/33\nINFERENCE FPS ${(metrics.poseFps || 0).toFixed(1)} | RENDER FPS ${(metrics.renderFps || 0).toFixed(1)}\nBODY AXIS XYZ (${f(engine.body.raw || [0, 0, 0])})\nWEATHER (${f(components.weather)})\nBODY (${f(components.body)}) ${engine.body.age <= 0.25 ? "DETECTED" : "LOST"}\nLEFT position (${position(engine.left)}) | velocity (${f(components.left)})\nLEFT field at hand (${local(engine.left)}) ${engine.left.age <= 0.25 ? "DETECTED" : "LOST"}\nRIGHT position (${position(engine.right)}) | velocity (${f(components.right)})\nRIGHT field at hand (${local(engine.right)}) ${engine.right.age <= 0.25 ? "DETECTED" : "LOST"}\nMAX SPEED ${engine.maxSpeed} units/s | WRAP`;
  }
  dispose() {
    for (const obj of [this.axes, ...this.spheres, this.weatherArrow]) {
      this.scene.remove(obj);
      obj.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material))
          child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      });
    }
  }
}

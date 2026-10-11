import * as THREE from "../../vendor/three/three.module.js";
import { SPACE_SIZE } from "../wind-engine/WindConfig.js";
import { POSE_CONNECTIONS } from "./PoseConnections.js";
export class SkeletonAvatar {
  constructor(scene) {
    this.scene = scene;
    this.disposed = false;
    this.source = "NONE";
    this.lastInput = null;
    this.valid = new Uint8Array(33);
    this.current = new Float32Array(99);
    this.target = new Float32Array(99);
    this.rendered = new Float32Array(99);
    this.jointBuffer = new Float32Array(99);
    this.lineBuffer = new Float32Array(POSE_CONNECTIONS.length * 6);
    this.colors = new Float32Array(99);
    this.group = new THREE.Group();
    this.group.name = "3D Pose Avatar";
    this.group.visible = false;
    scene.add(this.group);
    this.jointGeometry = new THREE.BufferGeometry();
    this.jointGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.jointBuffer, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.jointGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.jointGeometry.setDrawRange(0, 0);
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.lineBuffer, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.lineGeometry.setDrawRange(0, 0);
    this.jointMaterial = new THREE.PointsMaterial({
      color: 0xf4ffff,
      vertexColors: true,
      size: 7,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x57eaff,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.joints = new THREE.Points(this.jointGeometry, this.jointMaterial);
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.joints.frustumCulled = this.lines.frustumCulled = false;
    this.joints.renderOrder = 31;
    this.lines.renderOrder = 30;
    this.group.add(this.lines, this.joints);
  }
  input(frame, now) {
    if (this.disposed || !frame || !Number.isFinite(now)) return;
    const reset = this.lastInput === null || now - this.lastInput > 750;
    this.valid.fill(0);
    frame.points.slice(0, 33).forEach((p, i) => {
      if (p?.length === 3 && p.every(Number.isFinite)) {
        this.valid[i] = 1;
        this.target.set(p, i * 3);
        if (reset) this.current.set(p, i * 3);
      }
    });
    this.lastInput = now;
    this.source = frame.source;
  }
  resetTracking() {
    this.lastInput = null;
    this.valid.fill(0);
    this.group.visible = false;
    this.source = "NONE";
    this.validCount = 0;
    this.heldCount = 0;
    this.opacity = 0;
    this.state = "LOST";
  }
  update(now, dt, config) {
    if (this.disposed) return;
    this.config = config;
    const age =
      this.lastInput === null ? Infinity : Math.max(0, now - this.lastInput);
    this.opacity = Math.max(0, Math.min(1, 1 - (age - 250) / 500));
    this.state = age <= 250 ? "DETECTED" : age < 750 ? "HOLD / FADE" : "LOST";
    this.group.visible = config.avatar && this.opacity > 0;
    this.lines.visible = config.avatarStyle === "SKELETON";
    this.jointMaterial.opacity = this.lineMaterial.opacity = this.opacity;
    const alpha = 1 - Math.exp(-Math.min(Math.max(dt, 0), 0.1) / 0.045);
    for (let i = 0; i < 33; i++)
      if (this.valid[i])
        for (let k = 0; k < 3; k++) {
          const j = i * 3 + k;
          this.current[j] += (this.target[j] - this.current[j]) * alpha;
        }
    let extent = 0.001;
    for (let i = 0; i < 33; i++)
      if (this.valid[i])
        for (let k = 0; k < 3; k++)
          extent = Math.max(extent, Math.abs(this.current[i * 3 + k]));
    // Large synthetic gestures also stay inside the cube, using one uniform visual fit.
    this.displayScale = Math.min(
      config.avatarSize / 100,
      (SPACE_SIZE * 0.49) / extent,
    );
    let count = 0;
    for (let i = 0; i < 33; i++)
      if (this.valid[i]) {
        for (let k = 0; k < 3; k++) {
          const v = this.current[i * 3 + k] * this.displayScale;
          this.rendered[i * 3 + k] = v;
          this.jointBuffer[count * 3 + k] = v;
        }
        this.colors.set(
          i === 15 ? [0.2, 1, 0.65] : i === 16 ? [1, 0.6, 0.25] : [1, 1, 1],
          count * 3,
        );
        count++;
      }
    let lines = 0;
    for (const [a, b] of POSE_CONNECTIONS)
      if (this.valid[a] && this.valid[b]) {
        for (const i of [a, b])
          for (let k = 0; k < 3; k++)
            this.lineBuffer[lines++] = this.rendered[i * 3 + k];
      }
    this.validCount = age <= 250 ? count : 0;
    this.heldCount = count;
    this.jointGeometry.setDrawRange(0, count);
    this.lineGeometry.setDrawRange(0, lines / 3);
    this.jointGeometry.attributes.position.needsUpdate = true;
    this.jointGeometry.attributes.color.needsUpdate = true;
    this.lineGeometry.attributes.position.needsUpdate = true;
  }
  wrist(side) {
    const i = side === "left" ? 15 : 16;
    return this.valid[i]
      ? Array.from(this.rendered.slice(i * 3, i * 3 + 3))
      : null;
  }
  text() {
    const f = (v) => (v ? v.map((n) => n.toFixed(2)).join(", ") : "—");
    return `3D AVATAR ${this.config?.avatar ? "ON" : "OFF"} | ${this.config?.avatarSize || 100}% / ${this.config?.avatarStyle || "SKELETON"}\nAVATAR INPUT ${this.source} | ${this.state || "LOST"} | VALID ${this.validCount || 0}/33 | HELD ${this.heldCount || 0}/33\nAVATAR display scale ${(this.displayScale || 1).toFixed(2)} (visual only)\nAVATAR LEFT wrist (${f(this.wrist("left"))})\nAVATAR RIGHT wrist (${f(this.wrist("right"))})\nPOSE avatar: hip origin / normalized; wind hands: camera origin. PC TEST at 100%: same wrist positions before fitting.`;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    for (const object of [this.joints, this.lines]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.group.clear();
    this.resetTracking();
  }
}

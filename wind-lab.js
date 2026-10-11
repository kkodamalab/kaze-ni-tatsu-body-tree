import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { WindConfig, RANGES } from "./src/wind-engine/WindConfig.js";
import { WindEngine } from "./src/wind-engine/WindEngine.js";
import { WeatherWind } from "./src/wind-engine/WeatherWind.js";
import { CoordinateMapper } from "./src/wind-engine/CoordinateMapper.js";
import { ParticleField } from "./src/wind-engine/ParticleField.js";
import { WindDebug } from "./src/wind-engine/WindDebug.js";
const groups = {
  PARTICLES: [
    ["gridX", "GRID X"],
    ["gridY", "GRID Y"],
    ["gridZ", "GRID Z"],
    ["dotSize", "DOT SIZE"],
    ["speed", "SPEED %"],
    ["particles", "PARTICLES ON"],
    ["trail", "TRAIL ON"],
    ["trailDuration", "TRAIL DURATION 秒"],
    ["trailOpacity", "TRAIL OPACITY %"],
    ["axes", "XYZ AXIS"],
  ],
  WEATHER: [
    ["weather", "WEATHER WIND ON"],
    ["direction", "WIND DIRECTION ° (FROM)"],
    ["windSpeed", "WIND SPEED m/s"],
    ["weatherGain", "WEATHER GAIN %"],
  ],
  BODY: [
    ["body", "BODY WIND ON"],
    ["bodySensitivity", "BODY SENSITIVITY %"],
    ["bodySmoothing", "BODY SMOOTHING %"],
  ],
  HANDS: [
    ["left", "LEFT HAND ON"],
    ["right", "RIGHT HAND ON"],
    ["leftSensitivity", "LEFT SENSITIVITY %"],
    ["rightSensitivity", "RIGHT SENSITIVITY %"],
    ["handRadius", "HAND RADIUS %"],
    ["handDebug", "HAND FIELD DEBUG"],
  ],
};
export class WindLab {
  constructor({ root, video, camera, onExit }) {
    this.root = root;
    this.video = video;
    this.camera = camera;
    this.onExit = onExit;
    let storage;
    try {
      storage = localStorage;
    } catch {}
    this.store = new WindConfig(storage);
    this.disposed = false;
    this.cameraOn = false;
    this.cameraPending = false;
    this.pc = true;
    this.skeleton = false;
    this.auto = false;
    this.last = 0;
    this.lastPose = 0;
    this.lastVideo = -1;
    this.lastDetection = 0;
    this.mapper = new CoordinateMapper();
    this.mount();
    this.weather = new WeatherWind({ onChange: () => this.weatherStatus() });
    this.engine = new WindEngine(this.store.values, this.weather);
    this.weather.simulated(
      this.engine.config.direction,
      this.engine.config.windSpeed,
    );
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.setClearColor(0x07111c);
      this.stage.prepend(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.view = new THREE.PerspectiveCamera(50, 1, 0.1, 180);
      this.controls = new OrbitControls(this.view, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 90;
      this.resetView();
      this.field = new ParticleField(this.scene, this.engine);
      this.debug = new WindDebug(this.scene, this.engine);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.stage);
      this.resize();
      this.visibility = () => {
        this.last = 0;
        this.lastDetection = 0;
        this.engine.suspend();
        if (document.hidden) {
          cancelAnimationFrame(this.raf);
          this.raf = null;
        } else if (!this.disposed && !this.raf)
          this.raf = requestAnimationFrame((t) => this.frame(t));
      };
      document.addEventListener("visibilitychange", this.visibility);
      this.raf = requestAnimationFrame((t) => this.frame(t));
    } catch (e) {
      this.message(
        "3D描画を開始できません。WebGL2を利用できるブラウザーをお使いください。",
      );
      this.renderer?.dispose();
      this.renderer?.forceContextLoss();
    }
  }
  mount() {
    const c = this.store.values;
    const settings = Object.entries(groups)
      .map(
        ([name, fields]) =>
          `<fieldset><legend>${name}</legend>${name === "WEATHER" ? `<p>位置情報をOpen-Meteoへ送信して、周辺の大まかな風を表示します。正確な位置は保存しません。</p><button id="labGps">現在地の風を取得 / GPS WEATHER</button><p>MANUAL LOCATION：デモ地点は南大沢周辺（現在地ではありません）。座標は保存しません。</p><label>緯度 <input id="labLatitude" type="number" min="-90" max="90" step="any" value="35.61"></label><label>経度 <input id="labLongitude" type="number" min="-180" max="180" step="any" value="139.38"></label><button id="labManual">手動地点の風を取得</button><button id="labSimulated">SIMULATED WIND</button><p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo</a>（予測値）</p>` : ""}${fields.map(([key, label]) => (typeof c[key] === "boolean" ? `<label><input id="lab-${key}" data-key="${key}" type="checkbox" ${c[key] ? "checked" : ""}> ${label}</label>` : `<label for="lab-${key}">${label}<output id="lab-value-${key}">${c[key]}</output><input id="lab-${key}" data-key="${key}" type="range" min="${RANGES[key][0]}" max="${RANGES[key][1]}" step="${RANGES[key][2]}" value="${c[key]}"></label>`)).join("")}${name === "PARTICLES" ? '<button id="labResetParticles">PARTICLE RESET</button><button id="labResetView">CAMERA VIEW RESET</button>' : ""}${name === "BODY" ? '<button id="labCalibrate">CALIBRATE</button><p>現在の姿勢をニュートラルにします。奥行きは単眼推定の目安です。</p>' : ""}</fieldset>`,
      )
      .join("");
    this.root.innerHTML = `<header class="lab-header"><h1>3D WIND LAB</h1><div class="lab-weather"><p id="labWeatherStatus" class="lab-status" role="status"></p><small id="labWeatherDetails"></small></div><div><button id="labCamera" aria-pressed="false">CAMERA OFF</button><button id="labSkeleton" aria-pressed="false">SKELETON OFF</button><button id="labPc" aria-pressed="true">PC TEST ON</button><button id="labExit">ゲームに戻る</button></div></header><div id="labMessage" class="lab-toast" role="status"></div><div class="lab-layout"><div class="lab-stage"><div class="lab-preview hidden"><canvas id="labSkeletonCanvas"></canvas></div><div class="lab-caption">ドラッグ / タッチで回転・ピンチでズーム<br>+X 東（右） / +Y 上 / -Z 北（奥）<br>緑 = 左手 / 橙 = 右手</div></div><aside class="lab-settings">${settings}<fieldset id="labPcPanel"><legend>PC TEST</legend><button id="labAuto" aria-pressed="false">AUTO MOTION OFF</button>${["body", "left", "right"].map((part) => ["X", "Y", "Z"].map((axis, i) => `<label>${part.toUpperCase()} ${axis}<output id="lab-value-test-${part}${axis}">${part === "left" && i === 0 ? -4 : part === "right" && i === 0 ? 4 : 0}</output><input id="lab-test-${part}${axis}" type="range" min="${part === "body" ? -1 : -10}" max="${part === "body" ? 1 : 10}" step=".01" value="${part === "left" && i === 0 ? -4 : part === "right" && i === 0 ? 4 : 0}"></label>`).join("")).join("")}</fieldset><fieldset><legend>DEBUG</legend>${["WEATHER ONLY", "BODY ONLY", "LEFT HAND ONLY", "RIGHT HAND ONLY", "ALL ON", "ALL OFF"].map((s, i) => `<button data-preset="${i}">${s}</button>`).join("")}<pre id="labDebug"></pre><button id="labResetSettings">RESET SETTINGS</button></fieldset></aside></div>`;
    this.$ = (s) => this.root.querySelector(s);
    this.stage = this.$(".lab-stage");
    this.preview = this.$(".lab-preview");
    this.preview.prepend(this.video);
    this.root.querySelectorAll("[data-key]").forEach((input) =>
      input.addEventListener("input", () => {
        const key = input.dataset.key;
        const value =
          input.type === "checkbox" ? input.checked : Number(input.value);
        this.apply({ ...this.store.values, [key]: value });
        if (["direction", "windSpeed"].includes(key))
          this.weather.simulated(
            this.engine.config.direction,
            this.engine.config.windSpeed,
          );
      }),
    );
    this.root.querySelectorAll('[id^="lab-test-"]').forEach((input) =>
      input.addEventListener("input", () => {
        this.$("#lab-value-test-" + input.id.slice(9)).value = input.value;
      }),
    );
    this.$("#labGps").onclick = () => this.weather.gps();
    this.$("#labManual").onclick = () => {
      const lat = this.$("#labLatitude").value.trim(),
        lon = this.$("#labLongitude").value.trim();
      if (!lat || !lon) {
        this.message("緯度と経度を入力してください");
        return;
      }
      this.weather.manual(Number(lat), Number(lon));
    };
    this.$("#labSimulated").onclick = () =>
      this.weather.simulated(
        this.engine.config.direction,
        this.engine.config.windSpeed,
      );
    this.$("#labResetParticles").onclick = () => {
      this.engine.reset();
      this.field?.rebuild();
    };
    this.$("#labResetView").onclick = () => this.resetView();
    this.$("#labCalibrate").onclick = () =>
      this.message(
        this.engine.body.calibrate()
          ? "現在の姿勢をニュートラルとして記録しました"
          : "PC TESTまたは身体検出後にキャリブレーションしてください",
      );
    this.$("#labResetSettings").onclick = () => {
      this.store.reset();
      this.apply(this.store.values);
      this.weather.simulated(
        this.engine.config.direction,
        this.engine.config.windSpeed,
      );
    };
    this.$("#labExit").onclick = () => this.onExit();
    this.$("#labCamera").onclick = () => this.toggleCamera();
    this.$("#labSkeleton").onclick = () => {
      this.skeleton = !this.skeleton;
      this.toggleButton("labSkeleton", "SKELETON", this.skeleton);
    };
    this.$("#labPc").onclick = () => {
      this.pc = !this.pc;
      if (this.pc) {
        this.cameraOn = false;
        this.camera.stop();
        this.preview.classList.add("hidden");
        this.toggleButton("labCamera", "CAMERA", false);
      }
      this.engine.suspend();
      this.toggleButton("labPc", "PC TEST", this.pc);
      this.$("#labPcPanel").hidden = !this.pc;
    };
    this.$("#labAuto").onclick = () => {
      this.auto = !this.auto;
      this.toggleButton("labAuto", "AUTO MOTION", this.auto);
    };
    this.root.querySelectorAll("[data-preset]").forEach(
      (button) =>
        (button.onclick = () => {
          const i = Number(button.dataset.preset),
            c = { ...this.store.values };
          ["weather", "body", "left", "right"].forEach(
            (k, j) => (c[k] = i === 4 || i === j),
          );
          this.apply(c);
        }),
    );
  }
  apply(config) {
    const previous = this.engine.positions;
    this.store.replace(config);
    this.engine.configure(this.store.values);
    if (previous !== this.engine.positions) this.field?.rebuild();
    else this.field?.drawHistory();
    for (const [key, value] of Object.entries(this.store.values)) {
      const input = this.$("#lab-" + key);
      if (input) {
        if (input.type === "checkbox") input.checked = value;
        else {
          input.value = value;
          this.$("#lab-value-" + key).value = value;
        }
      }
    }
  }
  toggleButton(id, label, on) {
    const b = this.$("#" + id);
    b.textContent = label + " " + (on ? "ON" : "OFF");
    b.setAttribute("aria-pressed", String(on));
  }
  message(text) {
    this.$("#labMessage").textContent = text;
  }
  weatherStatus() {
    if (!this.weather) return;
    const w = this.weather,
      d = w.data;
    this.$("#labWeatherStatus").textContent =
      `${w.mode} | ${d ? `${d.direction.toFixed(0)}° FROM / ${d.speed.toFixed(1)} m/s` : "風データなし"} | ${w.status}`;
    this.$("#labWeatherDetails").textContent = d?.time
      ? `気象対象時刻 ${d.time} (${d.timezone}) / 取得 ${d.receivedAt} / 位置取得 ${w.location?.acquiredAt} / 緯度 ${w.location?.latitude.toFixed(3)} 経度 ${w.location?.longitude.toFixed(3)}`
      : "現在地は未取得。手動地点の初期値は南大沢周辺です。";
  }
  async toggleCamera() {
    if (this.cameraPending) return;
    if (this.cameraOn) {
      this.cameraOn = false;
      this.camera.stop();
      this.engine.suspend();
      this.preview.classList.add("hidden");
      this.toggleButton("labCamera", "CAMERA", false);
      return;
    }
    this.cameraPending = true;
    this.$("#labCamera").disabled = true;
    this.$("#labPc").disabled = true;
    this.message("カメラを準備しています…");
    try {
      await this.camera.start();
      if (this.disposed) {
        this.camera.stop();
        this.camera.release?.();
        return;
      }
      this.cameraOn = true;
      this.pc = false;
      this.lastVideo = -1;
      this.lastDetection = 0;
      this.engine.suspend();
      this.toggleButton("labCamera", "CAMERA", true);
      this.toggleButton("labPc", "PC TEST", false);
      this.$("#labPcPanel").hidden = true;
      this.preview.classList.remove("hidden");
      this.message("カメラ入力中。画像・ランドマークは外部送信しません。");
    } catch (e) {
      this.camera.stop();
      if (!this.disposed)
        this.message(
          "カメラを開始できません。許可・接続を確認するかPC TESTを利用してください。",
        );
    } finally {
      this.cameraPending = false;
      if (!this.disposed) {
        this.$("#labCamera").disabled = false;
        this.$("#labPc").disabled = false;
      }
    }
  }
  testSample(t) {
    const get = (part) =>
      ["X", "Y", "Z"].map((a) => Number(this.$("#lab-test-" + part + a).value));
    const body = get("body"),
      left = get("left"),
      right = get("right");
    if (this.auto) {
      left[0] = -4 + Math.sin(t / 700) * 3;
      left[1] = Math.cos(t / 850) * 3;
      right[0] = 4 + Math.sin(t / 800) * 3;
      right[1] = Math.cos(t / 700) * 3;
    }
    return { body, left, right };
  }
  skeletonDraw(lm) {
    const canvas = this.$("#labSkeletonCanvas");
    canvas.width = 360;
    canvas.height = 270;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 360, 270);
    if (!this.skeleton || !lm) return;
    ctx.strokeStyle = "#88ffe2";
    ctx.lineWidth = 3;
    for (const [a, b] of [
      [11, 12],
      [11, 23],
      [12, 24],
      [23, 24],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
      [23, 25],
      [25, 27],
      [24, 26],
      [26, 28],
    ]) {
      const p = lm[a],
        q = lm[b];
      if (!p || !q || (p.visibility ?? 1) < 0.45 || (q.visibility ?? 1) < 0.45)
        continue;
      ctx.beginPath();
      ctx.moveTo((1 - p.x) * 360, p.y * 270);
      ctx.lineTo((1 - q.x) * 360, q.y * 270);
      ctx.stroke();
    }
  }
  frame(t) {
    this.raf = null;
    if (this.disposed || document.hidden) return;
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 0;
    this.last = t;
    if (this.pc) this.engine.input(this.testSample(t), t);
    else if (this.cameraOn && t - this.lastPose >= 33) {
      this.lastPose = t;
      try {
        if (
          this.video.readyState >= 2 &&
          this.video.currentTime !== this.lastVideo
        ) {
          this.lastVideo = this.video.currentTime;
          const result = this.camera.detect(t);
          const lm = result?.landmarks?.[0];
          this.engine.input(
            this.mapper.fromPose(lm, result?.worldLandmarks?.[0]),
            t,
          );
          this.lastDetection = lm ? t : 0;
          this.skeletonDraw(lm);
        }
      } catch (e) {
        this.engine.input(null, t);
        this.skeletonDraw(null);
        this.message("身体推論が停止しました。描画は継続しています。");
      }
      if (t - this.lastDetection > 250) {
        this.engine.input(null, t);
        this.skeletonDraw(null);
      }
    }
    this.engine.step(dt);
    this.field.update();
    this.debug.update(this.engine);
    this.controls.update();
    this.renderer.render(this.scene, this.view);
    if (t - (this.lastDebug || 0) > 200) {
      this.$("#labDebug").textContent = this.debug.text(this.engine);
      this.lastDebug = t;
    }
    if (dt > 0.045) this.slowFrames = (this.slowFrames || 0) + 1;
    else this.slowFrames = Math.max(0, (this.slowFrames || 0) - 1);
    if (this.slowFrames > 30 && this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
      this.message("描画負荷に合わせて画素密度を調整しました");
      this.slowFrames = 0;
    }
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }
  resize() {
    if (!this.renderer) return;
    const width = this.stage.clientWidth,
      height = this.stage.clientHeight;
    if (!width || !height) return;
    this.view.aspect = width / height;
    this.view.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  resetView() {
    if (!this.view) return;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update(); // Consume gesture inertia before restoring the view.
    this.view.position.set(25, 18, 32);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.camera.stop();
    this.cameraOn = false;
    this.camera.release?.();
    this.controls?.dispose();
    this.field?.dispose();
    this.debug?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.scene?.clear();
    this.engine?.dispose();
    this.root.replaceChildren();
  }
}

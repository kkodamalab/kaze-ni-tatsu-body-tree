export const SPACE_SIZE = 20;
export const DEFAULTS = Object.freeze({
  gridX: 10,
  gridY: 10,
  gridZ: 10,
  dotSize: 3,
  speed: 100,
  particles: true,
  trail: true,
  trailDuration: 1,
  trailOpacity: 50,
  axes: true,
  weather: true,
  weatherGain: 100,
  direction: 0,
  windSpeed: 3,
  body: true,
  bodySensitivity: 100,
  bodySmoothing: 30,
  left: true,
  right: true,
  leftSensitivity: 100,
  rightSensitivity: 100,
  handRadius: 20,
  handDebug: false,
});
export const RANGES = Object.freeze({
  gridX: [3, 20, 1],
  gridY: [3, 20, 1],
  gridZ: [3, 20, 1],
  dotSize: [1, 10, 1],
  speed: [0, 300, 1],
  trailDuration: [0, 5, 0.1],
  trailOpacity: [0, 100, 1],
  weatherGain: [0, 300, 1],
  direction: [0, 359, 1],
  windSpeed: [0, 20, 0.1],
  bodySensitivity: [0, 300, 1],
  bodySmoothing: [0, 100, 1],
  leftSensitivity: [0, 300, 1],
  rightSensitivity: [0, 300, 1],
  handRadius: [5, 50, 1],
});
export const STORAGE_KEY = "wind-tree-lab-v1";
export function sanitizeConfig(source = {}) {
  const c = { ...DEFAULTS };
  for (const key of Object.keys(c)) {
    const v = source?.[key];
    if (typeof c[key] === "boolean") {
      if (typeof v === "boolean") c[key] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      const [lo, hi, step] = RANGES[key];
      c[key] = Math.max(lo, Math.min(hi, v));
      if (step === 1) c[key] = Math.round(c[key]);
    }
  }
  return c;
}
export class WindConfig {
  constructor(storage) {
    this.storage = storage;
    try {
      this.values = sanitizeConfig(
        JSON.parse(storage?.getItem(STORAGE_KEY) || "{}"),
      );
    } catch {
      this.values = { ...DEFAULTS };
    }
  }
  set(key, value) {
    return this.replace({ ...this.values, [key]: value });
  }
  replace(config) {
    this.values = sanitizeConfig(config);
    this.save();
    return this.values;
  }
  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* Private browsing can reject storage. */
    }
  }
  reset() {
    this.values = { ...DEFAULTS };
    this.save();
    return this.values;
  }
}

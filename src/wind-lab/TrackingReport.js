export const tiltDegrees = (axis) =>
  (axis || [0, 0, 0]).map((v) => (Math.atan(v) * 180) / Math.PI);
export function trackingSnapshot(
  engine,
  metrics = {},
  avatar,
  now = new Date().toISOString(),
) {
  const body = tiltDegrees(engine.body.raw),
    neutral = tiltDegrees(engine.body.neutral),
    row = {
      timestamp: now,
      pose_detected: !!engine.body.raw && engine.body.age <= 0.25,
      input_source: avatar?.source || "NONE",
      valid_landmarks: avatar?.validCount || 0,
      calibrated: engine.body.calibrated,
      body_rejected_jumps: engine.body.rejected || 0,
      render_fps: metrics.renderFps || 0,
      inference_fps: metrics.poseFps || 0,
    };
  const add = (prefix, v) =>
    ["x", "y", "z"].forEach(
      (axis, i) =>
        (row[prefix + "_" + axis] = Number((v?.[i] || 0).toFixed(5))),
    );
  add("body_tilt", body);
  add("body_neutral", neutral);
  add(
    "body_delta",
    body.map((v, i) => v - neutral[i]),
  );
  add("body_wind", engine.body.value);
  add("weather_wind", engine.components?.weather);
  for (const side of ["left", "right"]) {
    const h = engine[side];
    add(side + "_hand", h.position);
    add(side + "_hand_v", h.velocity); // Exact requested vx/vy/vz aliases.
    for (const [i, axis] of ["x", "y", "z"].entries())
      row[side + "_hand_v" + axis] = row[side + "_hand_v_" + axis];
    add(
      side + "_hand_wind",
      h.position ? h.at(...h.position, engine.config) : null,
    );
    add(side + "_avatar_wrist", avatar?.wrist(side));
    row[side + "_rejected_jumps"] = h.rejected || 0;
  }
  return row;
}
export function trackingText(engine, metrics, avatar) {
  const r = trackingSnapshot(engine, metrics, avatar),
    v = (p) => ["x", "y", "z"].map((a) => r[p + "_" + a].toFixed(2)).join(", ");
  return `BODY TRACKING DEBUG\n[TRACKING] POSE ${r.pose_detected ? "DETECTED" : "LOST"} | ${r.input_source}\nLANDMARKS ${r.valid_landmarks}/33 | INFERENCE FPS ${r.inference_fps.toFixed(1)} | RENDER FPS ${r.render_fps.toFixed(1)}\n[BODY] AXIS (${(engine.body.raw || [0, 0, 0]).map((v) => v.toFixed(2)).join(", ")})\nBODY TILT ANGLE ° (${v("body_tilt")}) | DELTA ° (${v("body_delta")})\nBODY WIND (${v("body_wind")}) | CALIBRATION ${r.calibrated ? "CALIBRATED" : "DEFAULT NEUTRAL"}\n[LEFT HAND] POSITION (${v("left_hand")}) | VELOCITY (${v("left_hand_v")})\nWIND (${v("left_hand_wind")}) | AVATAR WRIST (${v("left_avatar_wrist")}) | REJECTED ${r.left_rejected_jumps}\n[RIGHT HAND] POSITION (${v("right_hand")}) | VELOCITY (${v("right_hand_v")})\nWIND (${v("right_hand_wind")}) | AVATAR WRIST (${v("right_avatar_wrist")}) | REJECTED ${r.right_rejected_jumps}\n[3D VISUALIZATION] XYZ AXIS ${engine.config.axes ? "ON" : "OFF"} | 3D AVATAR ${engine.config.avatar ? "ON" : "OFF"} | ${engine.config.avatarSize}% | HAND FIELD DEBUG ${engine.config.handDebug ? "ON" : "OFF"}`;
}
export function downloadTrackingCsv(rows, name = "wind-body-tracking.csv") {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => r[k]).join(",")),
    ].join("\n"),
    url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

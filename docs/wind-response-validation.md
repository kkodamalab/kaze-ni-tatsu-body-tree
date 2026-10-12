# Wind response validation

Baseline: main `8f73c5deeb04f24a2bb49f985862e4ae124ebe17`. Same 1000-particle grid, 2 seconds, 60Hz physics, 30Hz input. Body ramps to 3°; each hand moves at 0.4 world units/s. The before run executes baseline engine sources extracted with `git show`; the after run executes the shared current WindEngine with NORMAL. Values below are whole-field averages from actual velocity/position arrays. Units are visual world units, not m/s or human measurements.

| Isolated input | Mean speed before → after | Mean final displacement before → after | Peak wind before → after |
| --- | --- | --- | --- |
| BODY ONLY | 0.08725 → 0.30555 | 0.13716 → 0.50700 | 0.08727 → 0.30556 |
| LEFT HAND ONLY | 0.00503 → 0.04620 | 0.00777 → 0.07732 | 0.40817 → 1.46398 |
| RIGHT HAND ONLY | 0.00503 → 0.04620 | 0.00777 → 0.07732 | 0.40817 → 1.46398 |

At a 300ms input interval, baseline hand displacement is 0; corrected NORMAL is 0.05616. Previously the 250ms fresh-input rule reset velocity on every accepted sample. Derivatives now use the time since the last accepted hand sample up to 1 second, while the output still decays after 250ms loss. First input and reacquisition after >1 second produce no impulse. The jump rejection and acceleration/speed limits remain.

## Preset values

| Setting | SOFT | NORMAL (new default) | STRONG |
| --- | --- | --- | --- |
| BODY SENSITIVITY % | 100 | 175 | 250 |
| BODY DEAD ZONE ° | 2 | 1 | 0.6 |
| BODY SMOOTHING % | 30 | 18 | 12 |
| LEFT/RIGHT SENSITIVITY % | 100 | 175 | 225 |
| HAND SPEED THRESHOLD (world units/s) | 0.08 | 0.04 | 0.03 |
| HAND SMOOTHING % | 25 | 12 | 10 |
| HAND RADIUS % | 20 | 28 | 30 |
| HAND WIND GAIN % | 100 | 200 | 250 |

Same hand input yields displacement SOFT 0.00788, NORMAL 0.07732, STRONG 0.15821. Same body input yields 0.13716, 0.50700, 0.88774. Hand speed 0.2 vs 0.8 yields peak wind 0.73199 vs 2.92795 and displacement 0.03801 vs 0.15607. Direct local wind outside the radius is exactly zero. All-OFF and sub-threshold jitter remain stationary; stopping hands decays their wind.

See [raw measurements](wind-response-measurements.json) and executable `tests/wind-response.test.mjs`. The browser suite also uses the real PosePipeline / asynchronous Worker transport with synthetic Pose, verifies actual particle velocity/displacement, and compares slower/faster input in DOT/KIDS/ART. Existing camera/Pose model instances are reused.

The DEBUG/CSV report real particle mean speed, mean displacement per animation-frame physics step, wrap-corrected travel over the last simulation second, per-hand field particle count, applied combined wind, body input/output and wrist speed/hand wind. A hand field moving is insufficient: assertions inspect the particle arrays.

Legacy saved individual values are retained as CUSTOM, with the previous implicit hand gain of 100%. Changing presets updates the shared settings without resetting particles or calibration. Colors are centralized in WindColors.js: skeleton #20B8E8, left #E94F91, right #F4B942. Debug spheres are transparent wireframes and are hidden when HAND FIELD DEBUG is OFF.

No real participant, physical camera or physical tablet/phone was used. The environment uses generated camera frames and synthetic Pose; actual-camera tracking quality, natural movement/noise and perceived responsiveness remain to be checked on a person. Body input still requires confident shoulders and hips; missing torso landmarks are reported rather than converted to a fabricated body wind.

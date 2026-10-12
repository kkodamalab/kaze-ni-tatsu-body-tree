import { spawnSync } from "node:child_process";
// GitHub's structured annotations remain readable when signed log downloads are blocked.
const suites = [
  "browser",
  "settings-photos-browser",
  "wind-lab-browser",
  "pose-lab-browser",
  "modes-play-browser",
  "avatar-browser",
  "phase5-browser",
];
for (const suite of suites) {
  const path = `tests/${suite}.mjs`,
    result = spawnSync(process.execPath, [path], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    const message = (
      result.stderr ||
      result.error?.message ||
      `Exit ${result.status}`
    )
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    if (process.env.GITHUB_ACTIONS)
      console.log(`::error title=${path}::${message}`);
    process.exit(result.status || 1);
  }
}
console.log(`PASS: ${suites.length} browser regression suites`);

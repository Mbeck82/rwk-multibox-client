// Build + package the Windows installer without code signing.
const { spawnSync } = require("node:child_process");
const { rmSync } = require("node:fs");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rmSync("out", { recursive: true, force: true });
run("npx", ["electron-vite", "build"]);
run("npx", ["electron-builder", "--win", "--publish", "never"]);

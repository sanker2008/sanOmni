import { spawnSync } from "node:child_process";

const userAgent = process.env.npm_config_user_agent || "";
const pm = userAgent.includes("pnpm") ? "pnpm" :
           userAgent.includes("yarn") ? "yarn" :
           userAgent.includes("bun") ? "bun" : "pnpm";

console.log(`Running build using ${pm}...`);

const result = spawnSync(`${pm} run build`, {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);

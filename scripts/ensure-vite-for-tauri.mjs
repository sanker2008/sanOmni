import net from "node:net";
import { spawn } from "node:child_process";

const port = 1420;
const host = "127.0.0.1";

function canConnect(portToCheck, hostToCheck) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(portToCheck, hostToCheck);
  });
}

const alreadyRunning = await canConnect(port, host);

if (alreadyRunning) {
  console.log(`Vite dev server already available at http://localhost:${port}, reusing it for Tauri.`);
  process.exit(0);
}

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(command, ["run", "dev:raw"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

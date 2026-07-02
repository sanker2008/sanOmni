import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { existsSync, rmSync } from "fs";

function excludeBundledModels() {
  return {
    name: "exclude-bundled-models",
    closeBundle() {
      const modelsDir = path.resolve(__dirname, "dist/models");
      if (existsSync(modelsDir)) {
        rmSync(modelsDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), excludeBundledModels()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("@tauri-apps")) return "vendor-tauri";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("framer-motion")) {
            return "vendor-ui";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});

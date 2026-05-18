import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9001,
    strictPort: true,
    allowedHosts: ["sygtek.com.br"],
    proxy: {
      "/api": "http://localhost:4001",
      "/ws": {
        target: "ws://localhost:4001",
        ws: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-flow": ["@xyflow/react"],
          "vendor-lucide": ["lucide-react"]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});

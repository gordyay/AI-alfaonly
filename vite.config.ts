import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  base: "/static/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:8000",
      "/cockpit": "http://127.0.0.1:8000",
      "/client": "http://127.0.0.1:8000",
      "/assistant": "http://127.0.0.1:8000",
      "/ai": "http://127.0.0.1:8000",
      "/crm-note": "http://127.0.0.1:8000",
      "/feedback": "http://127.0.0.1:8000"
    }
  },
  build: {
    outDir: "../app/static",
    emptyOutDir: true,
    assetsDir: "assets"
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      "/api": { target: "http://127.0.0.1:5000", changeOrigin: true },
      "/output": { target: "http://127.0.0.1:5000", changeOrigin: true },
      "/user_logos": { target: "http://127.0.0.1:5000", changeOrigin: true },
      "/preview_cache": { target: "http://127.0.0.1:5000", changeOrigin: true },
      // Chỉ proxy API admin — KHÔNG proxy /admin/payments, /admin/users (trang React)
      "/admin/api": { target: "http://127.0.0.1:5000", changeOrigin: true },
    },
  },
});

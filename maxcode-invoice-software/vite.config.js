import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteCompression from "vite-plugin-compression";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Pre-compress assets so Netlify serves them directly without on-the-fly
    // compression overhead. Brotli first (smallest), gzip fallback.
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 1024,
      deleteOriginFile: false,
    }),
    viteCompression({
      algorithm: "gzip",
      ext: ".gz",
      threshold: 1024,
      deleteOriginFile: false,
    }),
  ],
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2019",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "export-vendor": ["xlsx", "jspdf", "jspdf-autotable"],
          // Heavy shared components get their own chunks so they load once
          // and are cached across all pages.
          "reusable-table": ["src/Components/ReusableTable.jsx"],
          "dashboard-core": [
            "src/Components/DashboardLayout.tsx",
            "src/Components/DashboardNavbar.tsx",
          ],
        },
      },
    },
  },
  esbuild:
    mode === "production"
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
}));

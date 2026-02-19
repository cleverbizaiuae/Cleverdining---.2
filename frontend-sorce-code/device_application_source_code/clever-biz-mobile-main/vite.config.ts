import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ["**/icon-32.png", "**/icon-512.png"],
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Cleverbiz PWA",
        short_name: "Cleverbiz",
        description: "Cleverbiz food order app",
        theme_color: "#ffffff",
        icons: [
          {
            src: "src/assets/icon-32.png",
            sizes: "32x32",
            type: "image/png",
          },
          {
            src: "src/assets/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5176,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Target modern browsers for smaller bundles
    target: "es2020",
    // Use Lightning CSS for faster, smaller CSS minification
    cssMinify: "lightningcss",
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        manualChunks: {
          "vendor-core": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["react-hot-toast", "lucide-react", "motion"],
          "vendor-utils": ["axios"],
        }
      },
    },
  },
});

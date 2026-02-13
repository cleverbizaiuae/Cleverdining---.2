import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "pwa-icon.svg",
        "icon-192x192.png",
        "icon-512x512.png",
        "icon-152x152.png",
        "icon-144x144.png"
      ],
      manifest: {
        name: "CleverBiz Dashboard",
        short_name: "CleverBiz",
        description: "Restaurant management dashboard by CleverBiz AI",
        theme_color: "#0055FE",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["business", "food"],
        icons: [
          {
            src: "icon-72x72.png",
            sizes: "72x72",
            type: "image/png"
          },
          {
            src: "icon-96x96.png",
            sizes: "96x96",
            type: "image/png"
          },
          {
            src: "icon-128x128.png",
            sizes: "128x128",
            type: "image/png"
          },
          {
            src: "icon-144x144.png",
            sizes: "144x144",
            type: "image/png"
          },
          {
            src: "icon-152x152.png",
            sizes: "152x152",
            type: "image/png"
          },
          {
            src: "icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-384x384.png",
            sizes: "384x384",
            type: "image/png"
          },
          {
            src: "icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Cache app shell only — NOT API data
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

        // Handle SPA navigation (serve index.html for all routes)
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/owners\//, /^\/message\//],

        runtimeCaching: [
          // Google Fonts: cache forever
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
          // Intentionally NO API caching — dashboard data must always be fresh
          // Auth tokens, orders, items, messages = never cached by SW
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Vendor chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-core": ["react", "react-dom", "react-router"],
          "vendor-charts": ["chart.js", "react-chartjs-2"],
          "vendor-ui": ["react-hot-toast", "lucide-react", "framer-motion"],
          "vendor-utils": ["axios", "date-fns"],
        }
      }
    },
    // Target modern browsers for smaller bundles
    target: "es2020",
    // Enable source maps for debugging (optional)
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5175,
  },
});

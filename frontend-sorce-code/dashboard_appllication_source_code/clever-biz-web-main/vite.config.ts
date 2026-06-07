import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const isProd = process.env.NODE_ENV === "production";

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
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Cache only the startup shell up front. Route chunks are cached on demand
        // below, avoiding a multi-MB service-worker install competing with page data.
        globPatterns: [
          "index.html",
          "offline.html",
          "assets/index-*.js",
          "assets/index-*.css",
          "assets/vendor-core-*.js",
          "assets/vendor-ui-*.js",
          "assets/vendor-utils-*.js",
          "assets/vendor-monitoring-*.js",
          "assets/requestCache-*.js",
          "assets/regionConfig-*.js"
        ],

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
          },
          // Menu item images from Render backend — cache for 30 days
          {
            urlPattern: /^https:\/\/cleverdining-2\.onrender\.com\/media\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "menu-images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Google Cloud Storage images (if used for media)
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gcs-images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Local JS/CSS route chunks: cache after first use, not during install.
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "dashboard-static-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Local images/icons: cache after first use without precaching every asset.
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|svg|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "dashboard-image-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
    cssMinify: "lightningcss",
    // Vendor chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-core": ["react", "react-dom", "react-router"],
          "vendor-charts": ["chart.js", "react-chartjs-2"],
          "vendor-ui": ["react-hot-toast", "lucide-react", "framer-motion"],
          "vendor-utils": ["axios", "date-fns"],
          "vendor-monitoring": ["@sentry/react"],
        }
      }
    },
    // Target modern browsers for smaller bundles
    target: "es2020",
    // Enable source maps for debugging (optional)
    sourcemap: false,
  },
  esbuild: isProd
    ? {
        drop: ["console", "debugger"],
      }
    : undefined,
  server: {
    host: true,
    port: 5175,
  },
});

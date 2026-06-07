import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Build version for cache busting
const BUILD_VERSION = Date.now().toString(36);
const isProd = process.env.NODE_ENV === "production";

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  assetsInclude: ["**/icon-32.png", "**/icon-512.png"],
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Use Workbox's generateSW for proper cache strategies
      workbox: {
        // Skip waiting and claim clients immediately
        skipWaiting: true,
        clientsClaim: true,

        // Keep the first install lean. Page chunks and media are runtime-cached
        // after use, so new QR scans are not delayed by downloading every route.
        globPatterns: [
          "index.html",
          "assets/index-*.js",
          "assets/index-*.css",
          "assets/vendor-core-*.js",
          "assets/vendor-ui-*.js",
          "assets/vendor-utils-*.js",
          "assets/vendor-monitoring-*.js",
          "assets/regionConfig-*.js",
          "assets/regionSession-*.js"
        ],

        // NEVER cache index.html aggressively
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],

        // Runtime caching strategies
        runtimeCaching: [
          // NetworkFirst for HTML pages (never serve stale HTML)
          {
            urlPattern: /^https:\/\/.*\.(html?)$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 5,
            },
          },
          // Backend media is stable and expensive on mobile; cache it before API rules.
          {
            urlPattern: /^https:\/\/cleverdining-2\.onrender\.com\/media\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "backend-media-cache",
              expiration: {
                maxEntries: 160,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gcs-media-cache",
              expiration: {
                maxEntries: 160,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // NetworkOnly for API calls (NEVER cache API responses)
          {
            urlPattern: /^https:\/\/cleverdining-2\.onrender\.com\/(?:api|owners|message|token|adminapi|profile)\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\/(?:api|owners|message|token|adminapi|profile)\//i,
            handler: "NetworkOnly",
          },
          // Hashed static assets are immutable; serve cached files immediately.
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // CacheFirst for images (they rarely change)
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // NetworkFirst for Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
      manifest: {
        name: "CleverDining",
        short_name: "CleverDining",
        description: "CleverDining - Smart Restaurant Ordering",
        theme_color: "#3B82F6",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
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
          "vendor-monitoring": ["@sentry/react"],
        }
      },
    },
  },
  esbuild: isProd
    ? {
        drop: ["console", "debugger"],
      }
    : undefined,
});

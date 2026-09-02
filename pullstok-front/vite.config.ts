import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Pullstok ERP",
        short_name: "Pullstok",
        description: "Gestión de stock para pet shops",
        theme_color: "#18181b",
        background_color: "#18181b",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "any",
        start_url: "/scanner",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "Escanear código",
            short_name: "Scanner",
            url: "/scanner",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Productos",
            short_name: "Productos",
            url: "/productos",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Nueva venta",
            short_name: "Venta",
            url: "/sales/new",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/app\.pullstok\.com\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash].[ext]",
        // Split de vendors estables por familia → mejor caching en el navegador
        // (los vendors no cambian de hash salvo upgrade) y descarga en paralelo
        // (HTTP/2). SOLO se agrupan los estables; las libs por-feature pesadas
        // (xlsx/jspdf/recharts/zxing/qrcode) quedan SIN agrupar para que cada
        // vista lazy traiga únicamente lo suyo (móvil no arrastra todo).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react";
          if (id.includes("react-router")) return "router";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("socket.io-client")) return "socket";
          if (id.includes("radix-ui") || id.includes("@radix-ui")) return "radix";
          if (id.includes("lucide-react") || id.includes("react-icons")) return "icons";
          if (id.includes("axios")) return "http";
          return undefined;
        },
      },
    },
  },
});

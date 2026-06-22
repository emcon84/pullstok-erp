import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://pullstok.com",
  vite: {
    plugins: [tailwindcss()],
  },
});

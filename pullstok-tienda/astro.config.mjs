import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";
import react from "@astrojs/react";

// Storefront público multi-tenant: SSR porque cada request resuelve una
// organización distinta por subdominio (Host header) y necesita pegarle a
// la API server-side antes de renderizar (catálogo, branding). No hay nada
// que se pueda pre-renderizar en build time — el contenido depende del
// tenant en runtime.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // @astrojs/react habilita islands React (client:*). Se agregó para el widget
  // de chat del visitante (ChatWidget.tsx), el primer componente interactivo de
  // la tienda — el resto del storefront es HTML estático + <script> puntuales.
  integrations: [react()],
  // allowedHosts: true desactiva la validación de Host header de Vite (anti
  // DNS-rebinding). En local probamos con subdominios falsos (demo.pullstok.com)
  // via curl -H "Host: ...", así que hace falta permitirlos explícitamente en
  // dev. En producción el reverse proxy (nginx) filtra esto antes de Node.
  server: { port: 3006, allowedHosts: true },
  vite: {
    plugins: [tailwindcss()],
  },
});

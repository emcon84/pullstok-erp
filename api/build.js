require('esbuild').build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/bundle.js',
  target: ['node20'], // Puedes ajustar la versión de Node.js
  minify: true, // Opcional: Minificar el código
  // Módulos que NO se pueden bundlear:
  // - sharp: nativo (binarios .node), usa createRequire(import.meta.url)
  // - pg: driver PostgreSQL con código nativo (pg-native) y carga dinámica
  // - @prisma/client: cliente generado con ESM/CJS interop que esbuild no maneja
  // - @prisma/adapter-pg: adapter que usa pg internamente
  external: ['sharp', 'pg', '@prisma/client', '@prisma/adapter-pg'],
}).catch((e) => { console.error(e); process.exit(1); });

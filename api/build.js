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
  // - pdf-parse: pdfjs-dist se buildea para browser y referencia DOMMatrix en el
  //   scope del módulo; bundl-eado crashea el boot en Node (ReferenceError:
  //   DOMMatrix is not defined). External → require() en runtime resuelve la
  //   build legacy de node_modules como hace scripts/load-distributor-pdfs.ts.
  external: ['sharp', 'pg', '@prisma/client', '@prisma/adapter-pg', 'pdf-parse'],
}).catch((e) => { console.error(e); process.exit(1); });

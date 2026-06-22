require('esbuild').build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/bundle.js',
  target: ['node20'], // Puedes ajustar la versión de Node.js
  minify: true, // Opcional: Minificar el código
  // sharp es un módulo nativo (binarios .node) y usa createRequire(import.meta.url):
  // no se puede bundlear, se carga desde node_modules en runtime.
  external: ['sharp'],
}).catch((e) => { console.error(e); process.exit(1); });

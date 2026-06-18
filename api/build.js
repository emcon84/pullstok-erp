require('esbuild').build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/bundle.js',
  target: ['node20'], // Puedes ajustar la versión de Node.js
  minify: true, // Opcional: Minificar el código
}).catch(() => process.exit(1));

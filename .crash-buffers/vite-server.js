// Standalone vite dev server launcher - avoids MSYS bash issues
// Run with: node .crash-buffers/vite-server.js
process.env.IS_GENERIC_BROWSER = '1';
process.env.PORT = '3001';
process.env.REACT_APP_BACKEND_WORKER_HASH = 'dev';
process.env.NODE_ENV = 'development';
process.env.BROWSER = 'none';
process.chdir(__dirname + '/../packages/desktop-client');

const { createServer } = require('vite');

async function start() {
  const server = await createServer({
    configFile: 'vite.config.mts',
    server: { port: 3001, open: false, host: true },
  });
  await server.listen();
  server.printUrls();
  console.log('Vite dev server running. Press Ctrl+C to stop.');
}

start().catch(err => {
  console.error('Failed to start vite:', err);
  process.exit(1);
});

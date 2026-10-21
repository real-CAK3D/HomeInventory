import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the same API handlers used on Vercel run inside Vite, saving to the local "Home Inventory" folder.
const localApi = {
  name: 'home-inventory-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const { pathname } = new URL(req.url || '/', 'http://local');
      if (!pathname.startsWith('/api/')) return next();
      const { routes } = await server.ssrLoadModule('/server/core.js');
      const route = routes[pathname];
      if (!route) return next();
      return route(req, res);
    });
  }
};

export default defineConfig(({ mode }) => {
  // Lets .env.local point the dev server at the real Supabase project (server-side only).
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SESSION_SECRET', 'HOME_INVENTORY_BUCKET', 'HOME_INVENTORY_DIR']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return config;
});

const config = {
  plugins: [react(), localApi],
  build: { chunkSizeWarningLimit: 900 },
  server: { host: '0.0.0.0', watch: { ignored: ['**/Home Inventory/**', '**/android/**'] } }
};

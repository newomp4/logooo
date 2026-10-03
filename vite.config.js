import { defineConfig } from 'vite';

export default defineConfig({
  // a fixed port that doesn't collide with other local tools; moves up if taken
  server: { port: 5317, open: true },
});

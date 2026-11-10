import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html' },
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

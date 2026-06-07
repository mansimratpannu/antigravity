import { defineConfig } from 'vite';

export default defineConfig({
  base: '/antigravity/', // Sets base path for repository subfolder deployment
  build: {
    outDir: 'dist'
  }
});

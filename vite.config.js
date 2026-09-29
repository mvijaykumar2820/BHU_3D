import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// vite-plugin-cesium copies Cesium's static assets and injects its widgets CSS.
export default defineConfig({
  plugins: [react(), cesium()],
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * CORS не включён в `apps/api` (этим займётся агент 6.3, docs/09-decisions.md ADR-039) — для
 * разработки достаточно проксировать `/api` через сервер Vite, который слушает 8080, на API,
 * слушающий 3000: браузер видит один и тот же источник, поэтому CORS вообще не участвует.
 */
export default defineConfig({
  plugins: [react()],
  // Пакеты рабочего пространства pnpm, скомпилированные в CommonJS (ADR-016 — `module: "CommonJS"`
  // для пакетов, исполняемых через `tsc`+`node`): Vite резолвит их через симлинк на реальный путь
  // в `packages/*` и по умолчанию НЕ пропускает такие «локальные» зависимости через esbuild-обёртку
  // CJS→ESM, из-за чего браузер получает исходный `dist/index.js` без интеропа и не видит именованных
  // экспортов. `optimizeDeps.include` заставляет Vite пре-бандлить их так же, как обычную зависимость
  // из `node_modules`, — исправление относится только к режиму разработки/сборки, не к самим пакетам.
  optimizeDeps: {
    include: ['@esim-detector/signals-collector', '@esim-detector/ui-tokens'],
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

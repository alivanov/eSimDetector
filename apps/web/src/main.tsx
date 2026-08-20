import { injectDesignTokensStyle } from '@esim-detector/widget';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { DebugPage } from './debug/DebugPage';

// Демонстрационное приложение не имеет теневого DOM — переменные токенов (`--esim-*`, ADR-012)
// публикуются в `:root` документа один раз при старте (`injectDesignTokensStyle`, ADR-038/ADR-039).
// Будущий Web Component (этап 6.3) вызовет ту же функцию с `shadowRoot` вместо `document`.
injectDesignTokensStyle(document);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Элемент #root не найден в index.html');
}

/**
 * Приложение состоит из ровно двух страниц (экран проверки и стенд отладки, docs/07 §7.6) —
 * маршрутизация по `location.pathname` без библиотеки-роутера (задача этапа 6.4, п.1): третьей
 * страницы не предвидится, а подключение роутера ради одного разветвления было бы избыточным.
 * Соответствие пути статике SPA обеспечивает сервер (`vite dev` по умолчанию, `apps/web/nginx.
 * conf.template` в продакшене — оба отдают `index.html` на любой несуществующий файл).
 */
const page = window.location.pathname === '/debug' ? <DebugPage /> : <App />;

createRoot(container).render(<StrictMode>{page}</StrictMode>);

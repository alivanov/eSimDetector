import { injectDesignTokensStyle } from '@esim-detector/widget';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AdminPage } from './admin/AdminPage';
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
 * Приложение состоит из трёх страниц (экран проверки, стенд отладки — docs/07 §7.6, и раздел
 * модерации `/admin` — этап 7, docs/15-moderation.md §15.7) — маршрутизация по
 * `location.pathname` без библиотеки-роутера (решение этапа 6.4, п.1, распространённое и на
 * добавленную страницу): третья страница не оправдывает подключение роутера, четвёртая — тоже.
 * Соответствие пути статике SPA обеспечивает сервер (`vite dev` по умолчанию, `apps/web/nginx.
 * conf.template` в продакшене — оба отдают `index.html` на любой несуществующий файл).
 */
function selectPage() {
  if (window.location.pathname === '/debug') {
    return <DebugPage />;
  }
  if (window.location.pathname === '/admin') {
    return <AdminPage />;
  }
  return <App />;
}

const page = selectPage();

createRoot(container).render(<StrictMode>{page}</StrictMode>);

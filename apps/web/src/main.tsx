import { injectDesignTokensStyle } from '@esim-detector/widget';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { DebugPage } from './debug/DebugPage';

/**
 * `AdminPage` подключён ДИНАМИЧЕСКИМ импортом, а не статическим, как две другие страницы
 * (docs/09-decisions.md ADR-047 п.11): её ветвь (`admin/admin-api.ts`) переиспользует схемы
 * `@esim-detector/contracts`, которые тянут `zod` как рантайм-зависимость — до этой правки
 * `zod` и весь раздел модерации попадали в единственный публичный чанк (641 кБ, выше порога
 * предупреждения Vite) и скачивались КАЖДЫМ обычным пользователем экрана проверки, которому
 * они никогда не понадобятся (раздел закрыт `ADMIN_TOKEN`, ADR-025 п.5). Маршрутизация здесь
 * по `location.pathname`, без библиотеки-роутера (§7.6) — динамический импорт подключается
 * без неё, `import()` — часть языка, а не роутера.
 */
const AdminPage = lazy(() =>
  import('./admin/AdminPage').then((module) => ({ default: module.AdminPage })),
);

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
    return (
      <Suspense fallback={null}>
        <AdminPage />
      </Suspense>
    );
  }
  return <App />;
}

const page = selectPage();

createRoot(container).render(<StrictMode>{page}</StrictMode>);

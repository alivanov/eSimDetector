import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Сервер статической страницы-примера подключения (docs/07-integration.md §7.2) — минимальный
 * `node:http`, без новых зависимостей (тот же `ts-node`, что уже используется `tools/seed`,
 * `apps/api` в разработке). Слушает СВОЙ порт, отличный от API (`PORT`, по умолчанию 3000) и от
 * `apps/web` (8080, `vite.config.ts`) — без этого проверка CORS была бы одноисточниковой и не
 * проверяла бы взаимную изоляцию/кросс-доменные запросы вообще (объём этапа 6.3, критерий
 * готовности). Требует собранного `apps/widget/dist/widget/v1/esim-widget.js`
 * (`pnpm --filter @esim-detector/widget build`) — при его отсутствии отвечает понятной ошибкой,
 * а не падает молча.
 */
const DEFAULT_PORT = 4174;
const PORT = Number.parseInt(process.env['EXAMPLE_PORT'] ?? '', 10) || DEFAULT_PORT;

// `import.meta.url`, а не `__dirname`: этот файл выполняется как ES-модуль (`apps/widget/
// tsconfig.json` — `module: "ESNext"`, общее для всего пакета, ADR-039 п.4), в котором
// `__dirname` не определён.
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = join(CURRENT_DIR, 'index.html');
const WIDGET_SCRIPT_PATH = join(CURRENT_DIR, '..', 'dist', 'widget', 'v1', 'esim-widget.js');

interface Route {
  readonly filePath: string;
  readonly contentType: string;
}

const ROUTES: ReadonlyMap<string, Route> = new Map([
  ['/', { filePath: INDEX_HTML_PATH, contentType: 'text/html; charset=utf-8' }],
  ['/index.html', { filePath: INDEX_HTML_PATH, contentType: 'text/html; charset=utf-8' }],
  [
    '/widget/v1/esim-widget.js',
    { filePath: WIDGET_SCRIPT_PATH, contentType: 'application/javascript; charset=utf-8' },
  ],
]);

const server = createServer((req, res) => {
  const route = req.url !== undefined ? ROUTES.get(req.url) : undefined;
  if (route === undefined) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не найдено');
    return;
  }

  readFile(route.filePath)
    .then((content) => {
      res.writeHead(200, { 'Content-Type': route.contentType });
      res.end(content);
    })
    .catch(() => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        route.filePath === WIDGET_SCRIPT_PATH
          ? 'Файл esim-widget.js не собран. Выполните: pnpm --filter @esim-detector/widget build'
          : 'Не удалось прочитать файл страницы-примера.',
      );
    });
});

server.listen(PORT, () => {
  console.log(`Страница-пример подключения виджета: http://localhost:${String(PORT)}`);
});

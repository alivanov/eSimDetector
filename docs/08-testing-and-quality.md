# 8. Стратегия тестирования и оценка качества

## 8.1. Замысел

Критерии К1 и К2 (суммарный вес 0,65) оцениваются на контрольных выборках, подготовленных заказчиком, которых у нас нет. Единственный способ подготовиться — построить собственный аналог контрольных испытаний и предъявить его результаты. Поэтому тестирование в этом проекте — не только защита от регрессий, но и **доказательство качества**, отдельный предъявляемый комиссии артефакт.

Отсюда двухуровневая организация проверок:

- **Модульные и e2e-тесты** отвечают на вопрос «работает ли так, как задумано» (обязательное требование проекта).
- **Стенд оценки качества** отвечает на вопрос «насколько хорошо оно определяет устройства» и выдаёт числовые метрики.

## 8.2. Модульные тесты

Обязательны. Основной объём приходится на пакеты без внешних зависимостей, что позволяет тестировать алгоритмы напрямую, без поднятия приложения и базы данных.

**Уточнение расположения (реализация агентов 3–5, ADR-022/ADR-024).** Строки таблицы `detection`, `matching` и `catalog` — не отдельные пакеты `packages/*`, а модули `apps/api/src/modules/{detection,matching,catalog}` (NestJS): вывод статуса и алгоритмы сопоставления были задуманы как независимые пакеты, но при реализации `CatalogModule` требует DI-контейнера и подключения к MongoDB (ADR-022), а `detection`/`matching` оркестрируют вызовы `text-normalizer`/`fuzzy-matcher`/`esim-rules` поверх состояния приложения (ADR-024) — по ADR-001 в самостоятельный пакет без зависимостей от NestJS/HTTP/MongoDB это не выносится. Столбец таблицы называется «Пакет / модуль» намеренно: первые три строки — пакеты (`packages/*`), последующие три — модули `apps/api`.

| Пакет / модуль                   | Что проверяется                                                                                                                                                                                                                                                                                            | Целевое покрытие |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `text-normalizer`                | Каждый шаг нормализации по отдельности и в связке: регистр, Unicode, разделители, разделение букв и цифр, раскладка, транслитерация, синонимы, извлечение незначимых атрибутов, распознавание сервисных кодов, слотовый разбор (`brand`/`family`/`generation`/`modifiers`/`modelCode`/`unparsed`, ADR-019) | ≥ 95%            |
| `fuzzy-matcher`                  | Расстояния и меры схожести, триграммный индекс, ранжирование, жёсткие ограничения на цифры и модификаторы, правило разрыва                                                                                                                                                                                 | ≥ 95%            |
| `esim-rules`                     | Вывод статуса: `supported` / `not_supported` / `conditional`, правило по версии iOS, применение региональных исключений                                                                                                                                                                                    | 100% ветвлений   |
| `apps/api/src/modules/detection` | Классификация платформы, разбор UA и UA-CH, сигнатуры экрана, обнаружение эмуляции, расчёт уверенности, пороги (ADR-024)                                                                                                                                                                                   | ≥ 90%            |
| `apps/api/src/modules/matching`  | Оркестрация конвейера (вызов `text-normalizer` и `fuzzy-matcher`), отбор кандидатов по индексам справочника, применение решения (§4.7) и формирование ответа. Слотовый разбор и распознавание сервисных кодов сюда не входят — они часть `text-normalizer` (ADR-019) и тестируются там                     | ≥ 90%            |
| `apps/api/src/modules/catalog`   | Валидация схемы, инварианты, построение индексов, прогрев кэша (ADR-022)                                                                                                                                                                                                                                   | ≥ 85%            |
| `tools/seed`                     | Разбор дефектных CSV (BOM, обёртка Markdown, разделитель `;`, обрыв строки, повторный заголовок), коды валидации, шаблоны сервисных кодов, консенсус источников, приоритеты слияния, идемпотентность загрузки, сохранение слоя решений модератора                                                          | ≥ 90%            |
| `moderation`                     | Дедупликация задач со счётчиком, подсказки по близким кодам и сигнатурам, применение решений, журнал изменений, экспорт в файлы каталога                                                                                                                                                                   | ≥ 85%            |
| Формирование ответа              | Соответствие контракту, наличие `reasons`, корректность русскоязычных формулировок для каждого статуса                                                                                                                                                                                                     | ≥ 90%            |
| UI-компоненты                    | Отображение трёх статусов, сценарий уточнения, поиск с подсказками, доступность                                                                                                                                                                                                                            | ≥ 80%            |

Фактические пороги покрытия для `detection`/`matching` заданы в `apps/api/jest.config.ts` как 90% по операторам/строкам/функциям и 85%/80% по ветвлениям соответственно (ADR-024, обоснование разницы с целевыми 90% из таблицы — в комментарии самого конфига: часть непокрытых ветвей — артефакт декораторов параметров NestJS, а не пробел в тестах). `moderation` (этап 7, доведено этапом 8, docs/09-decisions.md ADR-047 п.9) заведён тем же принципом: 90% по операторам/строкам/функциям (выше целевых 85% таблицы, с запасом) и 78% по ветвлениям — ниже 85% по той же причине декоратора NestJS плюс защитных Mongoose-веток, которые не оправдывают отдельный тест ради самой метрики; фактическое измерение полного прогона `apps/api` (2026-08-24, этап 6 сдача п.6) — statements 97,28 / branches 83,13 / functions 97,08 / lines 97,13 по всем модулям `moderation`. Для `apps/api/src/modules/catalog` отдельный порог `coverageThreshold` в `jest.config.ts` пока не задан — целевые 85% из таблицы не проверяются автоматически падением сборки; это известный пробел конфигурации, а не решение о снижении требований, и требует внимания агента, ближайшего по времени к работе с этим модулем.

Отдельная группа модульных тестов — **тесты на невозможность ложного результата**. Они формулируются как утверждения о запрещённом поведении, а не о требуемом:

- неизвестный сервисный код никогда не даёт `supported` или `not_supported`;
- запись справочника со `dataConfidence: unverified` не даёт однозначного ответа при отключённом `ALLOW_UNVERIFIED_CATALOG_ANSWERS`;
- `iPhone 1` не сопоставляется с `iPhone 11`, `iPhone 12` — с `iPhone 13`;
- `Pro` не сопоставляется с `Pro Max`;
- `galaxy s23` не сопоставляется с Galaxy A23 и Galaxy M23 — однобуквенное обозначение линейки сравнивается точно (`packages/fuzzy-matcher/src/impossible-matches.spec.ts`);
- `poco x5 pro` не сопоставляется с Oppo Find X5 Pro — два известных слага бренда не считаются опечаткой, даже если Джаро—Винклер выше порога (`impossible-matches.spec.ts`);
- отсутствующая базовая модель не подменяется более узкой (`Tecno Spark 10` ↛ Spark 10 Pro, `OnePlus 11` ↛ 11R);
- испорченный (на одну правку) модификатор (`amx`, `rpo`, `por`, `ultr`) не даёт ложного `determined` ни с базовой моделью, ни с `Pro`/`Pro Max`-версией (docs/04 §4.10.1) — в том числе когда вызывающая сторона передаёт `resolveEquivalenceKey` (`packages/fuzzy-matcher/src/impossible-matches.spec.ts`);
- набор кандидатов с несовпадающими статусами eSIM всегда даёт `clarification_required`;
- при признаках эмуляции устройства однозначный ответ не выдаётся;
- строка выгрузки, не прошедшая валидацию, не попадает в рабочий справочник ни при каких настройках;
- запись, противоречащая контрольной выборке подтверждённых фактов, не даёт ответа пользователю;
- повторный импорт не затирает решение модератора;
- регион по суффиксу сервисного кода выводится только при точном совпадении с проверенной связкой курируемого ядра (`data/catalog/code-suffixes.json`) — частичное или похожее совпадение региона не даёт (`tools/seed/src/domain/code-suffixes.spec.ts`, docs/09-decisions.md ADR-028/ADR-035);
- неподтверждённый либо неизвестный суффикс сервисного кода никогда не даёт отрицательного ответа — только уточнение: `resolveSuffixOutcome` возвращает дискриминированный тип без варианта, из которого можно получить `not_supported` за пределами известного региона (`tools/seed/src/domain/code-suffixes.spec.ts`, `code-suffixes-data.spec.ts` — воспроизводит спорный суффикс `W`, §А.10.4 приложения А, как пример).

## 8.3. Тесты e2e

Применяются там, где ценность выше стоимости; исчерпывающего покрытия не предполагается.

**API (Supertest + изолированный экземпляр MongoDB, см. 8.5):** сквозные сценарии `detect` для Android, iOS и неопознанного устройства; сценарий `search` → `clarify` → результат; соответствие ответов схеме OpenAPI; коды ошибок; ограничение частоты запросов; выставление заголовков `Accept-CH`; работоспособность проверок состояния.

**Важная особенность порядка инициализации.** `ConfigModule.forRoot()` (`@nestjs/config`) читает `process.env` синхронно в момент вычисления декоратора `@Module`, то есть при первой загрузке `AppConfigModule` — а не при вызове `Test.createTestingModule().compile()`. Поэтому в каждом e2e-тесте `AppModule` подключается динамическим `await import('../src/app.module')` **после** того, как тест выставил `process.env['MONGODB_URI']` на адрес изолированной тестовой базы, а не статическим `import` в начале файла: статический импорт вычислился бы раньше, и приложение получило бы значение MongoDB URI по умолчанию вместо адреса тестового экземпляра.

**Интерфейс (Playwright).** Реализовано этапом 6.5, пакет `apps/e2e` (`@esim-detector/e2e`), отдельный от корневого `pnpm test` (AGENTS.md: `pnpm test` обязан проходить из чистого клона без Docker/MongoDB/файла переменных окружения — требование, органически не выполнимое для e2e интерфейса, которому нужен весь поднятый контур). Команда:

```bash
docker compose up -d                 # контур: mongo + api + web (docs/07 §7.6)
npx playwright install chromium      # один раз — браузер для e2e (не ставится при pnpm install)
pnpm test:e2e                        # запускает apps/e2e; сам поднимает страницу-пример виджета
```

`pnpm test:e2e` = `pnpm --filter @esim-detector/e2e run test:e2e` (`playwright test` в `apps/e2e`). Требования к окружению: поднятый контур `docker compose` (проверяется `globalSetup`, `apps/e2e/test/support/global-setup.ts` — понятная ошибка на русском, если контур не готов, вместо таймаутов навигации в каждом тесте) и установленный браузер Chromium Playwright (`npx playwright install chromium`; `@playwright/test` начиная с версии 1.38 не скачивает браузеры при `pnpm install` — этим и обеспечивается требование выше). Страницу-пример подключения виджета (`apps/widget/example/`) на отдельном порту (по умолчанию 4174) поднимает сам конфиг (`playwright.config.ts`, `webServer`) — вручную её запускать не нужно.

Одиннадцать тестов, все три ключевых сценария реализованы в эмуляции нескольких устройств Playwright (`apps/e2e/test/support/device-profiles.ts`):

| Сценарий                                                                                                               | Файлы                                                                   | Устройства                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Автоопределение с однозначным результатом (`supported`/`not_supported`, без уточнения)                              | `test/scenario-1-auto-detect/{pixel-7,pixel-2}.spec.ts`                 | Google Pixel 7 (Android 14) → `supported`; Google Pixel 2 (Android 8.0) → `not_supported` |
| 2. Уточнение через выбор из списка кандидатов (`clarification.kind === 'choose_candidate'`) с доведением до результата | `test/scenario-2-clarification-candidate/{iphone-13,iphone-12}.spec.ts` | iPhone 13 (iOS 15), iPhone 12 (iOS 14)                                                    |
| 3. Ручной поиск с опечаткой (запись категории `typos`, `data/fixtures/queries.golden.json`)                            | `test/scenario-3-manual-search-typo/{pixel-7,desktop-chrome}.spec.ts`   | Pixel 7, Desktop Chrome                                                                   |
| Виджет на сторонней странице: изоляция стилей + события                                                                | `test/scenario-4-widget-embedding/default.spec.ts`                      | Desktop Chrome, страница-пример на отдельном порту                                        |
| Недоступный API: текст ошибки и повтор без бесконечной загрузки                                                        | `test/scenario-5-network-error/default.spec.ts`                         | Desktop Chrome, обрыв сети через `page.route(...).abort()`                                |
| Доступность: автоопределение и выбор кандидата только с клавиатуры, `aria-live`, видимый фокус                         | `test/scenario-6-accessibility/*.spec.ts`                               | Pixel 7, iPhone 13                                                                        |

**Находка этого этапа: эмуляция мобильного устройства и защита от эмуляции сигналов не совместимы без дополнительного шага.** Headless/headed Chromium без настоящего мобильного GPU отдаёт рендерер WebGL вида `ANGLE (Google, ... SwiftShader ...)` либо `ANGLE (Intel/NVIDIA/AMD ...)` — оба буквально совпадают с маркерами `DESKTOP_OR_SOFTWARE_GPU_MARKERS` (`apps/api/src/modules/detection/emulation/detect-emulation.ts`, §3.8 п.2), которые ИМЕННО ЭТО и обязаны отсекать: десктопный браузер, притворяющийся телефоном через подмену User-Agent. Без дополнительного шага КАЖДЫЙ мобильный тест получал бы `EMULATION_SUSPECTED` и уходил в `clarification_required` независимо от остальных сигналов. Решение — `apps/e2e/test/support/gpu-spoof.ts`: `page.addInitScript` подменяет `UNMASKED_VENDOR_WEBGL`/`UNMASKED_RENDERER_WEBGL` на правдоподобное значение мобильного GPU до того, как код страницы успевает их прочитать. Это не смягчение неудобного теста, а обязательная часть построения реалистичных сигналов устройства (см. докстринг файла).

**Ограничение, зафиксированное намеренно, а не молчаливым допущением.** Эмуляция устройства в Playwright — это Chromium (движок явно зафиксирован для ВСЕХ профилей, включая iOS: `defaultBrowserType: 'chromium'` в `device-profiles.ts`) с подменённой строкой User-Agent, а не настоящий Safari/WebKit на живом iPhone и не настоящий Android WebView — `Sec-CH-UA-Model` в такой эмуляции всегда пуст (сценарии 1/2 используют реальный код разбора устаревшего User-Agent, `resolve-android.ts`/`ios_version_and_screen_signature`, а не подставной сигнал). Автоматизированные тесты доказывают корректность логики сервиса при заданных сигналах, а не работоспособность на живом телефоне — проверка на реальных устройствах остаётся ручной (§8.8).

**Невыполненная часть критерия готовности (без формулировки «доделать», см. отчёт этапа 6.5).** Требовалось фактически проверить, что тест публикации событий падает при отключённом `composed: true` у `CustomEvent` (`apps/widget/src/web-component/events.ts`) — проверка выполнена (временная правка, пересборка, прогон, откат), но тест НЕ падает: `dispatchWidgetEvent` вызывается на `this` (хосте теневого дерева), а сам хост лежит в обычном светлом DOM страницы-примера, поэтому всплытие до слушателя на контейнере не пересекает границу теневого DOM независимо от `composed` при текущей структуре страницы-примера. Подробное объяснение и код — докстринг теста `apps/e2e/test/scenario-4-widget-embedding/default.spec.ts`, прямо над вторым тестом файла.

## 8.4. Эталонные выборки

**Пороги покрытия — часть конфигурации, а не соглашения.** Целевые значения из таблицы §8.2 (`≥ 95%` для `text-normalizer`/`fuzzy-matcher` и так далее) заданы как `coverageThreshold.global` в `jest.config.ts` каждого пакета — по всем четырём метрикам (`statements`, `branches`, `functions`, `lines`) одновременно. `jest` завершается ненулевым кодом, если фактическое покрытие после прогона тестов пакета опускается ниже порога хотя бы по одной метрике, и это останавливает сборку (§8.7, «Модульные тесты», блокирует). Понижать порог в `jest.config.ts` в обход недостающих тестов запрещено: правильный путь при падении покрытия — дописать тест на непокрытую ветку, а не ослабить проверку.

Три набора данных в `data/fixtures/`, ведутся как версионируемые артефакты.

### `signals.golden.json` — сигналы устройств

Реальные наборы сигналов с ожидаемым результатом. Сбор: с доступных команде устройств через страницу отладки, из открытых баз User-Agent, из эмуляции устройств в браузерах. Целевой объём — не менее 120 записей. На `/debug` категория записи предлагается по отправленным сигналам (`suggestGoldenCategory`), а не оставляется на первую опцию списка и не списывается с ответа `/detect` (docs/03 §3.10).

Обязательные группы: iPhone разных поколений и версий iOS; Android разных вендоров с UA-CH; Android без UA-CH; браузеры, отличные от Chrome и Safari; WebView внутри приложений; десктопные браузеры; эмуляция мобильного устройства в средствах разработчика; планшеты; заведомо неоднозначные сигнатуры.

**Схема одной записи (агент 5.7, `tools/eval/src/signals-golden.ts`, docs/09-decisions.md ADR-037).** До этого агента документ фиксировал только прозу выше — ни типа, ни разборщика, ни теста не существовало, и наполнить файл без выдуманного на ходу формата было невозможно. Девять категорий ниже — те же девять групп из абзаца выше, буквально переведённые в значения перечисления:

```ts
interface SignalsGoldenEntry {
  readonly id: string; // уникален по всему файлу, формат "<category>-NNN"
  readonly category:
    | 'iphone-generations' // "iPhone разных поколений и версий iOS"
    | 'android-vendor-ua-ch' // "Android разных вендоров с UA-CH"
    | 'android-no-ua-ch' // "Android без UA-CH"
    | 'non-standard-browser' // "браузеры, отличные от Chrome и Safari"
    | 'webview' // "WebView внутри приложений"
    | 'desktop-browser' // "десктопные браузеры"
    | 'devtools-emulation' // "эмуляция мобильного устройства в средствах разработчика"
    | 'tablet' // "планшеты"
    | 'ambiguous-signature'; // "заведомо неоднозначные сигнатуры"
  readonly description: string; // человекочитаемое описание устройства/браузера
  readonly source: 'real-device' | 'public-ua-database' | 'browser-emulation'; // три канала сбора из абзаца выше
  readonly signals: {
    // Ровно форма `signals` тела запроса POST /api/v1/detect (docs/06-api-contract.md §6.2),
    // а НЕ внутренний тип DetectionSignals модуля apps/api/src/modules/detection — выборка
    // описывает то, что реально отправил бы клиент на границу API, версионируемую и
    // переживающую рефакторинг внутреннего типа модуля.
    readonly userAgent?: string;
    readonly uaData?: {
      readonly platform?: string;
      readonly mobile?: boolean;
      readonly model?: string;
      readonly platformVersion?: string;
      readonly brands?: readonly { readonly brand: string; readonly version: string }[];
    };
    readonly screen?: {
      readonly width?: number;
      readonly height?: number;
      readonly dpr?: number;
      readonly orientation?: string;
    };
    readonly hardware?: {
      readonly maxTouchPoints?: number;
      readonly hardwareConcurrency?: number;
      readonly deviceMemory?: number;
    };
    readonly webgl?: { readonly vendor?: string; readonly renderer?: string };
  };
  readonly headers?: Readonly<Record<string, string>>; // Sec-CH-UA-* заголовки, наблюдавшиеся при сборе (docs/03 §3.2)
  readonly region?: string; // ответ на адресный вопрос уточнения, если сигнатура собрана после его разрешения (docs/06 §6.2)
  readonly expected: {
    readonly platform: 'ios' | 'android' | 'harmonyos' | 'other';
    readonly deviceType: 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';
    readonly status: 'supported' | 'not_supported' | 'clarification_required';
    readonly exactModelKnown: boolean;
    readonly deviceId: string | null; // непусто, только когда exactModelKnown === true
  };
  readonly notes?: string;
}
```

**Что проверяется и чем.** `tools/eval/src/signals-golden.ts` — тип и разборщик (`parseSignalsGolden`) без утверждений `as` на границе (ADR-016): каждое перечислимое поле проверяется отдельной функцией-предикатом. `tools/eval/src/signals-golden.spec.ts` — модульные тесты разборщика на синтетических данных. `tools/eval/src/signals-golden-data.spec.ts` — тест файла данных по образцу `tools/seed/src/pipeline/reference-data.spec.ts` (`catalog.reference.json`); файл читается в рантайме через `node:fs`, а не статическим `import`, по тем же причинам, что и `catalog.reference.json` (переживает отсутствие модуля на этапе компиляции).

**Фактическое состояние выборки (агент 6.6, docs/09-decisions.md ADR-042; дополнение полевым сбором 2026-08-25…2026-08-28).** `data/fixtures/signals.golden.json` наполнен — **137 записей**, все девять обязательных групп непусты:

| Группа                 | Записей | Канал сбора                                                                                                                                                                                                                                                                                |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `iphone-generations`   | 39      | 35 `browser-emulation` + 4 `real-device` (14 Pro Max / Яндекс.Браузер; 12 Pro Max / Safari; 12 Pro Max / YaApp_iOS; 11 / Chrome CriOS)                                                                                                                                                     |
| `android-vendor-ua-ch` | 38      | 26 `public-ua-database` (составные) + 12 `real-device` (Pixel 9; S25 Ultra; S24 SM-S9210; Note 13 Pro; Note 9 Pro; Galaxy A21s SM-A217F; Galaxy A10 SM-A105F; Mi 8 Pro / Яндекс.Браузер; realme 14 Pro+ RMX5051; Galaxy A50 SM-A505FN; Honor 8 Lite PRA-TL10; Galaxy Note10 Lite SM-N770F) |
| `android-no-ua-ch`     | 15      | 13 `browser-emulation` + 2 `public-ua-database`                                                                                                                                                                                                                                            |
| `non-standard-browser` | 7       | `public-ua-database`                                                                                                                                                                                                                                                                       |
| `webview`              | 5       | `public-ua-database`                                                                                                                                                                                                                                                                       |
| `desktop-browser`      | 7       | `browser-emulation`                                                                                                                                                                                                                                                                        |
| `devtools-emulation`   | 12      | `browser-emulation`                                                                                                                                                                                                                                                                        |
| `tablet`               | 9       | `browser-emulation`                                                                                                                                                                                                                                                                        |
| `ambiguous-signature`  | 5       | 4 `browser-emulation` + 1 `public-ua-database`                                                                                                                                                                                                                                             |

По каналу сбора: 80 записей `browser-emulation`, 41 запись `public-ua-database`, **16 записей `real-device`** (`android-vendor-ua-ch-027` Pixel 9; `android-vendor-ua-ch-028` Galaxy S25 Ultra / Яндекс.Браузер; `android-vendor-ua-ch-029` Galaxy S24 SM-S9210 / Яндекс.Браузер; `android-vendor-ua-ch-030` Redmi Note 13 Pro / Chrome; `android-vendor-ua-ch-031` Redmi Note 9 Pro / Chrome; `android-vendor-ua-ch-032` Galaxy A21s SM-A217F / Chrome; `android-vendor-ua-ch-033` Galaxy A10 SM-A105F / Chrome; `android-vendor-ua-ch-034` Mi 8 Pro / Яндекс.Браузер; `android-vendor-ua-ch-035` realme 14 Pro+ RMX5051 / Chrome; `android-vendor-ua-ch-036` Galaxy A50 SM-A505FN / Chrome; `android-vendor-ua-ch-037` Honor 8 Lite PRA-TL10 / Яндекс.Браузер; `android-vendor-ua-ch-038` Galaxy Note10 Lite SM-N770F / Chrome; `iphone-generations-036` iPhone 14 Pro Max / Яндекс.Браузер; `iphone-generations-037` iPhone 12 Pro Max / Safari; `iphone-generations-038` iPhone 12 Pro Max / приложение Яндекс YaApp_iOS; `iphone-generations-039` iPhone 11 / Chrome CriOS; стенд `/debug`). Базовое наполнение этапа 6.6 шло без физических устройств команды: `browser-emulation` — дескрипторы Playwright (`@playwright/test`, `devices`), прогнанные через настоящую страницу `/debug` (сигналы сняты `packages/signals-collector`); `public-ua-database` — строки User-Agent из открытых источников (Chrome/Samsung/Mozilla, каталоги UA, корпус `ua-parser-js`) со ссылкой в `notes`. Группа `android-vendor-ua-ch` эмуляцией по-прежнему недостижима целиком (см. ниже) — **26** записей остаются составными (редуцированный UA Chrome для Android + модель из курируемого ядра; в `notes` — «СОСТАВНАЯ запись…»), а **двенадцать** (`android-vendor-ua-ch-027`–`038`) — цельные наблюдённые на живых устройствах.

`expected` записей этапа 6.6 выведен из правил docs/03 и данных справочника **до** обращения к API, а не списан с ответа сервиса (ADR-042). У полевых `real-device` `expected` сверен со справочником и подтверждён тестером (у Анны `/debug` сначала дал `clarification_required` из‑за отсутствия SM-S938B — закрыто `data/catalog/curated/samsung-galaxy-s25-ultra.json`; у Вадима SM-S9210 сначала дал `clarification_required` — закрыто `data/catalog/curated/samsung-galaxy-s24-sm-s9210.json`, `not_supported`, код не добавлять к `samsung-galaxy-s24`; у Алексея `23117RA68G` — закрыто `xiaomi-redmi-note-13-pro.json`; у Малахова «Redmi Note 9 Pro» / M2003J6B2G — `xiaomi-redmi-note-9-pro.json`, путь marketing name; Galaxy A21s / SM-A217F — сначала `clarification_required` из‑за `CODE_COLLISION` в CSV gemini (код ошибочно висел и на A21, и на A21s) — закрыто `data/catalog/curated/samsung-galaxy-a21s.json`, `not_supported`, код только у A21s; Galaxy A10 / SM-A105F — сначала `clarification_required` (код отсутствовал в выгрузках) — закрыто `data/catalog/curated/samsung-galaxy-a10.json`, `not_supported`; Mi 8 Pro / «MI 8 Pro» в Client Hints — сначала `clarification_required` — закрыто `data/catalog/curated/xiaomi-mi-8-pro.json`, `not_supported`; realme 14 Pro+ / RMX5051 — сначала `clarification_required` — закрыто `data/catalog/curated/realme-14-pro-plus.json`, `conditional` (ЕС eSIM / IN dual nano), golden с `region: IN` → `not_supported`; Galaxy A50 / SM-A505FN — сначала `clarification_required` (и ручной поиск пуст: модели не было) — закрыто `data/catalog/curated/samsung-galaxy-a50.json`, `not_supported`; Honor 8 Lite / PRA-TL10 — сначала `clarification_required` (авто и ручной ввод: модель вне CSV Honor ~2020+) — закрыто `data/catalog/curated/honor-8-lite.json`, `not_supported`; Galaxy Note10 Lite / SM-N770F — сначала `clarification_required` (код отсутствовал; в CSV есть Note10/Note10+, не Lite) — закрыто `data/catalog/curated/samsung-galaxy-note10-lite.json`, `not_supported`); у `iphone-generations-036`/`037`/`038`/`039` дополнительно задан `region: OTHER` (у 036/037/039 — скрины настроек / «Добавить eSIM»; у 038 — подтверждение тестера при той же сигнатуре, что 037), без региона те же сигналы дают `clarification_required`; противоречивый черновик `exactModelKnown=true`/`deviceId=null` у Олега исправлен по правилу 3 AGENTS.md. Разовая сверка этапа 6.6 всех тогдашних 121 записи с фактическим ответом работающего контура дала **121/121 (100%)** после разбора четырёх ошибок вывода ожидания самого агента — подробный разбор в отчёте этапа 6.6 (передача агенту 7).

**Границы достоверности (обязательная оговорка).** Выборка из эмуляции браузера и открытых баз User-Agent измеряет **согласованность алгоритма с собственными правилами**, а не точность определения на живых устройствах — «137 записей» не означает «проверено на 137 устройствах» (живой канал — шестнадцать записей). Эмуляцией и открытыми базами принципиально недостижимо:

- **Настоящий `Sec-CH-UA-Model` от живого Android-браузера (массово).** `navigator.userAgentData.getHighEntropyValues(['model'])` в Chromium/Playwright возвращает пустую строку независимо от эмулируемого устройства (проверено эмпирически на всех записях `android-no-ua-ch` из `browser-emulation` — `uaData.model === ""`). Единственный практический путь получить модель в эмуляции — устаревший разбор User-Agent, а не основной сигнал ветки Android (docs/03 §3.4). Поэтому 26 из 38 записей `android-vendor-ua-ch` — составные; исключения — `android-vendor-ua-ch-027`–`038` (Pixel 9; S25 Ultra; S24 SM-S9210; Note 13 Pro; Note 9 Pro по marketing name; Galaxy A21s SM-A217F; Galaxy A10 SM-A105F; Mi 8 Pro по marketing name «MI 8 Pro»; realme 14 Pro+ RMX5051; Galaxy A50 SM-A505FN; Honor 8 Lite PRA-TL10; Galaxy Note10 Lite SM-N770F).
- **Фактическое поведение Safari/WebKit на iOS.** Эмуляция iOS-профилей в этом проекте — Chromium с подменённым User-Agent (`defaultBrowserType: 'chromium'`, тот же приём, что и `apps/e2e`), а не настоящий WebKit: `deviceMemory` в настоящем Safari/Яндекс.Браузере отсутствует (в эмулированных записях он часто есть, потому что его передаёт Chromium), строка рендерера WebGL иная, а режим «Увеличенный» (Display Zoom, docs/03 §3.5 шаг 3) не воспроизводится ни одним профилем. Исключения в выборке — `iphone-generations-036` (Яндекс.Браузер), `iphone-generations-037` (Safari), `iphone-generations-038` (приложение Яндекс / YaApp_iOS), `iphone-generations-039` (Chrome CriOS).
- **Полноценная работа таблицы сигнатур экрана (docs/03 §3.5 шаг 2).** Коллекция `screen_signatures` пуста в развёрнутом контуре — `tools/seed rebuild-signatures` не запускался на полной выгрузке (докстринг `apps/api/.../screen-signature.service.ts`; та же находка передана дельтой агента 6.5). Поэтому ветка iOS на практике работает только по правилу версии ОС (§3.5 шаг 1) без сужения по геометрии экрана: большинство записей `iphone-generations` при версии iOS 12 и новее закономерно получают `clarification_required` с широким списком кандидатов (13–29 моделей) — это не ошибка вывода ожидания агента 6.6, а честно воспроизведённое фактическое поведение сервиса при текущем состоянии данных (см. «notes» соответствующих записей и раздел передачи агенту 7 ниже). Записи `ambiguous-signature` включают отдельно сконструированный (не наблюдённый) пример этого эффекта — группу кандидатов с расходящимся статусом eSIM.

Когда файл отсутствует или его наполнение падает ниже целевого объёма, шесть содержательных проверок `signals-golden-data.spec.ts` (форма записи, объём ≥ 120, все девять групп непусты, уникальность `id`, согласованность `exactModelKnown`↔`deviceId`, отсутствие определённого статуса в группе `ambiguous-signature`) не выполняются вовсе — тест явно проваливается с сообщением о регрессе наполнения (ADR-042), а не пропускает секцию тихо.

### `queries.golden.json` — текстовые запросы

Не менее 300 записей с ожидаемым результатом, размеченных по категориям, соответствующим пунктам критерия К2. Фактическое состояние (агент 2.5): файл содержит 362 записи, от 32 до 34 на категорию, все 11 категорий непусты, идентификаторы записей уникальны.

| Категория              | Строковый код `category` | Примеры                                                      |
| ---------------------- | ------------------------ | ------------------------------------------------------------ |
| Каноническое написание | `canonical`              | `iPhone 15 Pro`, `Samsung Galaxy S24`                        |
| Регистр и разделители  | `case-and-separators`    | `IPHONE15PRO`, `iphone-15-pro`, `iphone_15_pro`              |
| Кириллица              | `cyrillic`               | `айфон 15 про`, `самсунг галакси с24`                        |
| Сокращения             | `abbreviations`          | `s24u`, `нот 12`, `ipx`, `13 pm`                             |
| Опечатки               | `typos`                  | `iphne 15`, `самсунк`, `xiomi`, `хуавей`                     |
| Неверная раскладка     | `wrong-layout`           | `Ыфьыгтп`, `шзрещте 15`                                      |
| Сервисные коды         | `model-codes`            | `SM-S928B`, `CPH2451`, `23090RA98G`                          |
| Неоднозначные          | `ambiguous`              | `galaxy s23`, `iphone`, `redmi note`, `самсунг`              |
| Лишние атрибуты        | `extra-attributes`       | `iPhone 15 Pro 256Gb черный`, `Galaxy S24 Ultra 5G Dual SIM` |
| Посторонний ввод       | `foreign-input`          | `привет`, `qqq`, `12345`, пустая строка                      |
| Устройства без eSIM    | `no-esim-devices`        | `iPhone 8`, `Redmi 9A`, `Honor 8A`                           |

**Схема одной записи.** `expectedSlots` — сериализованный в JSON результат `normalizeQuery(query, dict).slots` (`QuerySlots`, `packages/text-normalizer/src/types.ts`), с одной поправкой: поля, отсутствующие в `QuerySlots` (`exactOptionalPropertyTypes` запрещает там `undefined`, см. docs/04 §4.5.1), в JSON записаны явным `null`, а не опущены — JSON не различает эти два случая так строго, как TypeScript, а явный `null` читается человеком лучше отсутствующего ключа. Тест обязан выполнить обратное преобразование (`undefined` → `null`) перед сравнением, а не полагаться на `toEqual` напрямую.

```ts
interface GoldenQueryEntry {
  readonly id: string; // уникален по всему файлу, формат "<category>-NNN"
  readonly query: string; // сырой пользовательский ввод, как он есть
  readonly category:
    | 'canonical'
    | 'case-and-separators'
    | 'cyrillic'
    | 'abbreviations'
    | 'typos'
    | 'wrong-layout'
    | 'model-codes'
    | 'ambiguous'
    | 'extra-attributes'
    | 'no-esim-devices'
    | 'foreign-input';
  readonly expectedOutcome: 'match' | 'clarification' | 'not_found'; // ожидание полного пайплайна matching (агент 3+), сейчас не проверяется
  readonly expectedDeviceId: string | null; // см. примечание о статусе aspirational ниже
  readonly expectedSlots: {
    readonly brand: string | null;
    readonly family: string | null;
    readonly generation: number | null;
    readonly modifiers: readonly string[];
    readonly modelCode: string | null;
    readonly attributes: QueryAttributes; // как есть, без null-заглушек — поля просто отсутствуют
    readonly unparsed: readonly string[];
  };
  readonly notes?: string; // необязательная причина правки записи после сверки со справочником
}
```

**Что проверяется сейчас и чем.** `tools/eval/src/data-files.spec.ts` (агент 2.5) — модульный тест, а не стенд оценки качества: он прогоняет каждую запись через настоящий `normalizeQuery(query, dict)` на настоящем `data/catalog/aliases.json` и сравнивает `slots` с `expectedSlots`. Дополнительно проверяются структурная валидность файла без утверждений `as` (ADR-016), объём (≥ 300), непустота всех 11 категорий, уникальность `id` и отсутствие `expectedDeviceId` у категорий `ambiguous`/`foreign-input`.

**Что не проверяется сейчас (aspirational-поля).** `expectedOutcome` и `expectedDeviceId` описывают ожидание ПОЛНОГО конвейера сопоставления (отбор кандидатов по справочнику + правило принятия решения, §4.6—4.7), которого на момент составления выборки ещё не существует (модули `matching`/`esim-rules`/`CatalogModule` — объём агента 3 и далее). Эти два поля пока не проверяются никаким тестом; для части записей (`model-codes`, где часть кодов при отсутствии реального справочника не может быть подтверждена) `expectedDeviceId` — целевое, а не текущее наблюдаемое значение. Стенд `pnpm eval:matching` (§8.6) начнёт по-настоящему сверять эти поля, когда появится справочник устройств и полный конвейер сопоставления; до этого момента расхождение между `expectedDeviceId` и будущим поведением сопоставления не является ошибкой этой выборки — это следующий шаг работы, а не текущий недостаток.

**Проверка файлов данных живёт в `tools/eval`, а не в `packages/text-normalizer`.** `data/catalog/aliases.json` тоже проверяется на разбор `parseNormalizationDictionary` внутри `packages/text-normalizer` (`aliases-data.spec.ts` — там это нужно, чтобы пакет был тестируем независимо), но полная проверка ФАЙЛОВ ДАННЫХ как артефакта (оба файла разом, соответствие эталонной выборки реальному словарю) — в `tools/eval`, поскольку именно этот инструмент их вместе использует и должен упасть первым при рассинхронизации.

### `catalog.reference.json` — контрольные факты по устройствам

Выборка устройств с независимо подтверждённым статусом eSIM и ссылкой на источник. Служит для проверки самого справочника: тест сверяет справочник с этой выборкой и падает при расхождении. Смысл — отделить ошибки данных от ошибок алгоритма.

**Фактическое состояние (агент 5.4, docs/09-decisions.md ADR-032).** Файл создан, **196 записей** — выше целевых «не менее 150» (docs/11 §11.2): 44 Apple + 32 Google Pixel (id и статус — из уже проверенных курируемых ядер `data/catalog/curated/*.json`, `note` — ссылка на их же `sources[0].url`) + 120 Samsung. Состав Samsung: граница появления eSIM из §А.8.1 вывод 4 (`samsung-galaxy-s10`, `samsung-galaxy-s10e`, `samsung-galaxy-s20-fe` — четвёртая модель границы, S10+, схлопывается с S10 общим для конвейера свойством нормализации, docs/09 ADR-032 п.5, а не отдельным решением этого агента) плюс `samsung-galaxy-s9`/`samsung-galaxy-s21-fe` тем же методом; 34 модели линеек S/Note/Z, подтверждённые прямым присутствием в вендорском перечне; 83 бюджетные модели A/M-серий, подтверждённые ОТСУТСТВИЕМ в том же перечне (перечень построен как список поддерживаемых устройств, и соседние поколения/модификаторы того же ряда в нём перечислены явно — методология и её ограничения раскрыты в `note` каждой такой записи и в ADR-032). Единственный вендорский источник для всей группы Samsung: `samsung.com/.../galaxy-esim-and-supported-network-carriers/`, раздел «Galaxy devices that support eSIM», дата страницы — 15 августа 2026, сверено агентом 2026-08-19.

**Перемерено этапом 5.5 после импорта партии 3 (данные получены от пользователя в ходе этапа — см. приложение А §А.6).** Доля расхождений выгрузки с эталоном на пересечении выросла с 19,0% до **26,8%** (пересечение 179→228 строк, совпало 145→167, карантинировано кодом `REFERENCE_MISMATCH` 34→61) — печатается `pnpm seed import`/`consensus` и `pnpm seed verify`. Рост доли — не признак ухудшения качества новых выгрузок, а прямое следствие того, что пересечение впервые включило линейки Z Fold/Z Flip/Note: записи эталона по ним были заведены агентом 5.4 заранее (ADR-032) именно в ожидании этого момента, и до партии 3 пересечение по ним было нулевым (docs/14 §14.4 шаг 4 корректно работает и при отсутствии пересечения, `tools/seed/src/pipeline/reference.ts`, докстринг `applyReferenceCheck`). Разбор новых расхождений — docs/09-decisions.md ADR-033. Формат файла и совпадение `id` с реальными идентификаторами справочника покрыты тестом данных `tools/seed/src/pipeline/reference-data.spec.ts` (по образцу `curated-apple.spec.ts`/`curated-pixel.spec.ts`).

Партии 5 (флагманы Xiaomi), 8 (Huawei) и 12 (прочие бренды) не пересекаются с текущим эталоном вовсе (эталон покрывает только Apple/Pixel/Samsung, ADR-032) — их доля расхождений с эталоном не измеряется по построению, а не по недосмотру; качество этих трёх партий оценивается только консенсусом источников и валидацией схемы (ADR-033).

## 8.5. Изоляция тестовой базы данных

Требование: тесты не обращаются к базе данных приложения. Помимо воспроизводимости здесь есть риск потери данных — тесты по своей природе очищают коллекции между проверками, и одна неверно выставленная переменная окружения способна уничтожить рабочие данные вместе с накопленными решениями модератора. Поэтому разделение обеспечивается не соглашением, а тремя независимыми механизмами.

### Уровень 1. Основной объём тестов не использует базу данных

Алгоритмическая часть вынесена в пакеты без зависимости от хранилища (`text-normalizer`, `fuzzy-matcher`, `esim-rules`, `signals-collector`), а также в чистые функции разбора и валидации CSV. Эти тесты работают с данными в памяти, выполняются за секунды и составляют большую часть покрытия. Доступ к базе для них не нужен в принципе.

### Уровень 2. Отдельный экземпляр MongoDB для тестов

Тесты, которым нужна база — репозитории справочника, импорт, очередь модерации, e2e API — поднимают собственный экземпляр через `mongodb-memory-server`. Это настоящий сервер MongoDB с хранением данных в памяти, поэтому индексы, агрегации и поведение запросов совпадают с рабочей средой.

| Свойство               | Реализация                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Экземпляр сервера      | Один на рабочий процесс Jest, поднимается в `globalSetup`, останавливается в `globalTeardown` |
| Имя базы               | Уникальное на каждый файл тестов: `esim_test_<worker>_<hash>`                                 |
| Очистка между тестами  | Усечение коллекций, а не пересоздание базы — быстрее и не требует перестроения индексов       |
| Параллельный запуск    | Разрешён: тесты не делят состояние                                                            |
| Требования к окружению | Нет: ни Docker, ни запущенный MongoDB, ни файл переменных окружения                           |

Помощник `withTestDatabase()` из пакета `test-utils` инкапсулирует подключение, очистку и закрытие соединений, поэтому в самих тестах инфраструктурного кода нет.

### Уровень 3. Защитная проверка в коде

Даже при ошибочной конфигурации тесты не должны получить доступ к рабочим данным. Подключение в тестовом режиме отказывает с ошибкой, если нарушено любое из условий:

- `NODE_ENV` равно `test`;
- имя базы данных заканчивается на `_test`;
- строка подключения не совпадает со значением `MONGODB_URI` рабочей конфигурации.

Разрушающие операции — `dropDatabase`, массовое удаление документов, повторная инициализация справочника — доступны только через обёртку, выполняющую эту проверку перед вызовом. Проверка сама покрыта тестами: отдельный тест утверждает, что попытка выполнить очистку на базе с именем без суффикса `_test` завершается ошибкой.

### Дополнительно: проверка на настоящем сервере

Отдельная задача CI с Testcontainers / сервис-контейнером только под интеграционные тесты **не заведена**: те же сценарии уже выполняются в `pnpm test` через `mongodb-memory-server` (ADR-017) на каждой ветке и блокируют сборку. Сервис-контейнер MongoDB в CI используется для `pnpm seed load` / `pnpm seed verify` (§8.7), а не как второй прогон интеграционных тестов приложения.

### Переменные окружения тестов

Файл `.env.test` в репозиторий не требуется и намеренно не создаётся: тестовое окружение самодостаточно. Переменная `MONGODB_URI` в тестах игнорируется — адрес всегда выдаёт поднятый экземпляр. Это исключает сценарий «забыл переключить переменную окружения», который и является основным источником инцидентов такого рода.

## 8.6. Стенд оценки качества

```bash
pnpm eval              # оба контура, сводный отчёт
pnpm eval:detection    # только автоопределение
pnpm eval:matching     # только обработка ввода
```

Отчёт формируется в двух видах: для консоли и как файл Markdown в `reports/` (каталог в `.gitignore`). Предъявляемая комиссии копия финальных сводных показателей, разбивки по категориям обоих контуров и самопроверка К1–К4 — в отслеживаемом [приложении Б](./appendix-b-quality-report.md).

**Запуск из `/admin` и обход `RATE_LIMIT`.** Тот же конвейер (`tools/eval`, параметризованный `intervalMs`/заголовками/приёмником отчёта) вызывается из API на `127.0.0.1:${PORT}` с `X-Admin-Token` (ADR-049). При непустом совпавшем `ADMIN_TOKEN` `RateLimitGuard` не считает запрос в квоту — иначе ~483 запроса стенда упёрлись бы в `RATE_LIMIT_RPM`. CLI `pnpm eval` при заданном `ADMIN_TOKEN` тоже шлёт токен и может идти без паузы 700 мс; без токена поведение прежнее (пауза). Отчёты прогонов из админки хранятся в MongoDB (`eval_runs`), не на диске контейнера.

Покрытие (план «Админка и главная», to-do docs-tests): модульный `RateLimitGuard` + валидный/неверный/пустой `X-Admin-Token` (`apps/api/src/common/guards/rate-limit.guard.spec.ts`); сквозной e2e обхода лимита (`apps/api/test/rate-limit.e2e-spec.ts`); `EvalRunService` через `withTestDatabase()` (`eval-run.service.integration.spec.ts`); UI `/admin` — справка, колонка «Когда», подтверждение reload/запуска стенда (`apps/web/src/admin/AdminPage.spec.tsx`); виджет без `continue` без обработчика и без дубля ссылки ручного ввода (`EsimChecker.spec.tsx`); аккордеон на демо (`App.spec.tsx`); e2e демо не ждёт «Подключить eSIM» без `onPrimaryAction` (`apps/e2e/test/support/scenarios.ts`).

| Метрика                     | Смысл                                          | Целевое значение                  |
| --------------------------- | ---------------------------------------------- | --------------------------------- |
| Доля верных определений     | Ответ совпал с ожидаемым                       | ≥ 0,95                            |
| **Доля ложных определений** | Выдан однозначный неверный ответ               | **0**                             |
| Доля корректных уточнений   | Ожидалось уточнение — получено уточнение       | ≥ 0,95                            |
| Доля избыточных уточнений   | Определение было возможно, но выдано уточнение | ≤ 0,10                            |
| Доля автоматических ответов | Ответ без участия пользователя                 | измеряется, целевого значения нет |
| Разбивка по категориям      | Метрики по каждому пункту К2                   | предъявляется в отчёте            |

Ключевой показатель — доля ложных определений с целевым значением ноль. Он важнее полноты: снизить долю уточнений всегда можно понижением порогов, а вот ложный ответ прямо противоречит ТЗ. Показатель **блокирует сдачу** (ручной прогон `pnpm eval` перед сдачей): любое ложное определение на эталонной выборке недопустимо (ADR-003). Автоматический CI на каждой ветке стенд `pnpm eval` **не запускает** — см. [ADR-048](./09-decisions.md#adr-048-показатель-стенда-блокирует-сдачу-вручную-а-не-ci-сборку-на-каждой-ветке). Финальные измеренные значения канонической пары этапа 6 — в [приложении Б](./appendix-b-quality-report.md).

**Классификация исхода К2 (`resolveActualOutcome`, `tools/eval`).** `clarification_required` с непустым `matches[]` (выбор кандидата) — всегда `clarification`, даже при ошибочно заполненном `device` (иначе лидер группы считался бы верным `match`). Непустой `device` без списка кандидатов — `match` (модель названа; статус eSIM может ждать ответа на условие). `supported`/`not_supported` при `device: null` — ответ группы эквивалентности без точной модели (ADR-002) и тоже `match`. `clarification_required` с `answer_question` или `check_on_device` без `matches` и без `device` — группа с общим условием / гейтом достоверности (ADR-045) и тоже `match`. Ложным считается только уверенно названное неверное устройство (`deviceId !== null` и не совпал с ожиданием).

## 8.7. Конвейер непрерывной интеграции

**Локальная защита перед CI.** Git-хук `pre-commit` (husky + lint-staged, настроен в корневом `package.json`, устанавливается автоматически при `pnpm install`) прогоняет Prettier и ESLint по файлам, попавшим в коммит, и правит их автоматически там, где это возможно. Задача — не дать несогласованному со стилем файлу попасть в коммит, а не заменить проверку в CI: шаг «Форматирование (Prettier)» в конвейере ниже остаётся обязательным и блокирующим, в том числе как страховка на случай коммита с обходом хука (`--no-verify`) или коммита из среды без установленных хуков.

Фактический конвейер — [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

| Этап                                         | Содержание                                                                                                                                     | Блокирует сборку                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Статический анализ                           | ESLint, проверка типов, форматирование (`pnpm format:check` / `lint` / `typecheck`)                                                            | да                                                                                                                                                   |
| Валидация справочника и сверка с эталоном    | Сервис-контейнер MongoDB 7 + `pnpm seed load` + `pnpm seed verify` (инварианты §5.8 и `catalog.reference.json`; код возврата 1 при нарушениях) | да                                                                                                                                                   |
| Модульные и e2e-тесты API                    | `pnpm test` — все пакеты, пороги покрытия; e2e API и интеграционные тесты через `mongodb-memory-server` (ADR-017)                              | да                                                                                                                                                   |
| Стенд оценки качества                        | `pnpm eval` на поднятом контуре с наполненным справочником                                                                                     | **не в CI**; блокирует сдачу вручную ([ADR-048](./09-decisions.md#adr-048-показатель-стенда-блокирует-сдачу-вручную-а-не-ci-сборку-на-каждой-ветке)) |
| Тесты e2e интерфейса                         | Playwright (`pnpm test:e2e`)                                                                                                                   | **не в CI**; требует поднятый контур и браузеры                                                                                                      |
| Интеграционные тесты на MongoDB в контейнере | Отдельная задача с Testcontainers / сервис-контейнером только для интеграционных тестов                                                        | **не выполняется**; те же проверки уже входят в `pnpm test` через `mongodb-memory-server`                                                            |
| Сборка образов                               | `apps/api/Dockerfile`, `apps/web/Dockerfile` (статика виджета копируется в образ web, см. Dockerfile)                                          | да                                                                                                                                                   |
| Образ виджета                                | Отдельный Dockerfile для виджета                                                                                                               | **не выполняется**; виджет собирается как бандл, отдельного образа нет и не предполагается                                                           |

## 8.8. Ручная проверка перед сдачей

Автоматизация не покрывает часть проверок, поэтому предусмотрен контрольный список: проверка на реальных устройствах команды (не менее 8 разных моделей), проверка в браузерах Chrome, Safari, Firefox, Яндекс.Браузер, Samsung Internet, проверка внутри WebView мессенджеров, проверка при масштабированном экране и увеличенном системном шрифте, проверка доступности с экранным диктором, проверка сценария при недоступном API, проверка запуска из чистого клона репозитория на машине, где проект ранее не собирался.

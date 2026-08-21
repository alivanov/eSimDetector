# 6. Контракт API `[черновик]`

Раздел описывает интерфейс взаимодействия для критерия К4. Машиночитаемая спецификация OpenAPI 3.1 генерируется из кода и доступна на `/api/docs` (Swagger UI) и `/api/docs-json`.

## 6.1. Общие соглашения

| Параметр              | Значение                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Базовый путь          | `/api/v1`                                                                                                                       |
| Формат                | `application/json; charset=utf-8`                                                                                               |
| Версионирование       | В пути. Ломающие изменения — только в новой версии пути                                                                         |
| Идентификатор запроса | Заголовок `X-Request-Id`; при отсутствии генерируется сервисом и возвращается в ответе                                          |
| Аутентификация        | Публичные эндпоинты для виджета не требуют ключа; для server-to-server поддерживается `X-Api-Key`. Режим задаётся конфигурацией |
| CORS                  | Список разрешённых источников из конфигурации; по умолчанию в демонстрационном контуре разрешены все                            |
| Ограничение частоты   | По IP и по ключу API; при превышении — `429` с `Retry-After`                                                                    |
| Локализация           | Пользовательские формулировки — на русском языке; машинные коды — латиницей, неизменяемы                                        |

Все ответы, содержащие результат определения, используют единый перечень статусов:

| Статус                   | Смысл                           | Формулировка в интерфейсе              |
| ------------------------ | ------------------------------- | -------------------------------------- |
| `supported`              | Устройство поддерживает eSIM    | «Ваше устройство поддерживает eSIM»    |
| `not_supported`          | Устройство не поддерживает eSIM | «Ваше устройство не поддерживает eSIM» |
| `clarification_required` | Требуется уточнение             | «Нужно уточнить модель устройства»     |

Иных статусов результата не предусмотрено — это требование ТЗ об однозначности. Служебные состояния (`not_found` при поиске, ошибки валидации) относятся к транспортному уровню и не смешиваются со статусом результата.

## 6.2. `POST /api/v1/detect` — автоматическое определение

Основной эндпоинт. Принимает сигналы, собранные на клиенте; дополнительно учитывает заголовки запроса.

### Запрос

```http
POST /api/v1/detect HTTP/1.1
Content-Type: application/json
X-Request-Id: 7f3c1e2a-4b5d-4c6e-9a80-1b2c3d4e5f60
Sec-CH-UA-Model: "SM-S928B"
Sec-CH-UA-Platform: "Android"
Sec-CH-UA-Platform-Version: "14.0.0"

{
  "signals": {
    "userAgent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 ...",
    "uaData": {
      "platform": "Android",
      "platformVersion": "14.0.0",
      "mobile": true,
      "model": "SM-S928B",
      "brands": [{ "brand": "Google Chrome", "version": "143" }]
    },
    "screen": { "width": 384, "height": 832, "dpr": 3.75, "orientation": "portrait-primary" },
    "hardware": { "maxTouchPoints": 5, "hardwareConcurrency": 8, "deviceMemory": 8 },
    "webgl": { "vendor": "Qualcomm", "renderer": "Adreno (TM) 750" }
  },
  "context": { "channel": "web-lk", "locale": "ru-RU", "region": "CN" }
}
```

Все поля `signals` необязательны: сервис работает с любым доступным подмножеством, понижая уверенность при недостатке данных. Это важно для интеграции — заказчику не нужно гарантировать полноту сбора.

**`context.region` — ответ пользователя на адресный вопрос уточнения (§3.7 docs/03-detection-algorithm.md, ADR-007), а не сигнал устройства.** Значение — код одного из вариантов `esim.clarifyingQuestion.options` записи справочника (docs/05 §5.4), например `"CN"` или `"OTHER"`; конкретный набор допустимых значений задаётся записью, а не фиксированным перечнем на границе API. Поле необязательно и в первом запросе обычно отсутствует — оно появляется только во ВТОРОМ запросе, когда клиент уже показал пользователю вопрос из предыдущего ответа (`clarification.kind === "answer_question"`) и получил выбор.

Критическое ограничение для интегратора: **клиент не имеет права заполнять `context.region` по умолчанию, выводить его из `context.locale`, часового пояса, IP-адреса или любого другого косвенного сигнала.** Локаль `ru-RU` на iPhone, купленном в континентальном Китае, — обычное дело (параллельный импорт), и подстановка региона по таким признакам на стороне клиента превращает честное уточнение в тихую догадку, которую сервис уже не может проверить или отклонить: ошибка происходит ДО обращения к `/detect`, а не внутри него. Это ровно тот класс ложного положительного ответа, против которого писан критерий К1 (ADR-003) — с той разницей, что здесь его совершает не сервис, а интеграция заказчика, если пренебречь этим правилом. Единственный корректный источник значения — прямой клик пользователя по одному из `clarification.options`.

Состояния сессии в API не появляется: `/detect` остаётся идемпотентным — клиент присылает ПОЛНЫЙ набор сигналов и ответ пользователя заново с каждым запросом, сервис не хранит связь между первым запросом (без региона) и повторным (с регионом) по `requestId` или иным ключом.

### Ответ: устройство определено

```json
{
  "requestId": "7f3c1e2a-4b5d-4c6e-9a80-1b2c3d4e5f60",
  "status": "supported",
  "confidence": 0.97,
  "detection": {
    "method": "ua_client_hints_model",
    "platform": "android",
    "exactModelKnown": true,
    "deviceType": "phone"
  },
  "device": {
    "id": "samsung-galaxy-s24-ultra",
    "brand": "Samsung",
    "name": "Galaxy S24 Ultra",
    "modelCode": "SM-S928B",
    "esim": { "support": "supported", "dualSim": "physical+esim", "maxProfiles": 2 }
  },
  "candidates": [],
  "reasons": [
    { "code": "UA_CH_MODEL_RECEIVED", "detail": "SM-S928B" },
    { "code": "CATALOG_EXACT_MATCH", "detail": "samsung-galaxy-s24-ultra" },
    { "code": "CATALOG_ENTRY_VERIFIED", "detail": "источник проверен 2026-06-01" }
  ],
  "presentation": {
    "title": "Ваше устройство поддерживает eSIM",
    "description": "Samsung Galaxy S24 Ultra может использовать eSIM вместе с физической SIM-картой.",
    "primaryAction": { "label": "Подключить eSIM", "kind": "continue" },
    "secondaryAction": { "label": "Это не моё устройство", "kind": "manual_search" }
  }
}
```

Блок `presentation` содержит готовые русскоязычные формулировки. Это сделано намеренно: заказчик, интегрирующий только API без нашего виджета, получает согласованные и проверенные тексты и не обязан формулировать их сам. Тексты при этом полностью переопределяемы на стороне заказчика.

### Ответ: модель iPhone определена как группа

```json
{
  "requestId": "…",
  "status": "supported",
  "confidence": 0.93,
  "detection": {
    "method": "ios_version_and_screen_signature",
    "platform": "ios",
    "exactModelKnown": false,
    "deviceType": "phone"
  },
  "device": null,
  "candidates": [
    { "id": "apple-iphone-14-pro", "name": "iPhone 14 Pro" },
    { "id": "apple-iphone-15", "name": "iPhone 15" },
    { "id": "apple-iphone-15-pro", "name": "iPhone 15 Pro" },
    { "id": "apple-iphone-16", "name": "iPhone 16" }
  ],
  "reasons": [
    { "code": "IOS_VERSION_IMPLIES_MIN_MODEL", "detail": "iOS 18.5" },
    { "code": "SCREEN_SIGNATURE_MATCHED", "detail": "393x852@3" },
    { "code": "CANDIDATES_AGREE_ON_ESIM", "detail": "4 кандидата, статус единый" }
  ],
  "presentation": {
    "title": "Ваше устройство поддерживает eSIM",
    "description": "Мы определили, что у вас iPhone одной из моделей, поддерживающих eSIM.",
    "primaryAction": { "label": "Подключить eSIM", "kind": "continue" },
    "secondaryAction": { "label": "Уточнить модель", "kind": "clarify" }
  }
}
```

Обратите внимание: `exactModelKnown: false`, но `status: supported` с высокой уверенностью. Это и есть практическая реализация принципа «определяем ответ, а не название модели».

### Ответ: планшет (iPad) определён как группа (этап 5.6, ADR-034)

Тот же метод, что и для iPhone, но по множеству кандидатов `deviceType: "tablet"` (докс/03 §3.2а/§3.5) — сигнатуры экрана iPad не пересекаются с сигнатурами iPhone, поэтому владелец iPad получает адресный ответ про iPad, а не про телефон:

```json
{
  "requestId": "…",
  "status": "supported",
  "confidence": 0.85,
  "detection": {
    "method": "ios_version_and_screen_signature",
    "platform": "ios",
    "exactModelKnown": false,
    "deviceType": "tablet"
  },
  "device": null,
  "candidates": [
    { "id": "apple-ipad-10", "name": "Apple iPad (10th generation)" },
    { "id": "apple-ipad-air-5", "name": "Apple iPad Air (5th generation)" }
  ],
  "reasons": [
    { "code": "PLATFORM_DETECTED", "detail": "ios" },
    { "code": "DEVICE_TYPE_TABLET_DETECTED", "detail": "user-agent содержит \"iPad\"" },
    { "code": "SCREEN_SIGNATURE_MATCHED", "detail": "820x1180@2" },
    { "code": "CANDIDATES_AGREE_ON_ESIM", "detail": "2 кандидата, статус единый" }
  ],
  "presentation": {
    "title": "Ваше устройство поддерживает eSIM",
    "description": "Мы определили, что у вас iPad — эта группа моделей поддерживает eSIM.",
    "primaryAction": { "label": "Подключить eSIM", "kind": "continue" },
    "secondaryAction": { "label": "Уточнить модель", "kind": "clarify" }
  }
}
```

Тот же принцип действует и при явном признаке настольного User-Agent (Safari на iPadOS 13+ по умолчанию отправляет UA настольного macOS): при `maxTouchPoints > 0` сервис распознаёт платформу `ios` и тип `tablet` без слова `iPad` в самой строке User-Agent (докс/03 §3.2а). При `maxTouchPoints === 0` то же устройство остаётся настоящим Mac (`platform: "other"`) — планшетом не классифицируется никогда.

### Ответ: требуется уточнение

```json
{
  "requestId": "…",
  "status": "clarification_required",
  "confidence": 0.41,
  "detection": {
    "method": "ios_version_and_screen_signature",
    "platform": "ios",
    "exactModelKnown": false,
    "deviceType": "phone"
  },
  "device": null,
  "candidates": [
    { "id": "apple-iphone-x", "name": "iPhone X", "esimSupport": "not_supported" },
    { "id": "apple-iphone-xs", "name": "iPhone XS", "esimSupport": "supported" },
    { "id": "apple-iphone-11-pro", "name": "iPhone 11 Pro", "esimSupport": "supported" }
  ],
  "reasons": [
    { "code": "SCREEN_SIGNATURE_MATCHED", "detail": "375x812@3" },
    { "code": "CANDIDATES_DISAGREE_ON_ESIM", "detail": "iPhone X не поддерживает eSIM" }
  ],
  "clarification": {
    "kind": "choose_candidate",
    "question": "Уточните модель вашего iPhone",
    "options": [
      { "id": "apple-iphone-x", "label": "iPhone X" },
      { "id": "apple-iphone-xs", "label": "iPhone XS" },
      { "id": "apple-iphone-11-pro", "label": "iPhone 11 Pro" },
      { "id": "__other__", "label": "Другая модель" }
    ]
  },
  "presentation": {
    "title": "Нужно уточнить модель устройства",
    "description": "Несколько моделей iPhone выглядят для браузера одинаково. Выберите вашу.",
    "primaryAction": { "label": "Выбрать модель", "kind": "clarify" }
  }
}
```

Блок `clarification` описывает следующий шаг диалога в машиночитаемом виде: `kind` принимает значения `choose_candidate` (выбор из списка), `answer_question` (уточняющий вопрос по региону или прошивке), `manual_input` (ввод названия), `check_on_device` (инструкция по проверке в настройках).

### Ответ: адресный вопрос вместо списка моделей (группа iOS с общим региональным условием)

Когда статус группы кандидатов не определён, но причина у всех кандидатов ОДНА и ТА ЖЕ — одно и то же нерешённое условие `esim.conditions` (докс/05 §5.4) с буквально совпадающим `clarifyingQuestion` — сервис задаёт этот вопрос напрямую вместо выбора из списка (докс/03 §3.7, п.2; этап 5.3а). Код причины в этом случае — `CANDIDATES_AGREE_ON_CLARIFICATION`, а не `CANDIDATES_DISAGREE_ON_ESIM` (ADR-045): статус eSIM у кандидатов ОДИНАКОВ, и именно поэтому вопрос может быть общим; расхождением называется случай предыдущего примера, где у кандидатов разные статусы.

```json
{
  "requestId": "…",
  "status": "clarification_required",
  "confidence": 0.4,
  "detection": {
    "method": "ios_version_and_screen_signature",
    "platform": "ios",
    "exactModelKnown": false,
    "deviceType": "phone"
  },
  "device": null,
  "candidates": [
    { "id": "apple-iphone-14-pro", "name": "iPhone 14 Pro" },
    { "id": "apple-iphone-15", "name": "iPhone 15" },
    { "id": "apple-iphone-15-pro", "name": "iPhone 15 Pro" },
    { "id": "apple-iphone-16", "name": "iPhone 16" }
  ],
  "reasons": [
    { "code": "SCREEN_SIGNATURE_MATCHED", "detail": "393x852@3" },
    {
      "code": "CANDIDATES_AGREE_ON_CLARIFICATION",
      "detail": "4 кандидат(ов), всем требуется уточнение"
    }
  ],
  "clarification": {
    "kind": "answer_question",
    "question": "Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?",
    "options": [
      { "id": "CN", "label": "Две nano-SIM (версия для материкового Китая, Гонконга или Макао)" },
      { "id": "OTHER", "label": "Одну nano-SIM (все остальные версии)" }
    ]
  },
  "presentation": {
    "title": "Нужно уточнить модель устройства",
    "description": "Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?",
    "primaryAction": { "label": "Выбрать модель", "kind": "clarify" }
  }
}
```

Повторный запрос с теми же `signals` и `context.region`, равным одному из значений `clarification.options[].id`, возвращает определённый статус (`supported`/`not_supported`) вместо уточнения — `exactModelKnown` при этом остаётся `false`: регион разрешает статус eSIM, а не модель внутри группы (AGENTS.md, предметное правило 3). Если хотя бы у одного кандидата группы условий нет либо вопросы кандидатов расходятся (пример — сигнатура `390×844@3`, где iPhone 17e без условия стоит рядом с условными 12/13/14/16e), клиент по-прежнему получает `choose_candidate`, как в предыдущем примере.

**Реализация агента 5 (`apps/api/src/modules/detection`).** `POST /api/v1/detect` и `POST /api/v1/devices/search` (§6.3) отвечают кодом `200` явно (`@HttpCode(200)`), а не принятым в NestJS по умолчанию для `POST` кодом `201` — ADR-008/ADR-024. Полный перечень стабильных кодов `reasons[]` этого эндпоинта («PLATFORM_DETECTED», «UA_CH_MODEL_RECEIVED», «CATALOG_EXACT_MATCH», «CATALOG_MODEL_CODE_UNKNOWN», «LEGACY_UA_MODEL_PARSED», «IOS_VERSION_IMPLIES_MIN_MODEL», «SCREEN_SIGNATURE_MATCHED», «SCREEN_SIGNATURE_UNKNOWN», «EMULATION_SUSPECTED», «SIGNAL_HEADERS_CONSISTENT»/«SIGNAL_HEADERS_INCONSISTENT», «CONFIDENCE_BELOW_THRESHOLD», «PLATFORM_NOT_MOBILE», «NO_SIGNALS», «DEVICE_TYPE_TABLET_DETECTED», «DEVICE_TYPE_WATCH_DETECTED», «DEVICE_TYPE_AMBIGUOUS» (три последних — этап 5.6, докс/09 ADR-034) — плюс коды `esim-rules`/`fuzzy-matcher`, переиспользуемые как есть) документирован в коде (`apps/api/src/modules/detection/*.ts`) и в ADR-024/ADR-034, а не повторён здесь дословно, чтобы не расходиться при последующих правках.

**Поле `detection.deviceType` (этап 5.6, докс/09 ADR-034).** Значение — `phone`/`tablet`/`watch`/`laptop`/`other` (docs/05 §5.3, тот же перечень, что и у `devices.deviceType` справочника). Определяется классификацией по сигналам (§3.2а докс/03) либо, при точном сопоставлении с записью справочника, берётся из самой записи. Поле аддитивное — клиенты, не читающие его, продолжают работать без изменений. Владелец планшета/умных часов получает адресный ответ с этим полем и соответствующим кодом `reasons[]`, а не ответ, предполагающий телефон.

## 6.3. `GET/POST /api/v1/devices/search` — определение по названию

```http
GET /api/v1/devices/search?q=айфон%2013%20про%20макс HTTP/1.1
```

Оба метода (`GET` — через query-параметр, `POST` — через то же поле в теле, §6.2 и ADR-024 п.6) принимают необязательный параметр `region` — ответ пользователя на адресный вопрос уточнения, тот же по смыслу и тем же ограничениям, что `context.region` эндпоинта `/detect` (только явный ответ пользователя, без вывода из `locale`/IP/часового пояса). Без него запись справочника с региональным условием (докс/05 §5.4) при поиске по названию так же уходит в `clarification_required` вместо статуса.

```json
{
  "requestId": "…",
  "query": { "raw": "айфон 13 про макс", "normalized": "iphone 13 pro max" },
  "status": "supported",
  "confidence": 0.98,
  "device": {
    "id": "apple-iphone-13-pro-max",
    "brand": "Apple",
    "name": "iPhone 13 Pro Max",
    "esim": { "support": "supported", "dualSim": "physical+esim", "maxProfiles": 8 }
  },
  "matches": [{ "id": "apple-iphone-13-pro-max", "name": "iPhone 13 Pro Max", "score": 0.98 }],
  "reasons": [
    { "code": "LAYOUT_OK" },
    { "code": "TRANSLITERATED", "detail": "айфон → iphone" },
    { "code": "SYNONYM_EXPANDED", "detail": "про макс → pro max" },
    { "code": "EXACT_ALIAS_MATCH", "detail": "iphone 13 pro max" }
  ],
  "presentation": { "title": "iPhone 13 Pro Max поддерживает eSIM", "…": "…" }
}
```

Поле `query.normalized` и массив `reasons` возвращаются намеренно: они делают работу алгоритма обработки ввода наблюдаемой для комиссии при контрольных испытаниях и для интегратора при отладке.

Неоднозначный запрос:

```http
GET /api/v1/devices/search?q=galaxy%20s23
```

```json
{
  "status": "clarification_required",
  "confidence": 0.55,
  "device": null,
  "matches": [
    { "id": "samsung-galaxy-s23", "name": "Galaxy S23", "score": 0.91, "esimSupport": "supported" },
    {
      "id": "samsung-galaxy-s23-plus",
      "name": "Galaxy S23+",
      "score": 0.88,
      "esimSupport": "supported"
    },
    {
      "id": "samsung-galaxy-s23-ultra",
      "name": "Galaxy S23 Ultra",
      "score": 0.88,
      "esimSupport": "supported"
    },
    {
      "id": "samsung-galaxy-s23-fe",
      "name": "Galaxy S23 FE",
      "score": 0.85,
      "esimSupport": "supported"
    }
  ],
  "reasons": [{ "code": "AMBIGUOUS_MODIFIER", "detail": "не указан модификатор линейки" }],
  "clarification": { "kind": "choose_candidate", "question": "Уточните модель", "options": ["…"] }
}
```

## 6.4. Прочие эндпоинты

| Метод и путь                                 | Назначение                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/devices/suggest?q=&limit=`      | Подсказки при вводе, пониженные пороги, до 10 вариантов                                                   |
| `GET /api/v1/devices/{id}`                   | Полная карточка устройства из справочника, включая источники                                              |
| `GET /api/v1/devices?brand=&platform=&page=` | Постраничный перечень для интерфейса выбора из каталога                                                   |
| `GET /api/v1/brands`                         | Перечень брендов для первого шага ручного выбора                                                          |
| `POST /api/v1/clarify`                       | Завершение диалога уточнения: `{ requestId, deviceId }` либо `{ requestId, answer }` → итоговый результат |
| `POST /api/v1/feedback`                      | Сообщение о неверном результате                                                                           |
| `GET /api/v1/catalog/meta`                   | Версия справочника, число записей, дата обновления — для проверки актуальности данных на стенде           |
| `GET /health/live`, `GET /health/ready`      | Проверки для оркестратора                                                                                 |
| `GET /api/docs`, `GET /api/docs-json`        | Swagger UI и спецификация OpenAPI                                                                         |
| `GET /metrics`                               | Метрики в формате Prometheus                                                                              |

**Не реализованы (проверено по коду, этап 6.2): `POST /api/v1/clarify`, `GET /api/v1/devices/{id}`, `GET /api/v1/devices`, `GET /api/v1/brands`.** Интерфейс (`apps/widget/src`, docs/09-decisions.md ADR-039) обходится без первых двух: выбор кандидата уточнения (`clarification.kind === 'choose_candidate'`, а также выбор из `candidates[]` при определённом статусе группы) отправляет `POST /api/v1/devices/search` с `q`, равным подписи выбранного варианта, вместо вызова `/clarify` с `requestId`/`deviceId` — поиск по точному названию модели детерминированно возвращает определённый статус той же формы, которую уже умеет показывать интерфейс, без обращения к `/devices/{id}` за карточкой устройства (она уже есть в ответе `/devices/search` полем `device`). Реализация оставшихся четырёх эндпоинтов остаётся объёмом дорожки API (агент, следующий за модерацией), а не интерфейса.

**`POST /api/v1/feedback` реализован этапом 7 (docs/15-moderation.md §15.2, §15.8; docs/09-decisions.md ADR-043).** Публичный эндпоинт (без `ADMIN_TOKEN`) — принимает `{ requestId, reportedStatus, deviceId?, comment, signalsSummary? }` и всегда отвечает `200 { requestId, received: true }`: обращение не получает мгновенной оценки правоты, а заводит задачу очереди модерации `user_feedback` (дедуплицируется по `requestId`). Реализация — `apps/api/src/modules/feedback`.

Форма ответа `GET /api/v1/catalog/meta` (реализация агента 3, `apps/api/src/modules/catalog`):

```json
{ "version": "a1b2c3d4e5f6", "deviceCount": 0, "updatedAt": null }
```

`version` — детерминированный хеш от содержимого справочника (не хранится отдельным полем, пока нет коллекции версий импорта — см. docs/09 ADR-022, п.4); `updatedAt` — `null` на пустом справочнике, иначе ISO-дата самой свежей записи. Эндпоинт отвечает 200 и на пустом справочнике; при незагруженном/сбойном справочнике — `CATALOG_UNAVAILABLE` (503, §6.5).

## 6.5. Формат ошибок

Единый для всех эндпоинтов:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Параметр q обязателен и должен содержать от 1 до 100 символов",
    "details": [{ "field": "q", "issue": "too_short" }],
    "requestId": "7f3c1e2a-4b5d-4c6e-9a80-1b2c3d4e5f60"
  }
}
```

| Код                      | HTTP | Когда возникает                                         | Действие интегратора                 |
| ------------------------ | ---- | ------------------------------------------------------- | ------------------------------------ |
| `VALIDATION_ERROR`       | 400  | Запрос не соответствует схеме                           | Исправить запрос по `details`        |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | Тело не в JSON                                          | Указать корректный `Content-Type`    |
| `UNAUTHORIZED`           | 401  | Отсутствует или неверен `X-Api-Key` в защищённом режиме | Проверить ключ                       |
| `FORBIDDEN_ORIGIN`       | 403  | Источник не в списке разрешённых CORS                   | Добавить домен в конфигурацию        |
| `DEVICE_NOT_FOUND`       | 404  | Запрошен неизвестный `deviceId`                         | Проверить идентификатор              |
| `REQUEST_NOT_FOUND`      | 404  | `requestId` в `/clarify` неизвестен или истёк           | Начать сценарий заново               |
| `PAYLOAD_TOO_LARGE`      | 413  | Превышен размер тела                                    | Сократить набор сигналов             |
| `RATE_LIMITED`           | 429  | Превышена частота запросов                              | Повторить через `Retry-After`        |
| `CATALOG_UNAVAILABLE`    | 503  | Справочник не загружен (сервис ещё не готов)            | Повторить; проверить `/health/ready` |
| `INTERNAL_ERROR`         | 500  | Непредвиденная ошибка                                   | Обратиться в поддержку с `requestId` |

Существенное для К4: **ситуация «устройство не удалось определить» не является ошибкой** и всегда возвращается кодом 200 со статусом `clarification_required`. Коды ошибок описывают исключительно сбои взаимодействия. Это избавляет интегратора от необходимости трактовать бизнес-результат по HTTP-коду.

## 6.6. Примеры для быстрой проверки

```bash
# Определение по названию
curl -s 'http://localhost:3000/api/v1/devices/search?q=айфон%2013' | jq

# Устойчивость к неверной раскладке
curl -s 'http://localhost:3000/api/v1/devices/search?q=Ыфьыгте%20Ы23' | jq '.query'

# Автоопределение с эмуляцией сигналов Android
curl -s -X POST http://localhost:3000/api/v1/detect \
  -H 'Content-Type: application/json' \
  -d '{"signals":{"uaData":{"platform":"Android","mobile":true,"model":"SM-S928B"}}}' | jq '.status, .device.name'

# Актуальность справочника
curl -s http://localhost:3000/api/v1/catalog/meta | jq
```

Полная коллекция примеров поставляется файлом Postman/Insomnia в `docs/postman/` и повторяется в Swagger UI как примеры запросов.

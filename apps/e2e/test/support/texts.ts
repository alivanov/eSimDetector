/**
 * Тексты, по которым тесты ищут элементы (`getByRole`/`getByText`) — литералы, а не импорт из
 * `apps/widget/src/texts.ts`/`apps/api/src/common/response/presentation.ts`: e2e-пакет проверяет
 * интерфейс как чёрный ящик через реальный HTTP/DOM, без прямой зависимости на исходники
 * приложения. При расхождении тест падает явно на конкретной строке сравнения — это и есть
 * проверка того, что фактический текст совпадает с утверждённым (docs/13-branding.md §13.5/§13.6).
 */

/** Блок `presentation` ответа API (docs/06-api-contract.md §6.2, docs/13 §13.5) — НЕ переформулируется интерфейсом. */
export const presentationTexts = {
  supportedTitle: 'Ваше устройство поддерживает eSIM',
  notSupportedTitle: 'Ваше устройство не поддерживает eSIM',
  clarificationTitle: 'Нужно уточнить модель устройства',
  continueAction: 'Подключить eSIM',
  manualSearchAction: 'Это не моё устройство',
  clarifyAction: 'Уточнить модель',
  chooseModelAction: 'Выбрать модель',
} as const;

/** `apps/widget/src/texts.ts` (docs/13 §13.6) — обвязка экранов, не входящая в `presentation`. */
export const checkScreenTexts = {
  title: 'Проверка поддержки eSIM',
  loading: 'Определяем ваше устройство…',
  manualSearchLink: 'Указать устройство вручную',
} as const;

export const manualSearchTexts = {
  fieldLabel: 'Название устройства',
  submit: 'Найти',
  suggestionsLabel: 'Варианты устройств',
} as const;

export const clarificationTexts = {
  optionsGroupLabel: 'Выберите вариант',
} as const;

export const interactionErrorTexts = {
  network: 'Не удалось связаться с сервисом. Проверьте подключение и повторите попытку.',
  retry: 'Повторить',
} as const;

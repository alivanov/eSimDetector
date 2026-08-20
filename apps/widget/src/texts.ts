/**
 * Утверждённые тексты интерфейса, кроме статусов результата (docs/13-branding.md §13.6,
 * ADR-025 п.3) — перенесены дословно. Тексты трёх статусов результата (заголовки, пояснения,
 * подписи действий) сюда НЕ входят: они приходят из блока `presentation` ответа API и не
 * переформулируются интерфейсом (docs/13 §13.5, ADR-010, docs/06 §6.2) — см. `./api/presentation.ts`.
 */

export const checkScreenTexts = {
  title: 'Проверка поддержки eSIM',
  subtitle: 'Определим ваше устройство и покажем, поддерживает ли оно eSIM.',
  loading: 'Определяем ваше устройство…',
  retry: 'Проверить снова',
  manualSearchLink: 'Указать устройство вручную',
} as const;

export const manualSearchTexts = {
  fieldLabel: 'Название устройства',
  fieldPlaceholder: 'Например: iPhone 15 Pro или Galaxy S24',
  hint: 'Введите бренд и модель. Можно писать по-русски и с опечатками.',
  submit: 'Найти',
  loading: 'Ищем устройство…',
  suggestionsLabel: 'Варианты устройств',
  noResults: 'Ничего не нашли. Проверьте написание названия.',
  tooShort: 'Введите не меньше одного символа.',
  backToAutoDetect: 'Вернуться к автоопределению',
} as const;

export const clarificationTexts = {
  optionsGroupLabel: 'Выберите вариант',
  giveUpButton: 'Не знаю — искать по названию',
} as const;

export const deviceTypeTexts = {
  labels: {
    tablet: 'Планшет',
    watch: 'Умные часы',
    phone: 'Телефон',
  },
  reasonNotices: {
    DEVICE_TYPE_WATCH_DETECTED:
      'Вы открыли страницу на умных часах. Найдите модель часов по названию.',
    DEVICE_TYPE_AMBIGUOUS:
      'Не удалось отличить iPad от компьютера Mac по данным браузера. Укажите устройство вручную.',
    PLATFORM_NOT_MOBILE: 'Похоже, вы на компьютере. Укажите телефон или планшет вручную.',
  },
} as const;

export const interactionErrorTexts = {
  network: 'Не удалось связаться с сервисом. Проверьте подключение и повторите попытку.',
  CATALOG_UNAVAILABLE: 'Сервис ещё запускается. Повторите попытку через несколько секунд.',
  RATE_LIMITED: 'Слишком много запросов. Повторите попытку через минуту.',
  other: 'Сервис временно недоступен. Повторите попытку позже.',
  retry: 'Повторить',
} as const;

export const otherCandidateOptionId = '__other__';
export const otherCandidateLabel = 'Другая модель';

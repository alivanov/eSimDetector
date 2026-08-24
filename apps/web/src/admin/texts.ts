import type { ModerationTaskKind, ModerationTaskStatus } from '@esim-detector/contracts';

/**
 * Тексты раздела `/admin` (docs/15-moderation.md §15.7) — написаны этим агентом (этап 7), не
 * прошли согласование пользователем одним проходом (ADR-025 п.3, docs/13-branding.md §13.5):
 * раздел не существовал на момент утверждения §13.5/§13.6 и остался явно оставленным
 * следующим агентом разделом «обвязка экрана» (см. `apps/web/src/debug/texts.ts`, тот же
 * прецедент для стенда отладки). Нейтральные, понятные формулировки для технического
 * специалиста (ADR-025 п.6) — не витрина для конечного пользователя устройства.
 */
export const adminTexts = {
  loginTitle: 'Модерация справочника eSIM Detector',
  tokenLabel: 'Токен администратора',
  moderatorNameLabel: 'Ваше имя (для журнала изменений)',
  loginButton: 'Войти',
  loginError: 'Неверный токен либо раздел закрыт (пустой ADMIN_TOKEN на сервере)',
  logoutButton: 'Выйти',

  tabQueue: 'Очередь задач',
  tabDevices: 'Поиск устройств',
  tabChanges: 'Журнал изменений',
  tabStats: 'Сводка справочника',
  tabHelp: 'Справка',
  tabEval: 'Стенд оценки',

  queueFilterKindLabel: 'Тип задачи',
  queueFilterStatusLabel: 'Статус',
  queueFilterAllOption: 'Все',
  queueEmpty: 'Очередь пуста.',
  queueOccurrencesColumn: 'Обращений',
  queueKindColumn: 'Тип',
  queueSummaryColumn: 'Описание',
  queueStatusColumn: 'Статус',
  queueWhenColumn: 'Когда',

  taskDetailTitle: 'Задача',
  taskDetailBack: '← К очереди',
  taskDetailSuggestionsTitle: 'Подсказки',
  taskDetailNoSuggestions: 'Подсказок нет.',
  taskDetailDeviceIdLabel: 'Идентификатор устройства для привязки',
  taskDetailReasonLabel: 'Обоснование решения (попадёт в журнал изменений)',
  taskDetailDecidedByLabel: 'Кто принял решение',
  taskDetailNoteLabel: 'Комментарий/причина',
  taskDetailEsimSupportLabel: 'Статус eSIM',
  taskDetailSourceUrlLabel: 'Ссылка на источник (без неё уровень достоверности не поднимется)',
  taskDetailSourceTitleLabel: 'Название источника',

  actionLinkModelCode: 'Привязать код к устройству',
  actionLinkScreenSignature: 'Привязать сигнатуру к устройству',
  actionConfirmQuarantine: 'Подтвердить (привязать псевдоним)',
  actionRejectQuarantine: 'Отклонить строку карантина',
  actionResolveSourceDisagreement: 'Подтвердить статус со ссылкой на источник',
  actionAcknowledgeFeedback: 'Отметить рассмотренным',
  actionReject: 'Отклонить задачу',

  resolveSuccess: 'Решение применено.',
  resolveError: 'Не удалось применить решение',

  deviceSearchLabel: 'Поиск',
  deviceSearchPlaceholder: 'Название, бренд, код или псевдоним…',
  deviceSearchButton: 'Искать',
  deviceListEmpty: 'Ничего не найдено.',
  deviceEditTitle: 'Редактирование записи',
  deviceEditStatusLabel: 'Статус eSIM',
  deviceEditNotesLabel: 'Примечание',
  deviceEditDataConfidenceLabel: 'Уровень достоверности',
  deviceEditDeviceTypeLabel: 'Тип устройства',
  deviceEditSourceUrlLabel: 'Ссылка на источник',
  deviceEditSourceTitleLabel: 'Название источника',
  deviceEditSaveButton: 'Сохранить',
  deviceEditAddAliasLabel: 'Новый псевдоним',
  deviceEditAddAliasButton: 'Добавить псевдоним',
  deviceCreateTitle: 'Создать новую запись устройства',
  deviceCreateButton: 'Создать устройство',

  changesEmpty: 'Журнал пуст.',
  changesColumnWhen: 'Когда',
  changesColumnDevice: 'Устройство',
  changesColumnAction: 'Действие',
  changesColumnField: 'Поле',
  changesColumnReason: 'Обоснование',
  changesColumnDecidedBy: 'Кто принял решение',

  statsDeviceCount: 'Устройств в справочнике',
  statsUpdatedAt: 'Обновлён',
  statsOpenTasks: 'Открытых задач в очереди',
  statsScreenSignatures: 'Сигнатур экрана в кэше',
  statsScreenSignaturesEmpty:
    'Сигнатур нет: определение на iPhone работает без сужения по геометрии экрана. Выполните «pnpm seed rebuild-signatures», затем перечитайте кэш кнопкой ниже.',
  statsByBrand: 'По брендам',
  statsByConfidence: 'По уровню достоверности',
  statsSeedTitle: 'Когда нужны команды seed',
  statsSeedBody:
    'После обычной модерации в этом разделе (привязка кода или сигнатуры, смена статуса, псевдоним) команды seed не нужны: решение применяется сразу в том же запросе. «pnpm seed load» и «pnpm seed rebuild-signatures» выполняйте только после массового переимпорта CSV с машины, где есть репозиторий — данные тогда меняются мимо /admin. После такого импорта нажмите «Перечитать кэш», чтобы API подхватил обновления без перезапуска.',
  reloadButton: 'Перечитать кэш справочника (без перезапуска)',
  reloadConfirm:
    'Перечитать кэш справочника? Это нужно после массового импорта CSV (seed load), а не после обычной модерации.',
  reloadSuccess: 'Кэш перечитан.',

  helpIntroTitle: 'Как пользоваться разделом',
  helpIntro:
    'Раздел нужен техническому специалисту: разобрать очередь пробелов в справочнике, поправить запись устройства и убедиться, что кэш актуален. Неизвестное устройство не угадываем — только привязка к существующей записи, новый псевдоним или создание устройства с источником. Уровень «verified» — только со ссылкой на вендорскую страницу.',

  helpQueueTitle: 'Очередь задач',
  helpQueueIntro:
    'Не чистите очередь пачкой: каждая запись — отдельный пробел. Список по умолчанию отсортирован по числу обращений — сначала то, что бьёт больше пользователей. Колонка «Когда» показывает последнее обращение (lastSeenAt). Примеры из живой очереди: запросы «самсунг галакси с22 ультра», «айфон 12», «хонор 90», «pixel», «sm-s918b»; сигнатура экрана «768x1024@2».',
  helpQueueUnknownModelCode:
    'Неизвестный код модели — привяжите код к существующему устройству по подсказке (например SM-S9280 → Galaxy S24 Ultra) или отклоните, если это не телефон или мусор. Без ссылки на источник код привяжется, но уровень достоверности до verified не поднимется.',
  helpQueueUnknownScreenSignature:
    'Неизвестная сигнатура экрана — часто режим «Увеличенный» на iPhone. Привяжите сигнатуру к нужной модели (пример из очереди: 768x1024@2) или отклоните.',
  helpQueueUnmatchedOrAmbiguous:
    'Запрос не сопоставлен / неоднозначный запрос — добавьте псевдоним к нужной записи или отклоните. Типичные примеры: опечатки в раскладке («ргфцуш nova 11», «samsumg galaxy s24 ultra»), слишком общие запросы («айфон», «самсунг», «pixel»), близкие модели («айфон 12», «айфон 14»).',
  helpQueueCsvQuarantine:
    'Карантин CSV — «Подтвердить» добавляет распознанное название как псевдоним к уже существующему устройству; новую модель заводите через «Создать устройство». Строку без названия можно только отклонить.',
  helpQueueSourceDisagreement:
    'Расхождение источников — выберите статус eSIM и укажите ссылку на вендорскую страницу. Без ссылки уровень не станет verified.',
  helpQueueUserFeedback:
    'Отзыв пользователя — отметьте рассмотренным; при необходимости поправьте устройство тем же запросом.',

  helpDevicesTitle: 'Поиск устройств',
  helpDevices:
    'Найдите запись по названию, бренду, коду или псевдониму. В карточке можно сменить статус eSIM, уровень достоверности, тип устройства и добавить псевдоним. «Создать устройство» — для новой модели, которой ещё нет в справочнике. Правило: verified только со ссылкой на источник; без ссылки максимум derived.',

  helpChangesTitle: 'Журнал изменений',
  helpChanges:
    'Только чтение: кто, когда, какое устройство, какое действие и обоснование. Служит для разбора ошибочных правок и демонстрации, что решения оставляют след.',

  helpStatsTitle: 'Сводка справочника',
  helpStats:
    'Число устройств, открытых задач, сигнатур экрана, разбивки по брендам и уровням достоверности. «Перечитать кэш» — после массового импорта CSV (seed load + rebuild-signatures), не после обычной модерации: точечные решения уже применены. Перед перечитыванием появится подтверждение.',

  helpEvalTitle: 'Стенд оценки',
  helpEval:
    'На вкладке «Стенд оценки» запускается прогон эталонной выборки против живого API. Нажмите «Запустить», подтвердите (прогон долгий, одновременно только один), дождитесь статуса «готов» или «ошибка» и скачайте отчёт в Markdown. Тот же прогон из репозитория: «pnpm eval».',

  evalStartButton: 'Запустить',
  evalStartConfirm:
    'Прогон стенда оценки занимает несколько минут и одновременно может идти только один. Запустить сейчас?',
  evalCurrentTitle: 'Текущий прогон',
  evalHistoryTitle: 'Прошлые прогоны',
  evalEmpty: 'Прогонов ещё не было.',
  evalStatusRunning: 'идёт',
  evalStatusCompleted: 'готов',
  evalStatusFailed: 'ошибка',
  evalProgressLabel: 'Прогресс',
  evalPhaseDetection: 'автоопределение',
  evalPhaseMatching: 'обработка ввода',
  evalColumnWhen: 'Когда',
  evalColumnStatus: 'Статус',
  evalColumnSummary: 'Сводка',
  evalColumnReport: 'Отчёт',
  evalDownloadReport: 'Скачать .md',
  evalFalsePositives: 'ложных определений',
  evalStartError: 'Не удалось запустить прогон',
  evalStartConflict: 'Прогон уже выполняется — дождитесь завершения',
  evalDownloadError: 'Не удалось скачать отчёт',
} as const;

/** Русские подписи типов задач очереди (сырой enum в UI не показываем). */
export const moderationTaskKindLabels: Readonly<Record<ModerationTaskKind, string>> = {
  unknown_model_code: 'Неизвестный код модели',
  unknown_screen_signature: 'Неизвестная сигнатура экрана',
  unmatched_query: 'Запрос не сопоставлен',
  ambiguous_query: 'Неоднозначный запрос',
  csv_quarantine: 'Карантин CSV',
  source_disagreement: 'Расхождение источников',
  user_feedback: 'Отзыв пользователя',
};

export const moderationTaskStatusLabels: Readonly<Record<ModerationTaskStatus, string>> = {
  open: 'Открыта',
  resolved: 'Решена',
  rejected: 'Отклонена',
};

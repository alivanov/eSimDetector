/**
 * Утверждённые тексты стенда отладки `/debug` (docs/13-branding.md §13.6, раздел «Стенд отладки
 * /debug») — перенесены дословно, как и `apps/widget/src/texts.ts` для остального интерфейса.
 * Поля, для которых §13.6 не задал конкретной формулировки (подписи технических полей вроде
 * `requestId`, полей формы экспорта записи), заведены минимально и нейтрально этим агентом —
 * §13.6 прямо оставляет обвязку этого экрана следующему агенту этапа 6 (см. последний абзац
 * раздела), утверждённый список покрывает только перечисленные ниже элементы.
 */
export const debugTexts = {
  pageTitle: 'Стенд отладки: разбор сигналов',
  signalsBlockTitle: 'Собранные сигналы',
  responseBlockTitle: 'Ответ сервиса',
  reasonsBlockTitle: 'Сработавшие правила',
  confidenceBlockTitle: 'Уверенность',
  presentationBlockTitle: 'Готовые формулировки',
  submitButton: 'Отправить сигналы',
  recollectButton: 'Собрать сигналы этого браузера заново',
  copyGoldenEntryButton: 'Скопировать запись для signals.golden.json',
  signalsFieldLabel: 'Сигналы в формате тела запроса /detect',
  jsonParseError: 'Введённый текст не является корректным JSON.',
} as const;

/** Не входит в §13.6 буквально — минимальные технические подписи для полей, которые не переведены. */
export const debugAuxTexts = {
  requestIdLabel: 'Идентификатор запроса',
  copyButton: 'Скопировать',
  copiedStatus: 'Скопировано',
  catalogVersionLabel: 'Версия справочника',
  catalogDeviceCountLabel: 'Устройств в справочнике',
  catalogUpdatedAtLabel: 'Обновлён',
  catalogNotAvailable: 'Недоступно',
  statusLabel: 'Статус',
  confidenceNoResponse: 'Отправьте сигналы, чтобы увидеть уверенность ответа.',
  noResponseYet: 'Отправьте сигналы, чтобы увидеть ответ сервиса.',
  noReasonsYet: 'Нет данных — отправьте сигналы.',
  reasonsEmpty: 'Правила не сработали.',
  reasonCodeColumn: 'Код',
  reasonDetailColumn: 'Деталь',
  detectionMethodLabel: 'Метод определения',
  detectionPlatformLabel: 'Платформа',
  detectionDeviceTypeLabel: 'Тип устройства',
  detectionExactModelKnownLabel: 'Точная модель известна',
  deviceBlockTitle: 'Устройство',
  candidatesBlockTitle: 'Кандидаты',
  candidatesEmpty: 'Список кандидатов пуст.',
  clarificationBlockTitle: 'Уточнение',
  clarificationKindLabel: 'Тип уточнения',
  clarificationQuestionLabel: 'Вопрос',
  clarificationOptionsLabel: 'Варианты',
  clarificationAnswerHint:
    'Ответ на вопрос уточнения передаётся только явным действием оператора (docs/06 §6.2).',
  presentationNoAction: 'Действие не предусмотрено ответом.',
  networkErrorMessage:
    'Не удалось связаться с сервисом. Проверьте подключение и повторите попытку.',
  parseErrorMessage: 'Ответ сервиса не удалось разобрать.',
  apiErrorCodeLabel: 'Код ошибки',
  apiErrorMessageLabel: 'Сообщение',
  apiErrorDetailsLabel: 'Детали',
  apiErrorDetailsFieldColumn: 'Поле',
  apiErrorDetailsIssueColumn: 'Проблема',
  goldenExportSectionTitle: 'Экспорт записи эталонной выборки',
  goldenExportUnavailable:
    'Сначала получите ответ сервиса — запись формируется из последнего ответа на `/detect`.',
  goldenExportCategoryLabel: 'Категория',
  goldenExportSourceLabel: 'Канал сбора',
  goldenExportDescriptionLabel: 'Описание устройства/браузера',
  goldenExportDescriptionPlaceholder: 'Например: iPhone 13 mini, iOS 18.5, Safari',
  goldenExportNotesLabel: 'Заметки (необязательно)',
  goldenExportExpectedTitle: 'Ожидаемый результат (expected)',
  goldenExportExpectedWarning:
    'Черновик: значения подставлены из ответа сервиса и не проверены. Перед копированием сверьте каждое поле с тем, что видите на устройстве, и с ожидаемым статусом eSIM. Если оставить черновик как есть, выборка перестанет ловить такую же ошибку.',
  goldenExportExpectedPlatformLabel: 'platform',
  goldenExportExpectedDeviceTypeLabel: 'deviceType',
  goldenExportExpectedStatusLabel: 'status',
  goldenExportExpectedExactModelKnownLabel: 'exactModelKnown',
  goldenExportExpectedDeviceIdLabel: 'deviceId',
  goldenExportPreviewTitle: 'Предпросмотр записи',
} as const;

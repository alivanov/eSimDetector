/**
 * Тексты раздела `/admin` (docs/15-moderation.md §15.7) — написаны этим агентом (этап 7), не
 * прошли согласование пользователем одним проходом (ADR-025 п.3, docs/13-branding.md §13.5):
 * раздел не существовал на момент утверждения §13.5/§13.6 и остался явно оставленным
 * следующему агенту разделом «обвязка экрана» (см. `apps/web/src/debug/texts.ts`, тот же
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

  queueFilterKindLabel: 'Тип задачи',
  queueFilterStatusLabel: 'Статус',
  queueFilterAllOption: 'Все',
  queueEmpty: 'Очередь пуста.',
  queueOccurrencesColumn: 'Обращений',
  queueKindColumn: 'Тип',
  queueSummaryColumn: 'Описание',
  queueStatusColumn: 'Статус',

  taskDetailTitle: 'Задача',
  taskDetailBack: '← К очереди',
  taskDetailSuggestionsTitle: 'Подсказки',
  taskDetailNoSuggestions: 'Подсказок нет.',
  taskDetailDeviceIdLabel: 'Идентификатор устройства для привязки',
  taskDetailReasonLabel: 'Ссылка на источник (обязательна для статуса verified)',
  taskDetailDecidedByLabel: 'Кто принял решение',
  taskDetailNoteLabel: 'Комментарий/причина',
  taskDetailEsimSupportLabel: 'Статус eSIM',
  taskDetailSourceUrlLabel: 'Ссылка на источник',
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
  changesColumnReason: 'Источник',
  changesColumnDecidedBy: 'Кто принял решение',

  statsDeviceCount: 'Устройств в справочнике',
  statsUpdatedAt: 'Обновлён',
  statsOpenTasks: 'Открытых задач в очереди',
  statsByBrand: 'По брендам',
  statsByConfidence: 'По уровню достоверности',
  reloadButton: 'Перечитать кэш справочника (без перезапуска)',
  reloadSuccess: 'Кэш перечитан.',
} as const;

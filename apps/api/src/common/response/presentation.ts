import type { ResultStatus } from '@esim-detector/contracts';

/**
 * Русскоязычные формулировки для блока `presentation` (docs/06-api-contract.md, §6.2:
 * «заказчик, интегрирующий только API без нашего виджета, получает согласованные и
 * проверенные тексты»). Ровно три статуса результата (.cursor/rules/api-boundaries.mdc) —
 * формулировки собраны здесь один раз и переиспользуются `detection` и `matching`.
 *
 * Требование `.cursor/rules/ui-and-widget.mdc`: формулировки статуса результата не содержат
 * слов «возможно», «вероятно», «скорее всего» — результат обязан быть однозначным.
 */
export type PresentationActionKind = 'continue' | 'clarify' | 'manual_search';

export interface PresentationAction {
  readonly label: string;
  readonly kind: PresentationActionKind;
}

export interface Presentation {
  readonly title: string;
  readonly description: string;
  readonly primaryAction?: PresentationAction;
  readonly secondaryAction?: PresentationAction;
}

export interface PresentationInput {
  readonly status: ResultStatus;
  /** Отображаемое имя устройства либо группы (`"iPhone"`), если известно. */
  readonly deviceName?: string;
  readonly exactModelKnown: boolean;
  /** Готовый текст вопроса уточнения (используется вместо текста по умолчанию, если задан). */
  readonly clarificationQuestion?: string;
}

function buildSupportedPresentation(input: PresentationInput): Presentation {
  const description =
    input.deviceName === undefined
      ? 'Ваше устройство поддерживает eSIM.'
      : input.exactModelKnown
        ? `${input.deviceName} может использовать eSIM вместе с физической SIM-картой.`
        : `Мы определили, что у вас ${input.deviceName} — эта группа моделей поддерживает eSIM.`;

  return {
    title: 'Ваше устройство поддерживает eSIM',
    description,
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
    secondaryAction: input.exactModelKnown
      ? { label: 'Это не моё устройство', kind: 'manual_search' }
      : { label: 'Уточнить модель', kind: 'clarify' },
  };
}

function buildNotSupportedPresentation(input: PresentationInput): Presentation {
  return {
    title: 'Ваше устройство не поддерживает eSIM',
    description:
      input.deviceName === undefined
        ? 'Ваше устройство не поддерживает технологию eSIM.'
        : `${input.deviceName} не поддерживает технологию eSIM.`,
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  };
}

function buildClarificationPresentation(input: PresentationInput): Presentation {
  return {
    title: 'Нужно уточнить модель устройства',
    description:
      input.clarificationQuestion ??
      'Не удалось однозначно определить статус eSIM для вашего устройства. Уточните модель.',
    primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
  };
}

export function buildPresentation(input: PresentationInput): Presentation {
  switch (input.status) {
    case 'supported':
      return buildSupportedPresentation(input);
    case 'not_supported':
      return buildNotSupportedPresentation(input);
    case 'clarification_required':
      return buildClarificationPresentation(input);
  }
}

import type { Clarification } from './clarification';
import type { DeviceCard } from './device-card';
import type { ResultStatus } from './enums';
import type { Presentation } from './presentation';

/**
 * Презентация однозначного результата по карточке, выбранной после явного выбора кандидата
 * (`GET /devices/{id}`). Тексты совпадают с `buildPresentation` сервера для `exactModelKnown: true`
 * (docs/06 §6.2, docs/13 §13.5) — клиент строит их здесь, потому что карточка каталога блок
 * `presentation` не отдаёт.
 */
export function buildExactModelPresentation(
  status: 'supported' | 'not_supported',
  deviceName: string,
): Presentation {
  if (status === 'supported') {
    return {
      title: 'Ваше устройство поддерживает eSIM',
      description: `${deviceName} может использовать eSIM вместе с физической SIM-картой.`,
      primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
      secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
    };
  }
  return {
    title: 'Ваше устройство не поддерживает eSIM',
    description: `${deviceName} не поддерживает технологию eSIM.`,
    secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
  };
}

export interface DeviceCardResultView {
  readonly status: ResultStatus;
  readonly presentation: Presentation;
  readonly clarification: Clarification | undefined;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly confidence: number;
}

/**
 * Карточка → экран результата после выбора из списка кандидатов. `supported`/`not_supported` —
 * сразу итог; `conditional` — `clarification_required` с вопросом из карточки (тот же сценарий,
 * что дал бы `/devices/search` по более длинному названию вроде «iPhone XS Max»).
 */
export function resultViewFromDeviceCard(card: DeviceCard): DeviceCardResultView {
  const { esim, name, id } = card;
  if (esim.support === 'supported' || esim.support === 'not_supported') {
    return {
      status: esim.support,
      presentation: buildExactModelPresentation(esim.support, name),
      clarification: undefined,
      deviceId: id,
      deviceName: name,
      confidence: 1,
    };
  }

  const clarification = esim.clarifyingQuestion ?? undefined;
  return {
    status: 'clarification_required',
    presentation: {
      title: 'Нужно уточнить модель устройства',
      description:
        clarification?.question ??
        'Не удалось однозначно определить статус eSIM для вашего устройства. Уточните модель.',
      primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
    },
    clarification,
    deviceId: id,
    deviceName: name,
    confidence: 1,
  };
}

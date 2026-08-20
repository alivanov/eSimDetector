import { isNonEmptyString, isRecord } from './predicates';

/**
 * Блок `presentation` (docs/06-api-contract.md §6.2/§6.3, docs/13-branding.md §13.5). Тексты
 * приходят из ответа API дословно и не переформулируются интерфейсом — клиент только разбирает
 * форму и отображает поля как есть.
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

const PRESENTATION_ACTION_KINDS: readonly PresentationActionKind[] = [
  'continue',
  'clarify',
  'manual_search',
];
const PRESENTATION_ACTION_KINDS_SET: ReadonlySet<string> = new Set(PRESENTATION_ACTION_KINDS);

function isPresentationActionKind(value: unknown): value is PresentationActionKind {
  return typeof value === 'string' && PRESENTATION_ACTION_KINDS_SET.has(value);
}

function parseAction(value: unknown): PresentationAction | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { label, kind } = value;
  if (!isNonEmptyString(label) || !isPresentationActionKind(kind)) {
    return undefined;
  }
  return { label, kind };
}

/**
 * Разбор блока `presentation`. Действие считается отсутствующим, если поле отсутствует в ответе
 * ИЛИ имеет неразобранную форму — во втором случае интерфейс просто не показывает кнопку вместо
 * падения всего разбора ответа: заголовок и описание важнее одной необязательной кнопки.
 */
export function parsePresentation(value: unknown): Presentation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { title, description, primaryAction, secondaryAction } = value;
  if (!isNonEmptyString(title) || !isNonEmptyString(description)) {
    return undefined;
  }
  const parsedPrimary = parseAction(primaryAction);
  const parsedSecondary = parseAction(secondaryAction);
  return {
    title,
    description,
    ...(parsedPrimary !== undefined ? { primaryAction: parsedPrimary } : {}),
    ...(parsedSecondary !== undefined ? { secondaryAction: parsedSecondary } : {}),
  };
}

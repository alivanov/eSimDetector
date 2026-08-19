import type { Device, EsimClarifyingQuestion } from '@esim-detector/contracts';

import type { Clarification } from '../../../common/response';

/**
 * Уточнение ветки iOS, когда статус группы кандидатов не согласован (docs/03-detection-algorithm.md,
 * §3.7; docs/09-decisions.md ADR-030 «Последствия», закрыто этапом 5.3а). По умолчанию — выбор из
 * моделей (сценарий 1, «Уточните модель»): различие между кандидатами в общем случае лежит в
 * названии, и адресный вопрос об этом ничего не сообщает. Но когда причина расхождения ОДНА и ТА ЖЕ
 * у ВСЕХ кандидатов — одно и то же нерешённое условие `esim.conditions` (регион/версия ОС, ADR-007) —
 * список моделей вводит пользователя в заблуждение о природе вопроса: iPhone 15 не может сказать,
 * какая перед ним модель, но записи справочника уже знают точный вопрос, разрешающий статус.
 * Условие применения адресного вопроса — строго все кандидаты согласны и по `scope`, и по
 * буквальному тексту вопроса; если хотя бы один кандидат без условия (пример — iPhone 17e в группе
 * `390×844@3`) либо вопросы расходятся, остаётся выбор из списка, как и было.
 */
export function buildIosClarification(candidates: readonly Device[]): Clarification {
  if (candidates.length === 0) {
    return {
      kind: 'manual_input',
      question: 'Не удалось определить модель iPhone. Введите модель вручную.',
    };
  }

  const sharedQuestion = findSharedClarifyingQuestion(candidates);
  if (sharedQuestion !== undefined) {
    return {
      kind: 'answer_question',
      question: sharedQuestion.question,
      options: sharedQuestion.options.map((option) => ({ id: option.value, label: option.label })),
    };
  }

  return {
    kind: 'choose_candidate',
    question: 'Уточните модель вашего iPhone',
    options: [
      ...candidates.map((device) => ({ id: device._id, label: device.displayName })),
      { id: '__other__', label: 'Другая модель' },
    ],
  };
}

/**
 * Вопрос, общий для ВСЕХ кандидатов группы, либо `undefined`, если хотя бы один кандидат не
 * подходит: у него нет условий, условия покрывают более одного `scope`, либо буквальный вопрос
 * отличается от вопроса остальных кандидатов. Экспортирована отдельно для модульного тестирования
 * без сборки полного `Clarification` (правило проекта — покрывать чистые функции тестами
 * самостоятельно, а не только через сервис, который их вызывает).
 */
export function findSharedClarifyingQuestion(
  candidates: readonly Device[],
): EsimClarifyingQuestion | undefined {
  let shared: EsimClarifyingQuestion | undefined;

  for (const candidate of candidates) {
    const { conditions, clarifyingQuestion } = candidate.esim;
    if (conditions.length === 0 || clarifyingQuestion === null) {
      return undefined;
    }

    const scopes = new Set(conditions.map((condition) => condition.scope));
    if (scopes.size !== 1) {
      // Один кандидат сам по себе смешивает несколько scope — данные это допускают (docs/05 §5.4),
      // но тогда у него нет ОДНОГО вопроса, покрывающего все его условия целиком.
      return undefined;
    }

    if (shared === undefined) {
      shared = clarifyingQuestion;
      continue;
    }
    if (!areQuestionsEqual(shared, clarifyingQuestion)) {
      return undefined;
    }
  }

  return shared;
}

function areQuestionsEqual(a: EsimClarifyingQuestion, b: EsimClarifyingQuestion): boolean {
  if (a.kind !== b.kind || a.question !== b.question || a.options.length !== b.options.length) {
    return false;
  }
  return a.options.every((option, index) => {
    const other = b.options[index];
    return other !== undefined && other.value === option.value && other.label === option.label;
  });
}

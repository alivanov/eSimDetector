import type { EsimInfo } from '@esim-detector/contracts';

import { resolveCandidateGroupEsimStatus } from './group-consensus';
import type { EsimResolvableDevice } from './resolve-device-esim-status';

function esimWithSupport(support: 'supported' | 'not_supported'): EsimInfo {
  return {
    support,
    dualSim: 'physical+esim',
    maxProfiles: 2,
    conditions: [],
    clarifyingQuestion: null,
    notes: '',
  };
}

function candidate(support: 'supported' | 'not_supported'): EsimResolvableDevice {
  return { esim: esimWithSupport(support), dataConfidence: 'verified' };
}

describe('resolveCandidateGroupEsimStatus', () => {
  it('несколько кандидатов с ОДИНАКОВЫМ статусом — однозначный ответ, exactModelKnown: false (ADR-002)', () => {
    const result = resolveCandidateGroupEsimStatus([
      candidate('supported'),
      candidate('supported'),
    ]);

    expect(result.status).toBe('supported');
    expect(result.exactModelKnown).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDIDATES_AGREE_ON_ESIM');
  });

  it('единственный кандидат — статус известен, exactModelKnown: true', () => {
    const result = resolveCandidateGroupEsimStatus([candidate('supported')]);

    expect(result.status).toBe('supported');
    expect(result.exactModelKnown).toBe(true);
  });

  it('кандидаты с РАЗНЫМ статусом — уточнение, exactModelKnown: false', () => {
    const result = resolveCandidateGroupEsimStatus([
      candidate('supported'),
      candidate('not_supported'),
    ]);

    expect(result.status).toBe('clarification_required');
    expect(result.exactModelKnown).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDIDATES_DISAGREE_ON_ESIM');
  });

  it('ВСЕ кандидаты по отдельности уходят в уточнение (unverified) — уточнение с кодом "согласны, что нужно уточнение" (ADR-045)', () => {
    const bothUnverified: EsimResolvableDevice[] = [
      { esim: esimWithSupport('supported'), dataConfidence: 'unverified' },
      { esim: esimWithSupport('not_supported'), dataConfidence: 'unverified' },
    ];

    const result = resolveCandidateGroupEsimStatus(bothUnverified);

    expect(result.status).toBe('clarification_required');
    // Статус eSIM в ответе один и тот же у всех кандидатов, поэтому утверждать «статус
    // расходится» было бы неверным объяснением верного результата (ADR-010).
    expect(result.reasons[0]?.code).toBe('CANDIDATES_AGREE_ON_CLARIFICATION');
    expect(result.exactModelKnown).toBe(false);
  });

  it('все кандидаты conditional с одним нерешённым условием по региону — согласие на уточнение, а не расхождение', () => {
    // Живой случай контура: сигнатура 393x852@3 — iPhone 14 Pro / 15 / 15 Pro, у всех одно и то
    // же условие «версия для материкового Китая». Именно согласие кандидатов позволяет детекции
    // задать один общий вопрос вместо выбора из списка (docs/03 §3.7 п.2).
    const conditionalChinaVariant: EsimResolvableDevice = {
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР' },
        ],
        clarifyingQuestion: {
          kind: 'region',
          question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
          options: [
            { value: 'CN', label: 'Две nano-SIM' },
            { value: 'OTHER', label: 'Одну nano-SIM' },
          ],
        },
        notes: '',
      },
      dataConfidence: 'verified',
    };

    const result = resolveCandidateGroupEsimStatus([
      conditionalChinaVariant,
      conditionalChinaVariant,
      conditionalChinaVariant,
    ]);

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('CANDIDATES_AGREE_ON_CLARIFICATION');
    expect(result.reasons[0]?.detail).toBe('3 кандидат(ов), всем требуется уточнение');
  });

  it('регион, известный из контекста, снимает уточнение у согласной группы conditional', () => {
    // Обратная сторона предыдущего теста: код «согласны на уточнение» появляется именно из-за
    // НЕХВАТКИ контекста, а не из-за самого статуса `conditional`.
    const conditionalChinaVariant: EsimResolvableDevice = {
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР' },
        ],
        clarifyingQuestion: null,
        notes: '',
      },
      dataConfidence: 'verified',
    };

    const result = resolveCandidateGroupEsimStatus(
      [conditionalChinaVariant, conditionalChinaVariant],
      { region: 'CN' },
    );

    expect(result.status).toBe('not_supported');
    expect(result.reasons[0]?.code).toBe('CANDIDATES_AGREE_ON_ESIM');
  });

  it('пустой список кандидатов — уточнение (защитная ветка)', () => {
    const result = resolveCandidateGroupEsimStatus([]);

    expect(result.status).toBe('clarification_required');
    expect(result.exactModelKnown).toBe(false);
  });

  it('один из кандидатов сам по себе уходит в уточнение (unverified) — итог: уточнение', () => {
    const unverifiedCandidate: EsimResolvableDevice = {
      esim: esimWithSupport('supported'),
      dataConfidence: 'unverified',
    };

    const result = resolveCandidateGroupEsimStatus([candidate('supported'), unverifiedCandidate]);

    expect(result.status).toBe('clarification_required');
  });
});

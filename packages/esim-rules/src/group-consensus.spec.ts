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

  it('ВСЕ кандидаты по отдельности уходят в уточнение (unverified) — итог: тоже уточнение, не "согласие"', () => {
    const bothUnverified: EsimResolvableDevice[] = [
      { esim: esimWithSupport('supported'), dataConfidence: 'unverified' },
      { esim: esimWithSupport('not_supported'), dataConfidence: 'unverified' },
    ];

    const result = resolveCandidateGroupEsimStatus(bothUnverified);

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('CANDIDATES_DISAGREE_ON_ESIM');
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

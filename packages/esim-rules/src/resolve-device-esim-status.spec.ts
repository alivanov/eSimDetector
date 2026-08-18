import type { CatalogAnswerPolicy, EsimInfo } from '@esim-detector/contracts';

import { resolveDeviceEsimStatus, type EsimResolvableDevice } from './resolve-device-esim-status';

const supportedEsim: EsimInfo = {
  support: 'supported',
  dualSim: 'physical+esim',
  maxProfiles: 2,
  conditions: [],
  clarifyingQuestion: null,
  notes: '',
};

const conditionalEsim: EsimInfo = {
  support: 'conditional',
  dualSim: 'physical+esim',
  maxProfiles: 2,
  conditions: [{ scope: 'region', value: 'CN', support: 'not_supported', note: '...' }],
  clarifyingQuestion: {
    kind: 'region',
    question: 'Устройство приобретено в Китае?',
    options: [
      { value: 'yes', label: 'Да' },
      { value: 'no', label: 'Нет' },
    ],
  },
  notes: '',
};

function device(overrides: Partial<EsimResolvableDevice> = {}): EsimResolvableDevice {
  return { esim: supportedEsim, dataConfidence: 'verified', ...overrides };
}

describe('resolveDeviceEsimStatus', () => {
  it('запись supported+verified — однозначный ответ', () => {
    const result = resolveDeviceEsimStatus(device());

    expect(result.status).toBe('supported');
    expect(result.clarification).toBeUndefined();
  });

  it('conditional запись, регион неизвестен — уточнение с clarifyingQuestion из записи', () => {
    const result = resolveDeviceEsimStatus(device({ esim: conditionalEsim }));

    expect(result.status).toBe('clarification_required');
    expect(result.clarification).toEqual(conditionalEsim.clarifyingQuestion);
  });

  it('conditional запись, регион совпадает с условием — однозначный ответ без clarification', () => {
    const result = resolveDeviceEsimStatus(device({ esim: conditionalEsim }), { region: 'CN' });

    expect(result.status).toBe('not_supported');
    expect(result.clarification).toBeUndefined();
  });

  it('conditional запись без clarifyingQuestion (нарушение данных), регион неизвестен — уточнение без поля clarification', () => {
    const brokenConditional: EsimInfo = { ...conditionalEsim, clarifyingQuestion: null };

    const result = resolveDeviceEsimStatus(device({ esim: brokenConditional }));

    expect(result.status).toBe('clarification_required');
    expect(result.clarification).toBeUndefined();
  });

  it('unverified запись при выключенном ALLOW_UNVERIFIED_CATALOG_ANSWERS — уточнение БЕЗ clarifyingQuestion устройства', () => {
    const result = resolveDeviceEsimStatus(device({ dataConfidence: 'unverified' }));

    expect(result.status).toBe('clarification_required');
    expect(result.clarification).toBeUndefined();
    expect(
      result.reasons.some((reason) => reason.code === 'CATALOG_ENTRY_UNVERIFIED_BLOCKED'),
    ).toBe(true);
  });

  it('derived запись при выключенной политике derived-ответов — уточнение', () => {
    const policy: CatalogAnswerPolicy = {
      allowDerivedCatalogAnswers: false,
      allowUnverifiedCatalogAnswers: false,
    };

    const result = resolveDeviceEsimStatus(device({ dataConfidence: 'derived' }), {}, policy);

    expect(result.status).toBe('clarification_required');
  });

  it('reasons включают и объяснение условий, и объяснение гейта достоверности', () => {
    const result = resolveDeviceEsimStatus(device({ dataConfidence: 'derived' }));

    const codes = result.reasons.map((reason) => reason.code);
    expect(codes).toContain('ESIM_STATUS_DIRECT');
    expect(codes).toContain('CATALOG_ENTRY_DERIVED');
  });
});

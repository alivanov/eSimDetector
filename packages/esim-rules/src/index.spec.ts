import {
  applyDataConfidenceGate,
  DEFAULT_CATALOG_ANSWER_POLICY,
  resolveAppleGenerationRule,
  resolveCandidateGroupEsimStatus,
  resolveDeviceEsimStatus,
  resolveEsimConditions,
  resolveFamilyRuleEsimStatus,
  type EsimResolutionContext,
  type EsimResolvableDevice,
} from './index';

describe('index — публичная поверхность пакета esim-rules', () => {
  const device: EsimResolvableDevice = {
    esim: {
      support: 'supported',
      dualSim: 'physical+esim',
      maxProfiles: 2,
      conditions: [],
      clarifyingQuestion: null,
      notes: '',
    },
    dataConfidence: 'verified',
  };

  it('реэкспортирует правило Apple', () => {
    expect(
      resolveAppleGenerationRule({ family: 'iphone-xr', generation: null, modifiers: [] }).support,
    ).toBe('supported');
  });

  it('реэкспортирует разрешение условий', () => {
    expect(resolveEsimConditions(device.esim).status).toBe('supported');
  });

  it('реэкспортирует гейт достоверности данных', () => {
    expect(applyDataConfidenceGate('supported', 'verified').status).toBe('supported');
  });

  it('реэкспортирует правило уровня линейки', () => {
    const result = resolveFamilyRuleEsimStatus({
      brand: 'xiaomi',
      family: 'redmi-a',
      status: 'mixed',
      dataConfidence: 'derived',
      recordCount: 5,
      moderatorConfirmed: false,
    });

    expect(result.status).toBe('clarification_required');
  });

  it('реэкспортирует главную функцию вывода статуса', () => {
    expect(resolveDeviceEsimStatus(device).status).toBe('supported');
  });

  it('реэкспортирует согласие кандидатов группы', () => {
    expect(resolveCandidateGroupEsimStatus([device]).exactModelKnown).toBe(true);
  });

  it('реэкспортирует типы/константы контракта', () => {
    const context: EsimResolutionContext = { region: 'RU' };
    expect(context.region).toBe('RU');
    expect(DEFAULT_CATALOG_ANSWER_POLICY.allowUnverifiedCatalogAnswers).toBe(false);
  });
});

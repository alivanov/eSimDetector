import type { CatalogAnswerPolicy } from '@esim-detector/contracts';
import { DEFAULT_CATALOG_ANSWER_POLICY } from '@esim-detector/contracts';

import { applyDataConfidenceGate } from './confidence-gate';

describe('applyDataConfidenceGate', () => {
  it('verified — статус проходит без изменений', () => {
    const result = applyDataConfidenceGate('supported', 'verified');

    expect(result.status).toBe('supported');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_VERIFIED');
  });

  it('derived при включённом ALLOW_DERIVED_CATALOG_ANSWERS (по умолчанию) — статус проходит', () => {
    const result = applyDataConfidenceGate('supported', 'derived', DEFAULT_CATALOG_ANSWER_POLICY);

    expect(result.status).toBe('supported');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_DERIVED');
  });

  it('derived при выключенном ALLOW_DERIVED_CATALOG_ANSWERS — уточнение', () => {
    const policy: CatalogAnswerPolicy = {
      allowDerivedCatalogAnswers: false,
      allowUnverifiedCatalogAnswers: false,
    };

    const result = applyDataConfidenceGate('supported', 'derived', policy);

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_DERIVED_BLOCKED');
  });

  it('unverified при выключенном ALLOW_UNVERIFIED_CATALOG_ANSWERS (по умолчанию) — устройство определено, статуса нет', () => {
    const result = applyDataConfidenceGate(
      'supported',
      'unverified',
      DEFAULT_CATALOG_ANSWER_POLICY,
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_UNVERIFIED_BLOCKED');
  });

  it('unverified при явно включённом ALLOW_UNVERIFIED_CATALOG_ANSWERS — статус проходит', () => {
    const policy: CatalogAnswerPolicy = {
      allowDerivedCatalogAnswers: true,
      allowUnverifiedCatalogAnswers: true,
    };

    const result = applyDataConfidenceGate('not_supported', 'unverified', policy);

    expect(result.status).toBe('not_supported');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_UNVERIFIED');
  });

  it('quarantined — защитная ветка, всегда уточнение независимо от политики', () => {
    const policy: CatalogAnswerPolicy = {
      allowDerivedCatalogAnswers: true,
      allowUnverifiedCatalogAnswers: true,
    };

    const result = applyDataConfidenceGate('supported', 'quarantined', policy);

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('CATALOG_ENTRY_QUARANTINED_BLOCKED');
  });

  it('использует DEFAULT_CATALOG_ANSWER_POLICY, когда политика не передана явно', () => {
    const result = applyDataConfidenceGate('supported', 'unverified');

    expect(result.status).toBe('clarification_required');
  });
});

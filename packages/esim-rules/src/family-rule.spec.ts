import type { FamilyEsimRule } from './family-rule';
import { resolveFamilyRuleEsimStatus } from './family-rule';

function buildRule(overrides: Partial<FamilyEsimRule> = {}): FamilyEsimRule {
  return {
    brand: 'xiaomi',
    family: 'redmi-a',
    status: 'not_supported',
    dataConfidence: 'derived',
    recordCount: 12,
    moderatorConfirmed: false,
    ...overrides,
  };
}

describe('resolveFamilyRuleEsimStatus', () => {
  it('статус "mixed" — всегда уточнение (ADR-021)', () => {
    const result = resolveFamilyRuleEsimStatus(buildRule({ status: 'mixed' }));

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('FAMILY_RULE_MIXED');
  });

  it('"not_supported" без подтверждения модератора — уточнение, а НЕ not_supported (ADR-021)', () => {
    const result = resolveFamilyRuleEsimStatus(
      buildRule({ status: 'not_supported', moderatorConfirmed: false }),
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons[0]?.code).toBe('FAMILY_RULE_NOT_SUPPORTED_UNCONFIRMED');
  });

  it('"not_supported" ПОДТВЕРЖДЁННЫЙ модератором — даёт not_supported (при достаточной достоверности)', () => {
    const result = resolveFamilyRuleEsimStatus(
      buildRule({ status: 'not_supported', moderatorConfirmed: true, dataConfidence: 'verified' }),
    );

    expect(result.status).toBe('not_supported');
    expect(result.reasons.some((reason) => reason.code === 'FAMILY_RULE_APPLIED')).toBe(true);
  });

  it('"supported" применяет гейт достоверности данных (derived разрешён по умолчанию)', () => {
    const result = resolveFamilyRuleEsimStatus(
      buildRule({ status: 'supported', dataConfidence: 'derived' }),
    );

    expect(result.status).toBe('supported');
  });

  it('"supported" уровня unverified при выключенном ALLOW_UNVERIFIED_CATALOG_ANSWERS — уточнение', () => {
    const result = resolveFamilyRuleEsimStatus(
      buildRule({ status: 'supported', dataConfidence: 'unverified' }),
    );

    expect(result.status).toBe('clarification_required');
  });
});

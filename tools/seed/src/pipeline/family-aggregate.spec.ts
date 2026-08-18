import { computeFamilyAggregates, type FamilyAggregateInput } from './family-aggregate';

function device(overrides: Partial<FamilyAggregateInput>): FamilyAggregateInput {
  return {
    brand: 'xiaomi',
    family: 'redmi-a',
    esimSupport: 'not_supported',
    dataConfidence: 'derived',
    ...overrides,
  };
}

describe('computeFamilyAggregates', () => {
  it('не строит правило, если записей меньше порога', () => {
    const result = computeFamilyAggregates([device({}), device({})], 3);
    expect(result).toEqual([]);
  });

  it('строит правило "not_supported" при согласии всех записей линейки', () => {
    const result = computeFamilyAggregates([device({}), device({}), device({})], 3);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toEqual(
      expect.objectContaining({
        brand: 'xiaomi',
        family: 'redmi-a',
        status: 'not_supported',
        recordCount: 3,
        moderatorConfirmed: false,
      }),
    );
    // Без подтверждения модератора not_supported не даёт ответа пользователю (ADR-021).
    expect(result[0]?.resolution.status).toBe('clarification_required');
  });

  it('строит "mixed" при расхождении статусов в линейке', () => {
    const result = computeFamilyAggregates(
      [device({ esimSupport: 'supported' }), device({}), device({})],
      3,
    );
    expect(result[0]?.rule.status).toBe('mixed');
    expect(result[0]?.resolution.status).toBe('clarification_required');
  });

  it('игнорирует записи уровня "unverified" при подсчёте порога', () => {
    const result = computeFamilyAggregates(
      [device({}), device({}), device({ dataConfidence: 'unverified' })],
      3,
    );
    expect(result).toEqual([]);
  });

  it('достоверность агрегата не выше достоверности входящих записей', () => {
    const result = computeFamilyAggregates(
      [device({ dataConfidence: 'verified' }), device({ dataConfidence: 'derived' }), device({})],
      3,
    );
    expect(result[0]?.rule.dataConfidence).toBe('derived');
  });

  it('подтверждение модератором позволяет правилу дать not_supported', () => {
    const result = computeFamilyAggregates(
      [device({}), device({}), device({})],
      3,
      new Set(['xiaomi|redmi-a']),
    );
    expect(result[0]?.rule.moderatorConfirmed).toBe(true);
    expect(result[0]?.resolution.status).toBe('not_supported');
  });

  it('разные линейки агрегируются отдельно', () => {
    const result = computeFamilyAggregates(
      [
        device({ brand: 'xiaomi', family: 'redmi-a' }),
        device({ brand: 'xiaomi', family: 'redmi-a' }),
        device({ brand: 'xiaomi', family: 'redmi-a' }),
        device({ brand: 'samsung', family: 'galaxy-m', esimSupport: 'supported' }),
        device({ brand: 'samsung', family: 'galaxy-m', esimSupport: 'supported' }),
        device({ brand: 'samsung', family: 'galaxy-m', esimSupport: 'supported' }),
      ],
      3,
    );
    expect(result).toHaveLength(2);
  });
});

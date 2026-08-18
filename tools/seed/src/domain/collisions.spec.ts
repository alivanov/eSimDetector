import { resolveCollisions } from './collisions';
import type { DeviceCandidate } from './types';

function candidate(overrides: Partial<DeviceCandidate>): DeviceCandidate {
  return {
    id: 'samsung-galaxy-s21',
    brand: 'samsung',
    brandTitle: 'Samsung',
    marketingName: 'Galaxy S21',
    family: 'galaxy-s',
    generation: 21,
    modifiers: [],
    modelCodes: ['SM-G991B'],
    platform: 'android',
    deviceType: 'phone',
    releaseYear: 2021,
    esimSupport: 'yes',
    esimConditions: [],
    provenance: {
      source: 'llm:test-model',
      batchId: '02-samsung-galaxy-s',
      importedAt: new Date('2026-08-18'),
      lineNumber: 2,
    },
    ...overrides,
  };
}

describe('resolveCollisions', () => {
  it('пропускает кандидатов без коллизий без изменений', () => {
    const candidates = [
      candidate({}),
      candidate({ id: 'samsung-galaxy-s22', modelCodes: ['SM-S901B'] }),
    ];
    const result = resolveCollisions(candidates);
    expect(result.accepted).toEqual(candidates);
    expect(result.quarantined).toEqual([]);
  });

  it('сливает дубликаты идентификатора с одинаковым статусом eSIM, объединяя коды', () => {
    const candidates = [
      candidate({ marketingName: 'Galaxy S21' }),
      candidate({ marketingName: 'Galaxy S21 5G', modelCodes: ['SM-G991U'] }),
    ];
    const result = resolveCollisions(candidates);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.modelCodes).toEqual(['SM-G991B', 'SM-G991U']);
    expect(result.quarantined).toEqual([]);
  });

  it('карантинит обе строки при расхождении статуса eSIM у одного идентификатора (NAME_COLLISION_CONFLICT)', () => {
    const candidates = [candidate({ esimSupport: 'yes' }), candidate({ esimSupport: 'no' })];
    const result = resolveCollisions(candidates);
    expect(result.accepted).toEqual([]);
    expect(result.quarantined).toHaveLength(2);
    expect(result.quarantined.every((entry) => entry.code === 'NAME_COLLISION_CONFLICT')).toBe(
      true,
    );
  });

  it('карантинит устройства с одинаковым сервисным кодом у разных идентификаторов (CODE_COLLISION)', () => {
    const candidates = [
      candidate({
        id: 'samsung-galaxy-a21',
        marketingName: 'Galaxy A21',
        modelCodes: ['SM-A217F'],
      }),
      candidate({
        id: 'samsung-galaxy-a21s',
        marketingName: 'Galaxy A21s',
        modelCodes: ['SM-A217F'],
      }),
      candidate({
        id: 'samsung-galaxy-s22',
        marketingName: 'Galaxy S22',
        modelCodes: ['SM-S901B'],
      }),
    ];
    const result = resolveCollisions(candidates);
    expect(result.accepted).toEqual([candidates[2]]);
    expect(result.quarantined).toHaveLength(2);
    expect(result.quarantined.every((entry) => entry.code === 'CODE_COLLISION')).toBe(true);
  });
});

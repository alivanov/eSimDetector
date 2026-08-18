import type { DeviceCandidate } from '../domain/types';
import { resolveConsensus } from './consensus';

function candidate(overrides: Partial<DeviceCandidate> = {}): DeviceCandidate {
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
      source: 'llm:model-a',
      batchId: '02-samsung-galaxy-s',
      importedAt: new Date('2026-08-18'),
      lineNumber: 2,
    },
    ...overrides,
  };
}

function fromSource(source: string, overrides: Partial<DeviceCandidate> = {}): DeviceCandidate {
  return candidate({
    provenance: { ...candidate().provenance, source },
    ...overrides,
  });
}

describe('resolveConsensus', () => {
  it('источники согласны — статус принимается уровнем "unanimous"', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes' }),
      fromSource('llm:model-b', { esimSupport: 'yes' }),
      fromSource('llm:model-c', { esimSupport: 'yes' }),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toEqual(
      expect.objectContaining({ esimSupport: 'yes', outcome: 'unanimous', agreementCount: 3 }),
    );
    expect(result.quarantined).toEqual([]);
  });

  it('"unknown" — воздержание, не участвует в сравнении', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes' }),
      fromSource('llm:model-b', { esimSupport: 'unknown' }),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toEqual(
      expect.objectContaining({ esimSupport: 'yes', outcome: 'single-source', agreementCount: 1 }),
    );
  });

  it('устройство без данных ни от одного источника не карантинится, а просто не попадает в вывод', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'unknown' }),
      fromSource('llm:model-b', { esimSupport: 'unknown' }),
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.quarantined).toEqual([]);
    expect(result.noDataCount).toBe(1);
  });

  it('единственный источник даёт уровень "single-source" (позже — unverified)', () => {
    const result = resolveConsensus([fromSource('llm:model-a', { esimSupport: 'no' })]);
    expect(result.accepted[0]).toEqual(
      expect.objectContaining({ esimSupport: 'no', outcome: 'single-source', agreementCount: 1 }),
    );
  });

  it('"conditional" перекрывает "yes" и "no" (правило осторожности) и заводит source_disagreement', () => {
    const conditions = [
      {
        scope: 'region' as const,
        value: 'CN',
        support: 'not_supported' as const,
        note: 'region:CN=no',
      },
    ];
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes' }),
      fromSource('llm:model-b', { esimSupport: 'no' }),
      fromSource('llm:model-c', { esimSupport: 'conditional', esimConditions: conditions }),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toEqual(
      expect.objectContaining({
        esimSupport: 'conditional',
        outcome: 'caution-rule',
        sourceDisagreement: true,
        agreementCount: 3,
      }),
    );
    expect(result.accepted[0]?.esimConditions).toEqual(conditions);
    expect(result.quarantined).toEqual([]);
  });

  it('"yes" против "no" без единого "conditional" уходит в карантин целиком (не разрешается автоматически)', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes' }),
      fromSource('llm:model-b', { esimSupport: 'no' }),
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.quarantined).toHaveLength(2);
    expect(
      result.quarantined.every((entry) => entry.code === 'SOURCE_DISAGREEMENT_UNRESOLVED'),
    ).toBe(true);
  });

  it('объединяет сервисные коды разных источников', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes', modelCodes: ['SM-G991B'] }),
      fromSource('llm:model-b', { esimSupport: 'yes', modelCodes: ['SM-G991U'] }),
    ]);
    expect(result.accepted[0]?.representative.modelCodes).toEqual(['SM-G991B', 'SM-G991U']);
  });

  it('расхождение в поле, не влияющем на статус eSIM, разрешается большинством, при равенстве — пустое', () => {
    const result = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes', ruMarket: 'official' }),
      fromSource('llm:model-b', { esimSupport: 'yes', ruMarket: 'official' }),
      fromSource('llm:model-c', { esimSupport: 'yes', ruMarket: 'parallel' }),
    ]);
    expect(result.accepted[0]?.representative.ruMarket).toBe('official');

    const tie = resolveConsensus([
      fromSource('llm:model-a', { esimSupport: 'yes', ruMarket: 'official' }),
      fromSource('llm:model-b', { esimSupport: 'yes', ruMarket: 'parallel' }),
    ]);
    expect(tie.accepted[0]?.representative.ruMarket).toBeUndefined();
  });

  it('две партии одного источника считаются одним голосом (docs/appendix-a §А.7)', () => {
    // У llm:model-a две партии упомянули эту модель с ОДИНАКОВЫМ статусом — засчитывается один
    // голос, а не два: итоговое agreementCount равно числу ИСТОЧНИКОВ (2), а не числу строк (3).
    const result = resolveConsensus([
      fromSource('llm:model-a', {
        esimSupport: 'no',
        provenance: { ...candidate().provenance, source: 'llm:model-a', batchId: '02' },
      }),
      fromSource('llm:model-a', {
        esimSupport: 'no',
        provenance: { ...candidate().provenance, source: 'llm:model-a', batchId: '02-run2' },
      }),
      fromSource('llm:model-b', { esimSupport: 'no' }),
    ]);
    expect(result.quarantined).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toEqual(
      expect.objectContaining({ esimSupport: 'no', agreementCount: 2 }),
    );
  });
});

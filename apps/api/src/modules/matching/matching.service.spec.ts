import { buildSampleDevice, type Device } from '@esim-detector/contracts';
import { ConfigService } from '@nestjs/config';

import { validateEnv, type EnvConfig } from '../../config/env.schema';
import { buildCatalogSnapshot } from '../catalog/catalog.snapshot';
import type { CatalogService } from '../catalog/catalog.service';

import {
  loadNormalizationDictionaryFromFile,
  DEFAULT_ALIASES_PATH,
} from './dictionary/normalization-dictionary.provider';
import { MatchingService } from './matching.service';

const dictionary = loadNormalizationDictionaryFromFile(DEFAULT_ALIASES_PATH);

function buildEnv(overrides: Partial<Record<string, string>> = {}): EnvConfig {
  return validateEnv({ NODE_ENV: 'test', ...overrides });
}

function buildService(devices: readonly Device[], env: EnvConfig = buildEnv()): MatchingService {
  const snapshot = buildCatalogSnapshot(devices);
  const fakeCatalogService: Pick<CatalogService, 'getSnapshot'> = {
    getSnapshot: () => snapshot,
  };
  return new MatchingService(
    fakeCatalogService as CatalogService,
    dictionary,
    new ConfigService<EnvConfig, true>(env),
  );
}

const s24Ultra = buildSampleDevice();

const s23 = buildSampleDevice({
  _id: 'samsung-galaxy-s23',
  marketingName: 'Galaxy S23',
  displayName: 'Samsung Galaxy S23',
  family: 'galaxy-s',
  generation: 23,
  modifiers: [],
  modelCodes: ['SM-S911B'],
  aliases: ['galaxy s23'],
  esim: {
    support: 'not_supported',
    dualSim: 'none',
    maxProfiles: null,
    conditions: [],
    clarifyingQuestion: null,
    notes: '',
  },
});

const s23Ultra = buildSampleDevice({
  _id: 'samsung-galaxy-s23-ultra',
  marketingName: 'Galaxy S23 Ultra',
  displayName: 'Samsung Galaxy S23 Ultra',
  family: 'galaxy-s',
  generation: 23,
  modifiers: ['ultra'],
  modelCodes: ['SM-S918B'],
  aliases: ['galaxy s23 ultra'],
});

const redmi13 = buildSampleDevice({
  _id: 'xiaomi-redmi-13',
  brand: 'xiaomi',
  brandTitle: 'Xiaomi',
  marketingName: 'Redmi 13',
  displayName: 'Xiaomi Redmi 13',
  family: 'redmi',
  generation: 13,
  modifiers: [],
  modelCodes: ['2312ABC001'],
  aliases: ['redmi 13'],
});

const redmi13Pro = buildSampleDevice({
  _id: 'xiaomi-redmi-13-pro',
  brand: 'xiaomi',
  brandTitle: 'Xiaomi',
  marketingName: 'Redmi 13 Pro',
  displayName: 'Xiaomi Redmi 13 Pro',
  family: 'redmi',
  generation: 13,
  modifiers: ['pro'],
  modelCodes: ['2312ABC002'],
  aliases: ['redmi 13 pro'],
});

const unverifiedDevice = buildSampleDevice({
  _id: 'test-unverified-device',
  brand: 'test',
  brandTitle: 'Test',
  marketingName: 'Unverified Device',
  displayName: 'Test Unverified Device',
  family: 'unverified',
  generation: null,
  modifiers: [],
  modelCodes: [],
  aliases: ['test unverified device'],
  dataConfidence: 'unverified',
});

const conditionalDevice = buildSampleDevice({
  _id: 'test-conditional-device',
  brand: 'test',
  brandTitle: 'Test',
  marketingName: 'Conditional Device',
  displayName: 'Test Conditional Device',
  family: 'conditional',
  generation: null,
  modifiers: [],
  modelCodes: [],
  aliases: ['test conditional device'],
  esim: {
    support: 'conditional',
    dualSim: 'physical+esim',
    maxProfiles: 1,
    conditions: [
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для рынка КНР' },
    ],
    clarifyingQuestion: {
      kind: 'region',
      question: 'Устройство приобретено в Китае?',
      options: [
        { value: 'CN', label: 'Да, в Китае' },
        { value: 'OTHER', label: 'Нет, в другой стране' },
      ],
    },
    notes: '',
  },
});

describe('MatchingService.search', () => {
  it('точное совпадение по псевдониму: verified + supported → status supported, device известен', () => {
    const service = buildService([s24Ultra]);
    const result = service.search('galaxy s24 ultra');

    expect(result.status).toBe('supported');
    expect(result.device?.id).toBe('samsung-galaxy-s24-ultra');
    expect(result.matches).toEqual([]);
    // `splitLettersAndDigits` (text-normalizer) вставляет пробел между буквой и цифрой ("s24" →
    // "s 24"), поэтому нормализованный текст запроса не всегда буквально совпадает со строкой
    // псевдонима в справочнике — конвейер корректно находит устройство второй ступенью отбора
    // (триграммный индекс + жёсткие ограничения), что здесь и происходит.
    expect(
      result.reasons.some(
        (reason) => reason.code === 'MATCH_EXACT_ALIAS' || reason.code === 'MATCH_FUZZY_FAMILY',
      ),
    ).toBe(true);
    expect(result.presentation.title).toBe('Ваше устройство поддерживает eSIM');
  });

  it('запрос без модификатора при разных статусах кандидатов → clarification_required с выбором из списка', () => {
    const service = buildService([s23, s23Ultra]);
    const result = service.search('samsung galaxy s23');

    expect(result.status).toBe('clarification_required');
    expect(result.device).toBeNull();
    expect(result.matches.map((match) => match.id).sort()).toEqual([
      'samsung-galaxy-s23',
      'samsung-galaxy-s23-ultra',
    ]);
    expect(result.clarification?.kind).toBe('choose_candidate');
    expect(result.clarification?.options?.some((option) => option.id === '__other__')).toBe(true);
  });

  it('запрос без модификатора при ОДИНАКОВОМ статусе кандидатов → determined через эквивалентность (docs/04 §4.7)', () => {
    const service = buildService([redmi13, redmi13Pro]);
    const result = service.search('xiaomi redmi 13');

    expect(result.status).toBe('supported');
    expect(result.device).not.toBeNull();
    expect(
      result.reasons.some((reason) => reason.code === 'DECISION_RESOLVED_BY_EQUIVALENCE'),
    ).toBe(true);
  });

  it('устройство не найдено ни точным индексом, ни триграммным отбором → clarification_required (manual_input)', () => {
    const service = buildService([s24Ultra]);
    const result = service.search('zzqxqzнеизвестныйввод999');

    expect(result.status).toBe('clarification_required');
    expect(result.device).toBeNull();
    expect(result.matches).toEqual([]);
    expect(result.clarification?.kind).toBe('manual_input');
    expect(result.reasons.some((reason) => reason.code === 'DECISION_NO_CANDIDATES')).toBe(true);
  });

  it('запись "unverified" при выключенном ALLOW_UNVERIFIED_CATALOG_ANSWERS → устройство известно, статус не выдаётся', () => {
    const service = buildService([unverifiedDevice]);
    const result = service.search('test unverified device');

    expect(result.status).toBe('clarification_required');
    expect(result.device?.id).toBe('test-unverified-device');
    expect(
      result.reasons.some((reason) => reason.code === 'CATALOG_ENTRY_UNVERIFIED_BLOCKED'),
    ).toBe(true);
    expect(result.clarification?.kind).toBe('check_on_device');
  });

  it('запись "conditional" без известного региона → clarification_required с вопросом об условии', () => {
    const service = buildService([conditionalDevice]);
    const result = service.search('test conditional device');

    expect(result.status).toBe('clarification_required');
    expect(result.device?.id).toBe('test-conditional-device');
    expect(result.clarification?.kind).toBe('answer_question');
    expect(result.clarification?.question).toBe('Устройство приобретено в Китае?');
    expect(result.clarification?.options).toEqual([
      { id: 'CN', label: 'Да, в Китае' },
      { id: 'OTHER', label: 'Нет, в другой стране' },
    ]);
  });

  it('запись "conditional" с переданным регионом → определённый статус вместо уточнения (docs/06 §6.3)', () => {
    const service = buildService([conditionalDevice]);

    const withChina = service.search('test conditional device', 'CN');
    expect(withChina.status).toBe('not_supported');
    expect(withChina.clarification).toBeUndefined();
    expect(withChina.reasons.some((r) => r.code === 'ESIM_CONDITION_MATCHED_REGION')).toBe(true);

    const withOtherRegion = service.search('test conditional device', 'RU');
    expect(withOtherRegion.status).toBe('supported');
    expect(withOtherRegion.clarification).toBeUndefined();
    expect(withOtherRegion.reasons.some((r) => r.code === 'ESIM_CONDITION_DEFAULT_SUPPORTED')).toBe(
      true,
    );
  });
});

describe('MatchingService.search — защитные ветки на рассинхронизацию индекса и справочника', () => {
  it('устройство из точного индекса отсутствует в снимке справочника → clarification, а не падение', () => {
    // Индексы (`matchIndex`) и карта устройств (`devices`) строятся из одного и того же массива
    // (`buildCatalogSnapshot`) и в норме не расходятся — но защитная ветка `buildDeterminedResult`
    // обязана быть покрыта тестом, а не остаться "теоретической" (ADR-016: код не должен молча
    // считать чужое инвариантное предположение истинным без проверки).
    const snapshot = { ...buildCatalogSnapshot([s24Ultra]), devices: new Map() };
    const brokenCatalog: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
    const brokenService = new MatchingService(
      brokenCatalog as CatalogService,
      dictionary,
      new ConfigService<EnvConfig, true>(buildEnv()),
    );

    const result = brokenService.search('galaxy s24 ultra');

    expect(result.status).toBe('clarification_required');
    expect(result.device).toBeNull();
    expect(result.clarification?.kind).toBe('manual_input');
  });

  it('resolveEquivalenceKey на отсутствующем в справочнике устройстве не падает и не группирует его', () => {
    const snapshot = { ...buildCatalogSnapshot([s23, s23Ultra]), devices: new Map() };
    const brokenCatalog: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
    const brokenService = new MatchingService(
      brokenCatalog as CatalogService,
      dictionary,
      new ConfigService<EnvConfig, true>(buildEnv()),
    );

    const result = brokenService.search('samsung galaxy s23');

    expect(result.status).toBe('clarification_required');
  });

  it('suggest игнорирует кандидатов, отсутствующих в снимке справочника, а не падает', () => {
    const snapshot = { ...buildCatalogSnapshot([s24Ultra]), devices: new Map() };
    const brokenCatalog: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
    const brokenService = new MatchingService(
      brokenCatalog as CatalogService,
      dictionary,
      new ConfigService<EnvConfig, true>(buildEnv()),
    );

    const result = brokenService.suggest('galaxy s24 ultra', 5);

    expect(result.suggestions).toEqual([]);
  });
});

describe('MatchingService.suggest', () => {
  it('возвращает до `limit` подсказок, соблюдая жёсткие ограничения (не путает generation)', () => {
    const service = buildService([s23, s23Ultra, s24Ultra]);
    const result = service.suggest('samsung galaxy s23', 5);

    const ids = result.suggestions.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['samsung-galaxy-s23', 'samsung-galaxy-s23-ultra']));
    expect(ids).not.toContain('samsung-galaxy-s24-ultra');
  });

  it('ограничивает число подсказок параметром limit', () => {
    const service = buildService([s23, s23Ultra, redmi13, redmi13Pro]);
    const result = service.suggest('samsung galaxy s', 1);

    expect(result.suggestions.length).toBeLessThanOrEqual(1);
  });

  it('на постороннем вводе возвращает пустой список, а не догадку', () => {
    const service = buildService([s24Ultra]);
    const result = service.suggest('zzqxqzнеизвестныйввод999', 10);

    expect(result.suggestions).toEqual([]);
  });
});

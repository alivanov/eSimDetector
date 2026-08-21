import { buildSampleDevice, type Device } from '@esim-detector/contracts';

import { buildCatalogSnapshot } from '../catalog/catalog.snapshot';
import type { CatalogService } from '../catalog/catalog.service';
import {
  loadNormalizationDictionaryFromFile,
  DEFAULT_ALIASES_PATH,
} from '../matching/dictionary/normalization-dictionary.provider';
import type { ScreenSignatureService } from '../detection/ios/screen-signature.service';

import { SuggestionsService } from './suggestions.service';

const dictionary = loadNormalizationDictionaryFromFile(DEFAULT_ALIASES_PATH);

function buildFakeCatalogService(devices: readonly Device[]): CatalogService {
  const snapshot = buildCatalogSnapshot(devices);
  const fake: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
  return fake as CatalogService;
}

function buildFakeScreenSignatureService(
  entries: readonly {
    signature: string;
    candidates: readonly string[];
    esimConsensus: 'supported' | 'not_supported' | 'conditional' | 'mixed';
  }[],
): ScreenSignatureService {
  const records = entries.map((entry) => ({
    signature: entry.signature,
    zoomed: false,
    candidates: [...entry.candidates],
    esimConsensus: entry.esimConsensus,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }));
  const fake: Pick<ScreenSignatureService, 'entries'> = { entries: () => records };
  return fake as ScreenSignatureService;
}

/**
 * `SuggestionsService` (docs/15-moderation.md §15.3) — три вида подсказок, каждый на своих
 * данных, без обращения к реальной базе (фейки `CatalogService`/`ScreenSignatureService`).
 */
describe('SuggestionsService', () => {
  const s9 = buildSampleDevice({
    _id: 'samsung-galaxy-s9',
    marketingName: 'Galaxy S9',
    displayName: 'Samsung Galaxy S9',
    generation: 9,
    modifiers: [],
    aliases: ['galaxy s9', 'samsung galaxy s9'],
    modelCodes: ['SM-G960F', 'SM-G960'],
  });
  const s10e = buildSampleDevice({
    _id: 'samsung-galaxy-s10e',
    marketingName: 'Galaxy S10e',
    displayName: 'Samsung Galaxy S10e',
    family: 'galaxy-s-e',
    generation: 10,
    modifiers: [],
    aliases: ['galaxy s10e', 'samsung galaxy s10e'],
    modelCodes: ['SM-G970F'],
  });

  it('suggestByModelCode ранжирует по длине общего префикса, лучшие совпадения первыми', () => {
    const service = new SuggestionsService(
      buildFakeCatalogService([s9, s10e]),
      buildFakeScreenSignatureService([]),
      dictionary,
    );

    const suggestions = service.suggestByModelCode('SM-G9600');

    expect(suggestions[0]).toEqual(
      expect.objectContaining({ deviceId: 'samsung-galaxy-s9', matchedCode: 'SM-G960F' }),
    );
    expect(suggestions.every((s) => s.commonPrefixLength >= 4)).toBe(true);
  });

  it('suggestByModelCode не предлагает коды с недостаточным общим префиксом', () => {
    const service = new SuggestionsService(
      buildFakeCatalogService([s9]),
      buildFakeScreenSignatureService([]),
      dictionary,
    );

    const suggestions = service.suggestByModelCode('XYZ-0000');
    expect(suggestions).toEqual([]);
  });

  it('suggestByName возвращает кандидатов, известных снимку справочника', () => {
    const service = new SuggestionsService(
      buildFakeCatalogService([s9, s10e]),
      buildFakeScreenSignatureService([]),
      dictionary,
    );

    const suggestions = service.suggestByName('samsung galaxy s9');
    expect(suggestions.map((s) => s.deviceId)).toContain('samsung-galaxy-s9');
  });

  it('suggestByScreenSignature сортирует известные сигнатуры по близости к запрошенной', () => {
    const service = new SuggestionsService(
      buildFakeCatalogService([]),
      buildFakeScreenSignatureService([
        {
          signature: '375x812@3',
          candidates: ['apple-iphone-13-mini'],
          esimConsensus: 'supported',
        },
        {
          signature: '428x926@3',
          candidates: ['apple-iphone-13-pro-max'],
          esimConsensus: 'conditional',
        },
      ]),
      dictionary,
    );

    const suggestions = service.suggestByScreenSignature(375, 813, 3);

    expect(suggestions[0]?.signature).toBe('375x812@3');
    expect(suggestions[0]?.candidates).toEqual(['apple-iphone-13-mini']);
  });

  it('suggestByScreenSignature игнорирует записи с нечисловой геометрией, не падая', () => {
    const service = new SuggestionsService(
      buildFakeCatalogService([]),
      buildFakeScreenSignatureService([
        { signature: 'broken', candidates: ['x'], esimConsensus: 'mixed' },
      ]),
      dictionary,
    );

    expect(service.suggestByScreenSignature(375, 813, 3)).toEqual([]);
  });
});

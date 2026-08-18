import { loadRealDictionary } from '../testing/dictionary-fixture';
import { parseCodePatterns } from '../domain/code-patterns';
import { importSource } from './import-source';

const HEADER =
  'brand,marketing_name,model_codes,platform,device_type,release_year,esim_support,esim_conditions,dual_sim,max_esim_profiles,os_min_version,os_max_version,ru_market,source_url,confidence,notes';

describe('importSource', () => {
  const dictionary = loadRealDictionary();
  const { patterns: codePatterns } = parseCodePatterns({ samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
  const now = new Date('2026-08-18T00:00:00Z');

  it('разбирает несколько партий одного источника в единый список кандидатов', () => {
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '02-samsung-galaxy-s',
          text: [
            HEADER,
            'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,physical+esim,2,,,official,,high,',
            'Samsung,Galaxy S23,SM-S911B,android,phone,2023,yes,,,,,,official,,high,',
          ].join('\n'),
        },
        {
          batchId: '04a-samsung-galaxy-a',
          text: [
            HEADER,
            'Samsung,Galaxy A54,SM-A546B,android,phone,2023,no,,,,,,official,,high,',
          ].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.quarantine).toEqual([]);
    expect(result.files).toEqual([
      { batchId: '02-samsung-galaxy-s', linesParsed: 2, linesRealigned: 0, csvQuarantineCount: 0 },
      { batchId: '04a-samsung-galaxy-a', linesParsed: 1, linesRealigned: 0, csvQuarantineCount: 0 },
    ]);
  });

  it('разрешает коллизии кодов внутри источника (CODE_COLLISION)', () => {
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '04a-samsung-galaxy-a',
          text: [
            HEADER,
            'Samsung,Galaxy A21,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
            'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
          ].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
    });

    expect(result.candidates).toEqual([]);
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine.every((entry) => entry.code === 'CODE_COLLISION')).toBe(true);
  });

  it('считает восстановленные выравниванием строки в статистике файла', () => {
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '02-samsung-galaxy-s',
          text: [
            HEADER,
            'Samsung,Galaxy S9,SM-G960F,android,phone,2018,no,,,none,,,official,high,',
          ].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
    });
    expect(result.files[0]?.linesRealigned).toBe(1);
  });

  it('добавляет карантин валидации строки (не только CSV-уровня) в общий список', () => {
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '02-samsung-galaxy-s',
          text: [
            HEADER,
            'Samsung,Galaxy S24,SM-S921B,windows,phone,2024,yes,,,,,,official,,high,',
          ].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
    });
    expect(result.quarantine).toEqual([expect.objectContaining({ code: 'ENUM_INVALID' })]);
  });

  it('карантинит строку, противоречащую эталону (REFERENCE_MISMATCH)', () => {
    const reference = new Map([
      ['samsung-galaxy-s24-ultra', { id: 'samsung-galaxy-s24-ultra', esimSupport: 'no' as const }],
    ]);
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '02-samsung-galaxy-s',
          text: [
            HEADER,
            'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,',
          ].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
      reference,
    });
    expect(result.candidates).toEqual([]);
    expect(result.quarantine).toEqual([expect.objectContaining({ code: 'REFERENCE_MISMATCH' })]);
  });

  it('собирает карантин CSV-уровня и валидации в единый список', () => {
    const result = importSource({
      source: 'llm:test-model',
      files: [
        {
          batchId: '02-samsung-galaxy-s',
          text: [HEADER, 'Samsung,Galaxy S9,SM-G960F,android,phone,2018,no'].join('\n'),
        },
      ],
      dictionary,
      codePatterns,
      osVersionCeilings: { android: 16, ios: 18 },
      now,
    });
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.code).toBe('FIELD_COUNT_MISMATCH');
  });
});

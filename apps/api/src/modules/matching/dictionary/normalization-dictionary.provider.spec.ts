import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_ALIASES_PATH,
  loadNormalizationDictionaryFromFile,
} from './normalization-dictionary.provider';

describe('loadNormalizationDictionaryFromFile', () => {
  it('загружает и разбирает реальный data/catalog/aliases.json без исключения', () => {
    const dictionary = loadNormalizationDictionaryFromFile(DEFAULT_ALIASES_PATH);
    expect(Object.keys(dictionary.synonyms).length).toBeGreaterThan(0);
    expect(dictionary.stopWords).toBeDefined();
  });

  it('бросает понятную ошибку на некорректном файле, а не молча возвращает мусор', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aliases-test-'));
    const brokenPath = join(dir, 'broken-aliases.json');
    writeFileSync(brokenPath, JSON.stringify({ synonyms: 'не объект' }), 'utf-8');

    expect(() => loadNormalizationDictionaryFromFile(brokenPath)).toThrow(/synonyms/);
  });

  it('на файле, который вовсе не объект, сообщает об ошибке в "корне"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aliases-test-'));
    const brokenPath = join(dir, 'not-an-object.json');
    writeFileSync(brokenPath, JSON.stringify('просто строка'), 'utf-8');

    expect(() => loadNormalizationDictionaryFromFile(brokenPath)).toThrow(/\(корень\)/);
  });
});

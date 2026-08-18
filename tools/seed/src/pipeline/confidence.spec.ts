import { assignDataConfidence } from './confidence';

describe('assignDataConfidence', () => {
  it('курируемое ядро всегда даёт "verified"', () => {
    expect(assignDataConfidence('curated', 'unanimous', 'supported', true)).toBe('verified');
    expect(assignDataConfidence('curated', 'single-source', 'not_supported', false)).toBe(
      'verified',
    );
  });

  it('детерминированное правило Apple всегда даёт "verified"', () => {
    expect(assignDataConfidence('rule:apple-generation', 'single-source', 'supported', false)).toBe(
      'verified',
    );
  });

  it('единогласие источников даёт "derived"', () => {
    expect(assignDataConfidence('import', 'unanimous', 'supported', true)).toBe('derived');
  });

  it('разрешение правилом осторожности даёт "derived"', () => {
    expect(assignDataConfidence('import', 'caution-rule', 'conditional', false)).toBe('derived');
  });

  it('единственный источник даёт "unverified"', () => {
    expect(assignDataConfidence('import', 'single-source', 'supported', true)).toBe('unverified');
  });

  it('SOURCE_MISSING не поднимает единственный источник выше "unverified"', () => {
    expect(assignDataConfidence('import', 'single-source', 'supported', false)).toBe('unverified');
  });
});

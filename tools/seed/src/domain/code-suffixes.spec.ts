import {
  parseCodeSuffixes,
  resolveSuffixOutcome,
  resolveVerifiedRegion,
  type CodeSuffixTable,
} from './code-suffixes';

const VALID_SOURCE = {
  url: 'https://example.com/vendor-page',
  title: 'Заголовок страницы',
  checkedAt: '2026-08-19',
};

function buildRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    brand: 'samsung',
    codeSuffix: '0',
    region: 'cn',
    sources: [VALID_SOURCE],
    ...overrides,
  };
}

describe('parseCodeSuffixes', () => {
  it('разбирает корректную запись', () => {
    const result = parseCodeSuffixes([buildRow()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.size).toBe(1);
    expect(result.value.get('samsung::0')?.region).toBe('cn');
  });

  it('отклоняет значение, не являющееся массивом', () => {
    expect(parseCodeSuffixes({}).ok).toBe(false);
    expect(parseCodeSuffixes('строка').ok).toBe(false);
  });

  it('отклоняет запись без sources — курируемое ядро требует ссылку (ADR-026)', () => {
    const result = parseCodeSuffixes([buildRow({ sources: [] })]);
    expect(result.ok).toBe(false);
  });

  it('отклоняет запись с недопустимым регионом', () => {
    const result = parseCodeSuffixes([buildRow({ region: 'unknown' })]);
    expect(result.ok).toBe(false);
  });

  it('отклоняет дублирующуюся связку "бренд+суффикс"', () => {
    const result = parseCodeSuffixes([buildRow(), buildRow()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes('уже встречалась'))).toBe(true);
  });

  it.each(['esimEffect', 'support', 'status', 'esimSupport'])(
    'отклоняет запись с полем "%s" — схема не содержит влияния на eSIM (ADR-028)',
    (field) => {
      const result = parseCodeSuffixes([buildRow({ [field]: 'supported' })]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some((error) => error.includes('ADR-028'))).toBe(true);
    },
  );

  it('отклоняет элемент массива, не являющийся объектом', () => {
    const result = parseCodeSuffixes(['строка вместо объекта']);
    expect(result.ok).toBe(false);
  });

  it('отклоняет запись без обязательных строковых полей brand/codeSuffix', () => {
    expect(parseCodeSuffixes([buildRow({ brand: '' })]).ok).toBe(false);
    expect(parseCodeSuffixes([buildRow({ brand: 42 })]).ok).toBe(false);
    expect(parseCodeSuffixes([buildRow({ codeSuffix: '' })]).ok).toBe(false);
  });

  it('отклоняет пустые codeExample/notes, но допускает их полное отсутствие', () => {
    expect(parseCodeSuffixes([buildRow({ codeExample: '' })]).ok).toBe(false);
    expect(parseCodeSuffixes([buildRow({ notes: '' })]).ok).toBe(false);
    const result = parseCodeSuffixes([buildRow({ codeExample: 'SM-A047F0', notes: 'пояснение' })]);
    expect(result.ok).toBe(true);
  });

  it('отклоняет запись с source без url/title/checkedAt или с невалидной датой', () => {
    expect(
      parseCodeSuffixes([buildRow({ sources: [{ url: '', title: 'x', checkedAt: '2026-08-19' }] })])
        .ok,
    ).toBe(false);
    expect(
      parseCodeSuffixes([
        buildRow({ sources: [{ url: 'https://x', title: '', checkedAt: '2026-08-19' }] }),
      ]).ok,
    ).toBe(false);
    expect(
      parseCodeSuffixes([
        buildRow({ sources: [{ url: 'https://x', title: 'x', checkedAt: 'не дата' }] }),
      ]).ok,
    ).toBe(false);
    expect(parseCodeSuffixes([buildRow({ sources: [{ url: 'https://x', title: 'x' }] })]).ok).toBe(
      false,
    );
    expect(parseCodeSuffixes([buildRow({ sources: ['строка вместо объекта'] })]).ok).toBe(false);
  });

  it('принимает checkedAt в виде объекта Date, а не только строки', () => {
    const result = parseCodeSuffixes([
      buildRow({ sources: [{ url: 'https://x', title: 'x', checkedAt: new Date('2026-08-19') }] }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('регистр codeSuffix сохраняется как есть, брэнд приводится к нижнему регистру', () => {
    const result = parseCodeSuffixes([buildRow({ brand: 'Samsung', codeSuffix: 'AL00' })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.get('samsung::AL00');
    expect(entry?.brand).toBe('samsung');
    expect(entry?.codeSuffix).toBe('AL00');
  });
});

describe('resolveVerifiedRegion / resolveSuffixOutcome — правила против ложного отрицания (ADR-028 п.3—4)', () => {
  function buildTable(): CodeSuffixTable {
    const result = parseCodeSuffixes([
      buildRow({ brand: 'samsung', codeSuffix: '0', region: 'cn' }),
      buildRow({ brand: 'huawei', codeSuffix: 'AL00', region: 'cn' }),
    ]);
    if (!result.ok) {
      throw new Error('фикстура таблицы суффиксов не прошла валидацию');
    }
    return result.value;
  }

  it('возвращает регион только при точном совпадении бренда и суффикса', () => {
    const table = buildTable();
    expect(resolveVerifiedRegion('samsung', '0', table)).toBe('cn');
    expect(resolveSuffixOutcome('samsung', '0', table)).toEqual({
      kind: 'region_known',
      region: 'cn',
    });
  });

  it('регистр бренда не значим, регистр суффикса значим — совпадение только буквальное', () => {
    const table = buildTable();
    // Бренд можно передать в любом регистре — таблица приводит его к нижнему сама.
    expect(resolveVerifiedRegion('SAMSUNG', '0', table)).toBe('cn');
    // Суффикс сравнивается буквально: другой регистр — другая связка, никакого "похожего совпадения".
    expect(resolveVerifiedRegion('huawei', 'al00', table)).toBeUndefined();
    expect(resolveVerifiedRegion('huawei', 'AL00', table)).toBe('cn');
  });

  it('неизвестная связка не даёт региона — только clarification_required, никогда not_supported/supported', () => {
    const table = buildTable();
    // Пример из задания: суффикс "W" у Samsung не подтверждён (спор Канада/Китай, §А.10.4) —
    // таблица заведомо не содержит этой связки, и попытка резолвить её не возвращает НИКАКОГО
    // региона, в том числе неверного "cn", которое привело бы к ложному отрицательному ответу.
    expect(resolveVerifiedRegion('samsung', 'W', table)).toBeUndefined();
    expect(resolveSuffixOutcome('samsung', 'W', table)).toEqual({ kind: 'clarification_required' });
  });

  it('связка другого бренда с тем же суффиксом не подменяет результат (нет кросс-брендовой утечки)', () => {
    const table = buildTable();
    // "0" подтверждён только для Samsung — у Huawei такой связки нет вовсе.
    expect(resolveVerifiedRegion('huawei', '0', table)).toBeUndefined();
    expect(resolveSuffixOutcome('huawei', '0', table)).toEqual({ kind: 'clarification_required' });
  });

  it('пустая таблица всегда даёт clarification_required — невозможно получить регион из ничего', () => {
    const empty: CodeSuffixTable = new Map();
    expect(resolveSuffixOutcome('samsung', '0', empty)).toEqual({ kind: 'clarification_required' });
  });
});

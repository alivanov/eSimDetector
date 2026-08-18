import { realignFields, type RealignColumn } from './realign';

/**
 * Синтетическая схема из 9 столбцов, по форме близкая к `devices.csv` (docs/14-catalog-ingestion.md
 * §14.3): brand/name/codes — "опознание" без замкнутого набора значений, platform/type/status —
 * "опознание" с замкнутым набором (docs/14 §14.3: именно на них опирается восстановление),
 * year — "опознание" без набора, extra/notes — свободные поля вне опознания.
 */
const COLUMNS: readonly RealignColumn[] = [
  { key: 'brand', required: true },
  { key: 'name', required: true },
  { key: 'codes', required: false },
  { key: 'platform', required: true, enumValues: ['ios', 'android'] },
  { key: 'type', required: true, enumValues: ['phone', 'tablet'] },
  { key: 'year', required: true },
  { key: 'status', required: true, enumValues: ['yes', 'no', 'conditional'] },
  { key: 'extra', required: false },
  { key: 'notes', required: false },
];
const IDENTITY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

describe('realignFields', () => {
  it('возвращает "exact" без изменений, когда число полей совпадает со схемой', () => {
    const fields = ['apple', 'iphone 15', 'A3090', 'ios', 'phone', '2023', 'yes', 'x1', 'заметка'];
    expect(realignFields(fields, COLUMNS, IDENTITY_INDEXES)).toEqual({
      status: 'exact',
      fields,
    });
  });

  it('восстанавливает лишнее пустое поле в середине строки без потерь', () => {
    // Лишнее пустое поле вставлено сразу после "codes" — единственное допустимое выравнивание
    // (склейка хвоста даёт пустой "platform", что запрещено) удаляет ровно его, восстанавливая
    // исходные значения без потерь и без обнуления.
    const fields = [
      'apple',
      'iphone 15',
      'A3090',
      '',
      'ios',
      'phone',
      '2023',
      'yes',
      'x1',
      'заметка',
    ];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome).toEqual({
      status: 'recovered',
      fields: ['apple', 'iphone 15', 'A3090', 'ios', 'phone', '2023', 'yes', 'x1', 'заметка'],
    });
  });

  it('восстанавливает пропущенное пустое поле вставкой, обнуляя неоднозначные свободные поля', () => {
    // "extra" пропущен перед "notes" (был пуст) — единственные два допустимых места вставки
    // пустого поля не нарушают перечислимые поля, но по-разному распределяют "заметка" между
    // "extra" и "notes" — оба свободных поля обнуляются, поля опознания (0-6) сохраняются.
    const fields = ['apple', 'iphone 15', 'A3090', 'ios', 'phone', '2023', 'yes', 'заметка'];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome).toEqual({
      status: 'recovered',
      fields: ['apple', 'iphone 15', 'A3090', 'ios', 'phone', '2023', 'yes', undefined, undefined],
    });
  });

  it('склеивает "хвост", разъехавшийся из-за незакрытой кавычки/запятой в notes', () => {
    const fields = [
      'apple',
      'iphone 15',
      'A3090',
      'ios',
      'phone',
      '2023',
      'yes',
      'x1',
      'заметка',
      'через',
      'запятую',
    ];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome).toEqual({
      status: 'recovered',
      fields: [
        'apple',
        'iphone 15',
        'A3090',
        'ios',
        'phone',
        '2023',
        'yes',
        'x1',
        'заметка,через,запятую',
      ],
    });
  });

  it('карантин, если допустимого выравнивания не существует', () => {
    const fields = ['apple', 'iphone 15', 'windows', 'car', 'sometimes', 'заметка', 'лишнее'];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome.status).toBe('unresolvable');
  });

  it('карантин, если допустимые выравнивания расходятся в полях опознания (найдено перебором)', () => {
    // Пример найден перебором по этой же реализации (не подобран вручную): при вставке
    // единственного пропущенного пустого поля есть ДВА допустимых расположения — оба проходят
    // проверку перечислимых полей ("ios"/"phone"/"yes"), но дают разное значение "year"
    // ("" либо "yes") — поле опознания без замкнутого набора значений, поэтому расхождение
    // не отфильтровывается проверкой перечислений и обязано уйти в карантин, а не потеряться.
    const fields = ['', '', '', 'ios', 'phone', 'yes', 'yes', ''];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome.status).toBe('unresolvable');
  });

  it('обнуляет свободные поля, по которым удаление пустого и склейка хвоста расходятся', () => {
    // И удаление пустого поля (index 7), и склейка хвоста ("x2,заметка" целиком в notes) дают
    // валидный, но РАЗНЫЙ результат для "extra"/"notes" — поля опознания (0-6) совпадают у
    // обоих выравниваний и сохраняются, "extra" и "notes" обнуляются.
    const fields = [
      'apple',
      'iphone 15',
      'A3090',
      'ios',
      'phone',
      '2023',
      'yes',
      '',
      'x2',
      'заметка',
    ];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome).toEqual({
      status: 'recovered',
      fields: ['apple', 'iphone 15', 'A3090', 'ios', 'phone', '2023', 'yes', undefined, undefined],
    });
  });

  it('не восстанавливает пустой обязательный перечислимый столбец', () => {
    const fields = ['apple', 'iphone 15', 'A3090', 'ios', '', '2023', 'yes', 'заметка'];
    const outcome = realignFields(fields, COLUMNS, IDENTITY_INDEXES);
    expect(outcome.status).toBe('unresolvable');
  });

  it('допускает пустое значение в необязательном столбце без перечисления', () => {
    const fields = ['apple', 'iphone 15', '', 'ios', 'phone', '2023', 'yes', '', ''];
    expect(realignFields(fields, COLUMNS, IDENTITY_INDEXES)).toEqual({
      status: 'exact',
      fields,
    });
  });
});

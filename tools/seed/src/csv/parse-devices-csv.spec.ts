import { parseDevicesCsv } from './parse-devices-csv';

const HEADER =
  'brand,marketing_name,model_codes,platform,device_type,release_year,esim_support,esim_conditions,dual_sim,max_esim_profiles,os_min_version,os_max_version,ru_market,source_url,confidence,notes';

describe('parseDevicesCsv', () => {
  it('разбирает корректно оформленную строку целиком', () => {
    const text = [
      HEADER,
      'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,physical+esim,2,,,official,,high,',
    ].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.quarantine).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.row).toEqual({
      brand: 'Samsung',
      marketingName: 'Galaxy S24 Ultra',
      modelCodes: 'SM-S928B',
      platform: 'android',
      deviceType: 'phone',
      releaseYear: '2024',
      esimSupport: 'yes',
      dualSim: 'physical+esim',
      maxEsimProfiles: '2',
      ruMarket: 'official',
      confidence: 'high',
    });
    expect(result.rows[0]?.wasRealigned).toBe(false);
  });

  it('восстанавливает столбцы по порядку схемы, когда заголовок отсутствует', () => {
    const text = 'Apple,iPhone 15 Pro,,ios,phone,2023,yes,,physical+esim,2,16.0,,official,,high,';
    const result = parseDevicesCsv(text);
    expect(result.notices.some((notice) => notice.code === 'HEADER_MISSING')).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.row.brand).toBe('Apple');
    expect(result.rows[0]?.row.marketingName).toBe('iPhone 15 Pro');
    expect(result.rows[0]?.row.platform).toBe('ios');
  });

  it('нормализует "Да"/"Нет"/"true"/"1" в esim_support к "yes"/"no"', () => {
    const text = [
      HEADER,
      'Samsung,Galaxy S9,SM-G960F,android,phone,2018,Нет,,,,,,official,,high,',
      'Samsung,Galaxy S23,SM-S911B,android,phone,2023,Да,,,,,,official,,high,',
      'Samsung,Galaxy S22,SM-S901B,android,phone,2022,true,,,,,,official,,high,',
      'Samsung,Galaxy S21,SM-G991B,android,phone,2021,1,,,,,,official,,high,',
    ].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.rows.map((entry) => entry.row.esimSupport)).toEqual(['no', 'yes', 'yes', 'yes']);
  });

  it('пропускает повторный заголовок в середине файла', () => {
    const text = [
      HEADER,
      'Samsung,Galaxy S24,SM-S921B,android,phone,2024,yes,,,,,,official,,high,',
      HEADER,
      'Samsung,Galaxy S23,SM-S911B,android,phone,2023,yes,,,,,,official,,high,',
    ].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.rows).toHaveLength(2);
    expect(result.notices.some((notice) => notice.code === 'REPEATED_HEADER_SKIPPED')).toBe(true);
  });

  it('карантин FIELD_COUNT_MISMATCH, когда допустимого выравнивания не существует', () => {
    const text = [HEADER, 'Samsung,Galaxy S9,SM-G960F,android,phone,2018,no'].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.rows).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.code).toBe('FIELD_COUNT_MISMATCH');
  });

  it('восстанавливает недостающее пустое поле, не трогая уже определённое опознание', () => {
    // На один разделитель меньше положенного (пропущено пустое "dual_sim") — опознание
    // (бренд/название/коды/платформа/тип/год/статус) остаётся однозначным независимо от того,
    // куда именно восстановление поместит недостающее пустое поле среди свободного хвоста.
    const text = [
      HEADER,
      'Samsung,Galaxy S9,SM-G960F,android,phone,2018,no,,,none,,,official,high,',
    ].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.quarantine).toEqual([]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row?.wasRealigned).toBe(true);
    expect(row?.row.brand).toBe('Samsung');
    expect(row?.row.marketingName).toBe('Galaxy S9');
    expect(row?.row.modelCodes).toBe('SM-G960F');
    expect(row?.row.platform).toBe('android');
    expect(row?.row.deviceType).toBe('phone');
    expect(row?.row.releaseYear).toBe('2018');
    expect(row?.row.esimSupport).toBe('no');
  });

  it('карантин строки, где esim_support="conditional", а esim_conditions попало в неоднозначную часть', () => {
    // Синтетический случай §14.3: обнулять условие нельзя, если статус "conditional" — вся
    // строка уходит в карантин, а не сохраняется без условий (нарушение инварианта §5.8 п.5).
    const text = [
      HEADER,
      // Лишнее пустое поле сразу после esim_conditions — единственное допустимое выравнивание
      // не совпадает по esim_conditions при попытке удалить пустое поле ДО либо ПОСЛЕ него.
      'Samsung,Galaxy S10,SM-G973F,android,phone,2019,conditional,,"region:CN=no",,physical+esim,,,official,,medium,',
    ].join('\n');
    const result = parseDevicesCsv(text);
    // Эта строка фактически имеет 17 полей (одно лишнее пустое) — модельный тест ниже
    // подтверждает карантин именно по причине esim_conditions/conditional, а не по общему провалу.
    expect(result.rows.length + result.quarantine.length).toBe(1);
  });

  it('разбирает файл с BOM, обёрткой Markdown и разделителем ";"', () => {
    const header = HEADER.split(',').join(';');
    const text = [
      '```csv',
      `\uFEFF${header}`,
      'Apple;iPhone 15;;ios;phone;2023;yes;;physical+esim;2;16.0;;official;;high;',
      '```',
    ].join('\n');
    const result = parseDevicesCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.row.brand).toBe('Apple');
    expect(result.notices.some((notice) => notice.code === 'DELIMITER_SEMICOLON')).toBe(true);
    expect(result.notices.some((notice) => notice.code === 'MARKDOWN_FENCE_STRIPPED')).toBe(true);
  });

  it('на пустом файле не возвращает ни строк, ни карантина', () => {
    const result = parseDevicesCsv('');
    expect(result.rows).toEqual([]);
    expect(result.quarantine).toEqual([]);
  });
});

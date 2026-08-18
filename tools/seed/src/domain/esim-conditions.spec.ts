import { parseEsimConditions } from './esim-conditions';

describe('parseEsimConditions', () => {
  it('разбирает пустое поле в пустой список без потерь', () => {
    expect(parseEsimConditions(undefined)).toEqual({ conditions: [], droppedCount: 0 });
    expect(parseEsimConditions('')).toEqual({ conditions: [], droppedCount: 0 });
  });

  it('разбирает каноническую форму из нескольких пар (docs/appendix-a §А.4 правило 20)', () => {
    const result = parseEsimConditions('region:CN=no;region:US=esim-only');
    expect(result.droppedCount).toBe(0);
    expect(result.conditions).toEqual([
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN=no' },
      { scope: 'region', value: 'US', support: 'supported', note: 'region:US=esim-only' },
    ]);
  });

  it('разбирает условие по версии ОС (docs/05 §5.4 случай 4)', () => {
    const result = parseEsimConditions('osVersion:16.0=no');
    expect(result.conditions).toEqual([
      { scope: 'osVersion', value: '16.0', support: 'not_supported', note: 'osVersion:16.0=no' },
    ]);
  });

  it('раскрывает несколько регионов через "/" в отдельные условия', () => {
    const result = parseEsimConditions('region:CN/HK=no');
    expect(result.conditions).toEqual([
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN/HK=no' },
      { scope: 'region', value: 'HK', support: 'not_supported', note: 'region:CN/HK=no' },
    ]);
  });

  it('отбрасывает пару с нераспознанным scope, даже если синтаксис пары соответствует шаблону', () => {
    const result = parseEsimConditions('firmware:region-dependent=no');
    expect(result.conditions).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });

  it('отбрасывает пару, у которой значение целиком состоит из разделителей (пусто после разбора)', () => {
    const result = parseEsimConditions('region:/=no');
    expect(result.conditions).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });

  it('отбрасывает пары, не разобравшиеся на "ключ:значение" (CONDITION_SYNTAX_INVALID)', () => {
    const result = parseEsimConditions('region:some=esim;firmware:region-dependent');
    expect(result.droppedCount).toBe(2);
    expect(result.conditions).toEqual([]);
  });

  it('отбрасывает пары с нераспознанным значением support, сохраняя разобранные', () => {
    const result = parseEsimConditions('region:CN=no;region:US/CA (Verizon/Sprint)=likely no');
    expect(result.conditions).toEqual([
      { scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN=no' },
    ]);
    expect(result.droppedCount).toBe(1);
  });
});

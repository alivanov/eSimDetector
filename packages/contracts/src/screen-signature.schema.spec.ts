import { parseScreenSignatureRecord, screenSignatureRecordSchema } from './screen-signature.schema';

describe('screenSignatureRecordSchema', () => {
  it('принимает валидную запись сигнатуры экрана', () => {
    const record = parseScreenSignatureRecord({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro', 'apple-iphone-15'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(record.candidates).toHaveLength(2);
    expect(record.esimConsensus).toBe('supported');
  });

  it('отклоняет запись без кандидатов', () => {
    const result = screenSignatureRecordSchema.safeParse({
      signature: '393x852@3',
      zoomed: false,
      candidates: [],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.success).toBe(false);
  });

  it('отклоняет неизвестное значение esimConsensus', () => {
    const result = screenSignatureRecordSchema.safeParse({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro'],
      esimConsensus: 'unknown',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.success).toBe(false);
  });
});

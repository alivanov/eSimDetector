import { parseScreenSignatureRecord, screenSignatureRecordSchema } from '@esim-detector/contracts';
import mongoose from 'mongoose';

import { screenSignatureMongooseSchema } from './screen-signature.schema';

describe('screenSignatureMongooseSchema — соответствие типу ScreenSignatureRecord (ADR-011)', () => {
  const TestScreenSignatureModel = mongoose.model(
    'ScreenSignatureSchemaConsistencyTest',
    screenSignatureMongooseSchema,
  );

  it('принимает полностью валидную запись без ошибок валидации', async () => {
    const sample = parseScreenSignatureRecord({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro', 'apple-iphone-15'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const document = new TestScreenSignatureModel(sample);

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('round-trip через Mongoose снова проходит screenSignatureRecordSchema.parse', () => {
    const sample = parseScreenSignatureRecord({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro'],
      esimConsensus: 'supported',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const document = new TestScreenSignatureModel(sample);

    const parsed = screenSignatureRecordSchema.parse(document.toObject());

    expect(parsed.signature).toBe('393x852@3');
  });

  it('отклоняет запись с недопустимым значением esimConsensus', async () => {
    const document = new TestScreenSignatureModel({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro'],
      esimConsensus: 'unknown',
    });

    await expect(document.validate()).rejects.toThrow();
  });

  it('уникальный индекс построен по полю signature (docs/05 §5.7)', () => {
    const indexes = screenSignatureMongooseSchema.indexes();

    expect(indexes).toContainEqual([{ signature: 1 }, expect.objectContaining({ unique: true })]);
  });
});

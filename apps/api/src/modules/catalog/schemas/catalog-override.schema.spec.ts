import { catalogOverrideSchema, parseCatalogOverride } from '@esim-detector/contracts';
import mongoose from 'mongoose';

import { catalogOverrideMongooseSchema } from './catalog-override.schema';

describe('catalogOverrideMongooseSchema — соответствие типу CatalogOverride (ADR-011)', () => {
  const TestCatalogOverrideModel = mongoose.model(
    'CatalogOverrideSchemaConsistencyTest',
    catalogOverrideMongooseSchema,
  );

  it('принимает полностью валидную запись без ошибок валидации', async () => {
    const sample = parseCatalogOverride({
      deviceId: 'apple-iphone-x',
      patch: { esim: { support: 'not_supported' } },
      reason: 'https://support.apple.com/kb',
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const document = new TestCatalogOverrideModel(sample);

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('round-trip через Mongoose снова проходит catalogOverrideSchema.parse, patch произвольного состава сохраняется целиком', () => {
    const sample = parseCatalogOverride({
      deviceId: 'apple-iphone-x',
      patch: { esim: { support: 'not_supported' }, dataConfidence: 'verified' },
      reason: 'https://support.apple.com/kb',
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const document = new TestCatalogOverrideModel(sample);

    const parsed = catalogOverrideSchema.parse(document.toObject());

    expect(parsed.patch.esim?.support).toBe('not_supported');
    expect(parsed.patch.dataConfidence).toBe('verified');
  });

  it('отклоняет запись без обязательного поля reason', async () => {
    const document = new TestCatalogOverrideModel({
      deviceId: 'apple-iphone-x',
      patch: { dataConfidence: 'verified' },
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
    });

    await expect(document.validate()).rejects.toThrow();
  });

  it('уникальный индекс построен по полю deviceId (docs/05 §5.7)', () => {
    const indexes = catalogOverrideMongooseSchema.indexes();

    expect(indexes).toContainEqual([{ deviceId: 1 }, expect.objectContaining({ unique: true })]);
  });
});

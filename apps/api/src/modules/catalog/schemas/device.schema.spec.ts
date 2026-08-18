import { buildSampleDevice, deviceSchema } from '@esim-detector/contracts';
import mongoose from 'mongoose';

import { deviceMongooseSchema } from './device.schema';

/**
 * Доказательство ADR-011 «схема Mongoose и тип TypeScript должны выводиться из одного
 * объявления, иначе они разойдутся»: типизация `SchemaDefinition<Device>` (device.schema.ts)
 * ловит на этапе `tsc` лишние/неверно типизированные поля, но НЕ пропущенные (mongoose
 * определяет каждый путь `SchemaDefinition` как необязательный) — поэтому решающая проверка
 * здесь выполняется во время выполнения: полностью валидный `Device` должен пройти валидацию
 * Mongoose без ошибок, а результат сохранения должен пройти валидацию `deviceSchema` обратно.
 */
describe('deviceMongooseSchema — соответствие типу Device (ADR-011)', () => {
  // Модель создаётся без подключения к БД — `validateSync()` не требует сети (docs/08 §8.5:
  // модульные тесты не обращаются к базе данных).
  const TestDeviceModel = mongoose.model('DeviceSchemaConsistencyTest', deviceMongooseSchema);

  it('принимает полностью валидную запись Device без ошибок валидации', async () => {
    const sample = buildSampleDevice();
    const document = new TestDeviceModel(sample);

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('результат round-trip через Mongoose снова проходит deviceSchema.parse (contracts)', () => {
    const sample = buildSampleDevice();
    const document = new TestDeviceModel(sample);

    const plain = document.toObject();
    const parsed = deviceSchema.parse(plain);

    expect(parsed._id).toBe(sample._id);
    expect(parsed.esim.support).toBe(sample.esim.support);
  });

  it('верхнеуровневые пути схемы Mongoose покрывают все поля типа Device — расхождение (пропущенное поле) обнаруживается явно', () => {
    const sample = buildSampleDevice();
    const mongooseTopLevelPaths = new Set(
      Object.keys(deviceMongooseSchema.paths).map((path) => path.split('.')[0] ?? path),
    );

    for (const field of Object.keys(sample)) {
      expect(mongooseTopLevelPaths.has(field)).toBe(true);
    }
  });

  it('отклоняет запись с недопустимым значением перечисления platform', async () => {
    const sample = { ...buildSampleDevice(), platform: 'symbian' };
    const document = new TestDeviceModel(sample);

    await expect(document.validate()).rejects.toThrow();
  });

  it('отклоняет запись без обязательного поля brand', async () => {
    const { brand, ...withoutBrand } = buildSampleDevice();
    void brand;
    const document = new TestDeviceModel(withoutBrand);

    await expect(document.validate()).rejects.toThrow();
  });

  it('conditional-запись с непустыми conditions и clarifyingQuestion сохраняется целиком', async () => {
    const sample = buildSampleDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [
          {
            scope: 'region',
            value: 'CN',
            support: 'not_supported',
            note: 'версия для КНР без eSIM',
          },
        ],
        clarifyingQuestion: {
          kind: 'region',
          question: 'Устройство приобретено в Китае?',
          options: [
            { value: 'yes', label: 'Да' },
            { value: 'no', label: 'Нет' },
          ],
        },
        notes: '',
      },
    });
    const document = new TestDeviceModel(sample);

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.toObject().esim.conditions).toHaveLength(1);
    expect(document.toObject().esim.clarifyingQuestion?.question).toBe(
      'Устройство приобретено в Китае?',
    );
  });

  it('индексы схемы включают все индексы docs/05 §5.7', () => {
    const indexKeys = deviceMongooseSchema.indexes().map(([definition]) => definition);

    expect(indexKeys).toContainEqual({ modelCodes: 1 });
    expect(indexKeys).toContainEqual({ brand: 1, family: 1, generation: 1 });
    expect(indexKeys).toContainEqual({ aliases: 1 });
    expect(indexKeys).toContainEqual({ platform: 1, status: 1 });
  });
});

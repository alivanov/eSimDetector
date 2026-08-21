import {
  applyCatalogOverride,
  catalogOverrideSchema,
  parseCatalogOverride,
} from './catalog-override.schema';
import { buildSampleDevice } from './test-fixtures';

const buildOverride = parseCatalogOverride;

describe('catalogOverrideSchema', () => {
  it('отклоняет решение без переопределённых полей (patch пуст)', () => {
    const result = catalogOverrideSchema.safeParse({
      deviceId: 'apple-iphone-x',
      patch: {},
      reason: 'https://example.com',
      decidedBy: 'moderator',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.success).toBe(false);
  });

  it('принимает решение, переопределяющее только esim.support', () => {
    const override = buildOverride({
      deviceId: 'apple-iphone-x',
      patch: { esim: { support: 'not_supported' } },
      reason: 'https://support.apple.com/kb',
      decidedBy: 'moderator-1',
      decidedAt: new Date('2024-06-01'),
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    });

    expect(override.patch.esim?.support).toBe('not_supported');
  });
});

describe('applyCatalogOverride', () => {
  it('возвращает запись без изменений, когда override не передан', () => {
    const device = buildSampleDevice();

    expect(applyCatalogOverride(device)).toBe(device);
  });

  it('объединяет esim поле за полем, сохраняя не тронутые поля исходной записи', () => {
    const device = buildSampleDevice({
      esim: {
        support: 'not_supported',
        dualSim: 'none',
        maxProfiles: null,
        conditions: [],
        clarifyingQuestion: null,
        notes: 'исходное примечание',
      },
    });
    const override = buildOverride({
      deviceId: device._id,
      patch: { esim: { support: 'supported' } },
      reason: 'https://support.apple.com/kb/verified',
      decidedBy: 'moderator-1',
      decidedAt: new Date('2024-06-01'),
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    });

    const merged = applyCatalogOverride(device, override);

    expect(merged.esim.support).toBe('supported');
    expect(merged.esim.notes).toBe('исходное примечание');
    expect(merged.esim.dualSim).toBe('none');
  });

  it('переопределяет dataConfidence, sources и status на верхнем уровне записи', () => {
    const device = buildSampleDevice({ dataConfidence: 'derived', status: 'active' });
    const newSource = {
      url: 'https://example.com',
      title: 'Проверено модератором',
      checkedAt: new Date(),
    };
    const override = buildOverride({
      deviceId: device._id,
      patch: { dataConfidence: 'verified', sources: [newSource], status: 'deprecated' },
      reason: 'ручная проверка',
      decidedBy: 'moderator-2',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const merged = applyCatalogOverride(device, override);

    expect(merged.dataConfidence).toBe('verified');
    expect(merged.sources).toEqual([newSource]);
    expect(merged.status).toBe('deprecated');
  });

  it('позволяет явно очистить maxProfiles/clarifyingQuestion значением null через patch', () => {
    const device = buildSampleDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [{ scope: 'region', value: 'CN', support: 'not_supported', note: '...' }],
        clarifyingQuestion: {
          kind: 'region',
          question: '...',
          options: [{ value: 'yes', label: 'Да' }],
        },
        notes: '',
      },
    });
    const override = buildOverride({
      deviceId: device._id,
      patch: { esim: { support: 'supported', maxProfiles: null, clarifyingQuestion: null } },
      reason: 'проверено вручную — устройство не региональное',
      decidedBy: 'moderator-3',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const merged = applyCatalogOverride(device, override);

    expect(merged.esim.maxProfiles).toBeNull();
    expect(merged.esim.clarifyingQuestion).toBeNull();
  });

  it('заменяет modelCodes/aliases/screenSignatures/deviceType целиком (этап 7, docs/15 §15.4)', () => {
    const device = buildSampleDevice({
      modelCodes: ['SM-S928B'],
      aliases: ['galaxy s24 ultra'],
      screenSignatures: [],
      deviceType: 'phone',
    });
    const override = buildOverride({
      deviceId: device._id,
      patch: {
        modelCodes: ['SM-S928B', 'SM-S9280'],
        aliases: ['galaxy s24 ultra', 'галакси с24 ультра'],
        screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
        deviceType: 'tablet',
      },
      reason: 'модератор: привязка нового кода/сигнатуры',
      decidedBy: 'moderator-4',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const merged = applyCatalogOverride(device, override);

    expect(merged.modelCodes).toEqual(['SM-S928B', 'SM-S9280']);
    expect(merged.aliases).toEqual(['galaxy s24 ultra', 'галакси с24 ультра']);
    expect(merged.screenSignatures).toEqual([
      { cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false },
    ]);
    expect(merged.deviceType).toBe('tablet');
  });
});

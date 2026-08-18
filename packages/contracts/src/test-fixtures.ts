import type { Device } from './device.schema';

/**
 * Строит валидную запись справочника для тестов (docs/05-data-model.md §5.3—5.4) — не
 * экспортируется из `index.ts`: это внутренний помощник тестов пакета, а не часть публичного
 * контракта. `overrides` — поверхностное объединение, глубокие поля (`esim`, `os`, `provenance`)
 * передаются целиком при необходимости их изменить.
 */
export function buildSampleDevice(overrides: Partial<Device> = {}): Device {
  const base: Device = {
    _id: 'samsung-galaxy-s24-ultra',
    brand: 'samsung',
    brandTitle: 'Samsung',
    marketingName: 'Galaxy S24 Ultra',
    displayName: 'Samsung Galaxy S24 Ultra',
    family: 'galaxy-s',
    generation: 24,
    modifiers: ['ultra'],
    modelCodes: ['SM-S928B'],
    aliases: ['galaxy s24 ultra', 's24 ultra'],
    platform: 'android',
    deviceType: 'phone',
    os: { minVersion: null, maxVersion: null },
    screenSignatures: [],
    esim: {
      support: 'supported',
      dualSim: 'physical+esim',
      maxProfiles: 2,
      conditions: [],
      clarifyingQuestion: null,
      notes: '',
    },
    releaseYear: 2024,
    marketPresenceRu: 'official',
    popularity: 0.9,
    sources: [
      { url: 'https://www.samsung.com', title: 'Samsung', checkedAt: new Date('2024-01-01') },
    ],
    dataConfidence: 'verified',
    provenance: {
      source: 'curated',
      batchId: null,
      importedAt: new Date('2024-01-01'),
      agreementCount: null,
    },
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  return { ...base, ...overrides };
}

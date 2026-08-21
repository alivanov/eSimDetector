import { HttpStatus } from '@nestjs/common';
import type { DataConfidence, Device, EsimSupport } from '@esim-detector/contracts';

import { ApiError } from '../../common/errors/api-error';

import type { CreateDeviceDto } from './dto/create-device.dto';

/**
 * `POST /api/v1/admin/devices` (docs/15-moderation.md §15.4: «Создать запись устройства; поле
 * со ссылкой на источник обязательно для статуса "поддерживает"» — то же требование, что
 * ADR-014/ADR-026 предъявляют ко всем остальным источникам `verified`, здесь оно проверяется
 * явно перед сборкой записи, а не полагается на общий инвариант §5.8 п.6 постфактум).
 */
export function buildDeviceFromDto(dto: CreateDeviceDto, now: Date): Device {
  const support: EsimSupport = dto.esimSupport;
  const hasSource = dto.sources !== undefined && dto.sources.length > 0;

  if (support === 'supported' && !hasSource) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Для статуса "поддерживает" обязательна хотя бы одна ссылка на источник (docs/15 §15.4)',
      HttpStatus.BAD_REQUEST,
    );
  }

  const dataConfidence: DataConfidence = hasSource ? 'verified' : 'derived';
  const displayName = `${dto.brandTitle} ${dto.marketingName}`;

  return {
    _id: dto.id,
    brand: dto.brand,
    brandTitle: dto.brandTitle,
    marketingName: dto.marketingName,
    displayName,
    family: dto.family,
    generation: dto.generation ?? null,
    modifiers: dto.modifiers ?? [],
    modelCodes: dto.modelCodes ?? [],
    aliases: [...new Set([...(dto.aliases ?? []), displayName.toLowerCase()])],
    platform: dto.platform,
    deviceType: dto.deviceType,
    os: { minVersion: null, maxVersion: null },
    screenSignatures: [],
    esim: {
      support,
      dualSim: support === 'not_supported' ? 'none' : 'physical+esim',
      maxProfiles: null,
      conditions: [],
      clarifyingQuestion: null,
      notes: dto.notes ?? '',
    },
    releaseYear: dto.releaseYear,
    marketPresenceRu: 'none',
    popularity: dto.popularity ?? 0.5,
    sources: (dto.sources ?? []).map((source) => ({ ...source, checkedAt: now })),
    dataConfidence,
    provenance: {
      source: `moderator:${dto.decidedBy}`,
      batchId: null,
      importedAt: now,
      agreementCount: null,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

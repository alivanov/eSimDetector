import type {
  DataConfidence,
  Device,
  DeviceSource,
  DeviceType,
  EsimInfo,
  Platform,
} from '@esim-detector/contracts';

/**
 * `GET /api/v1/devices/{id}` (docs/06-api-contract.md §6.4: «Полная карточка устройства из
 * справочника, включая источники») — проекция `Device`, а не сама запись целиком: `provenance`
 * (происхождение импорта — партия, дата, число согласившихся источников) не выставляется
 * публично, это внутренний служебный след конвейера (docs/05 §5.3), а не то, что заказчик
 * запрашивает у карточки модели. `esim` передаётся целиком (включая `conditions`/
 * `clarifyingQuestion`), а не сведённой формой `DeviceEsimSummary` — карточка предназначена для
 * страницы каталога/выбора модели, где условная поддержка eSIM тоже значима для пользователя.
 */
export interface DeviceCard {
  readonly id: string;
  readonly brand: string;
  readonly brandTitle: string;
  readonly marketingName: string;
  readonly name: string;
  readonly family: string;
  readonly generation: number | null;
  readonly modifiers: readonly string[];
  readonly modelCodes: readonly string[];
  readonly platform: Platform;
  readonly deviceType: DeviceType;
  readonly esim: EsimInfo;
  readonly releaseYear: number;
  readonly sources: readonly DeviceSource[];
  readonly dataConfidence: DataConfidence;
}

export function toDeviceCard(device: Device): DeviceCard {
  return {
    id: device._id,
    // Слаг бренда (как в `GET /brands` и фильтре `GET /devices?brand=`), а не `brandTitle`:
    // иначе значение из перечня брендов нельзя подставить в фильтр каталога (docs/06 §6.4).
    brand: device.brand,
    brandTitle: device.brandTitle,
    marketingName: device.marketingName,
    name: device.displayName,
    family: device.family,
    generation: device.generation,
    modifiers: device.modifiers,
    modelCodes: device.modelCodes,
    platform: device.platform,
    deviceType: device.deviceType,
    esim: device.esim,
    releaseYear: device.releaseYear,
    sources: device.sources,
    dataConfidence: device.dataConfidence,
  };
}

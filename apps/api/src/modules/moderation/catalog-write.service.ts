import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  CatalogChangeAction,
  CatalogOverride,
  CatalogOverridePatch,
  DataConfidence,
  Device,
  DeviceScreenSignature,
  DeviceSource,
  ScreenSignatureRecord,
} from '@esim-detector/contracts';
import { catalogOverrideSchema, deviceSchema } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { ApiError } from '../../common/errors/api-error';
import { ScreenSignatureService } from '../detection/ios/screen-signature.service';
import { CatalogService } from '../catalog/catalog.service';
import { CATALOG_OVERRIDE_MODEL_NAME } from '../catalog/schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME } from '../catalog/schemas/device.schema';
import { SCREEN_SIGNATURE_MODEL_NAME } from '../catalog/schemas/screen-signature.schema';

import { CatalogChangeLogService } from './catalog-change-log.service';
import { buildSignatureString, collectDevicesForSignature } from './screen-signature-rebuild';
import { computeScreenSignatureConsensus } from './screen-signature-consensus';

export interface ApplyPatchInput {
  readonly deviceId: string;
  readonly patch: CatalogOverridePatch;
  readonly reason: string;
  readonly decidedBy: string;
  readonly taskId: string | null;
  readonly action: CatalogChangeAction;
  readonly field: string | null;
  readonly previousValue: unknown;
}

export interface CreateDeviceInput {
  readonly device: Device;
  readonly reason: string;
  readonly decidedBy: string;
}

/**
 * Общая часть решений «привязать код» и «привязать сигнатуру» (docs/15-moderation.md §15.4).
 * `source` необязателен намеренно: его наличие — единственное, что даёт записи уровень
 * `verified` (§15.4, ADR-026 п.1), а его отсутствие означает привязку без повышения
 * достоверности, а не отказ выполнить решение.
 */
export interface LinkDecisionInput {
  readonly deviceId: string;
  readonly reason: string;
  readonly decidedBy: string;
  readonly taskId: string | null;
  readonly source?: DeviceSource;
}

export interface LinkModelCodeInput extends LinkDecisionInput {
  readonly code: string;
}

export interface LinkScreenSignatureInput extends LinkDecisionInput {
  readonly signature: DeviceScreenSignature;
}

/**
 * Единственное место `apps/api`, которое ПИШЕТ в `devices`/`catalog_overrides`/`screen_signatures`
 * по решению модератора (docs/15-moderation.md §15.4—§15.5) — не расширяет и не переписывает
 * `CatalogModule`/`ScreenSignatureModule` (AGENTS.md, «чего не делать»), а вызывает их уже
 * публичные методы (`CatalogService.reload()`, `ScreenSignatureService.reload()`) после
 * собственной записи, симметрично тому, как `tools/seed` пишет в MongoDB напрямую через
 * `connection.collection(...)`, а не через Mongoose-модели `apps/api`.
 *
 * Каждое действие — атомарная последовательность: запись override/устройства → перечитывание
 * кэша справочника → (для сигнатур) пересборка ОДНОЙ записи `screen_signatures` → перечитывание
 * кэша сигнатур → запись в журнал `catalog_changes`. Тот же порядок операций, что и у
 * `POST /api/v1/admin/catalog/reload` (docs/09-decisions.md, ADR по п.8 передачи), только
 * применённый к одному изменению сразу, без ожидания отдельного вызова.
 *
 * Два инварианта, за которые отвечает именно этот класс как единственный писатель
 * (docs/09-decisions.md ADR-044): записанный документ обязан читаться обратно тем же контрактом
 * (`applyPatch` разбирает `catalogOverrideSchema` ДО записи) и уровень `verified` обязан иметь
 * ссылку на источник (`requireSourceForVerified`).
 */
@Injectable()
export class CatalogWriteService {
  public constructor(
    @InjectModel(CATALOG_OVERRIDE_MODEL_NAME)
    private readonly overrideModel: Model<CatalogOverride>,
    @InjectModel(DEVICE_MODEL_NAME) private readonly deviceModel: Model<Device>,
    @InjectModel(SCREEN_SIGNATURE_MODEL_NAME)
    private readonly screenSignatureModel: Model<ScreenSignatureRecord>,
    private readonly catalogService: CatalogService,
    private readonly screenSignatureService: ScreenSignatureService,
    private readonly changeLog: CatalogChangeLogService,
  ) {}

  private requireDevice(deviceId: string): Device {
    const device = this.catalogService.getSnapshot().devices.get(deviceId);
    if (device === undefined) {
      throw new ApiError(
        'DEVICE_NOT_FOUND',
        `Устройство "${deviceId}" не найдено`,
        HttpStatus.NOT_FOUND,
      );
    }
    return device;
  }

  /**
   * Слияние патчей поле за полем (а не спред целиком) — второй патч, применённый к тому же
   * устройству ПОСЛЕ первого, не должен стирать поля, которых он не касается (например, второе
   * решение меняет только `esim.support`, а первое ранее добавило `modelCodes` — оба обязаны
   * сохраниться в одном документе `catalog_overrides`, docs/05 §5.7: индекс `deviceId` уникален,
   * то есть на устройство — ровно один документ решения).
   */
  private mergePatch(
    existing: CatalogOverridePatch | undefined,
    next: CatalogOverridePatch,
  ): CatalogOverridePatch {
    return {
      ...existing,
      ...next,
      ...(existing?.esim !== undefined || next.esim !== undefined
        ? { esim: { ...existing?.esim, ...next.esim } }
        : {}),
    };
  }

  /**
   * «Статус `verified` присваивается только при указании ссылки на источник» (docs/15 §15.4,
   * ADR-026 п.1, инвариант docs/05 §5.8 п.6) — проверка стоит здесь, в единственной точке записи,
   * а не в каждом действии по отдельности: любой путь, поднимающий уровень до `verified`, обязан
   * принести с собой запись в `sources[]`. Смотрит на `input.patch`, а не на объединённый патч:
   * отвечать за источник обязано именно ТЕКУЩЕЕ решение, а не действие, которое просто добавляет
   * псевдоним записи, уже помеченной `verified` кем-то ранее.
   */
  private requireSourceForVerified(
    device: Device,
    input: ApplyPatchInput,
    mergedPatch: CatalogOverridePatch,
  ): void {
    if (input.patch.dataConfidence !== 'verified') {
      return;
    }
    const effectiveSources = mergedPatch.sources ?? device.sources;
    if (effectiveSources.length === 0) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Уровень достоверности "verified" требует хотя бы одной ссылки на источник (docs/15-moderation.md §15.4)',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Часть патча, отвечающая за достоверность решения о привязке. Ссылка указана — уровень
   * поднимается до `verified`, а сама ссылка ДОБАВЛЯЕТСЯ к уже известным источникам записи (не
   * заменяет их: прежняя сверка вендорской страницы остаётся частью происхождения данных). Ссылки
   * нет — `dataConfidence` не трогается вовсе, то есть решение применяется, но уверенность ответа
   * пользователю от него не растёт (docs/15 §15.4: «Без источника максимум — `derived`»).
   */
  private confidenceFromSource(
    device: Device,
    source: DeviceSource | undefined,
  ): Pick<CatalogOverridePatch, 'dataConfidence' | 'sources'> {
    if (source === undefined) {
      return {};
    }
    const alreadyKnown = device.sources.some((entry) => entry.url === source.url);
    return {
      dataConfidence: 'verified',
      sources: alreadyKnown ? [...device.sources] : [...device.sources, source],
    };
  }

  private async applyPatch(input: ApplyPatchInput): Promise<Device> {
    const device = this.requireDevice(input.deviceId);
    const existingOverride = await this.overrideModel
      .findOne({ deviceId: input.deviceId })
      .lean()
      .exec();
    const mergedPatch = this.mergePatch(existingOverride?.patch, input.patch);
    this.requireSourceForVerified(device, input, mergedPatch);

    const now = new Date();
    /**
     * Разбирается ДОКУМЕНТ ЦЕЛИКОМ, а не только `patch`: `catalog_overrides` читается обратно
     * `catalogOverrideSchema` (`CatalogService.reload()`), поэтому запись, которую эта схема не
     * принимает, — это запись, после которой справочник перестаёт загружаться. Единственный
     * способ гарантировать «записанное читается» — проверить тем же контрактом до записи, а не
     * надеяться на валидаторы Mongoose (`findOneAndUpdate` их не запускает без `runValidators`).
     */
    const validated = catalogOverrideSchema.safeParse({
      deviceId: input.deviceId,
      patch: mergedPatch,
      reason: input.reason,
      decidedBy: input.decidedBy,
      decidedAt: now,
      createdAt: existingOverride?.createdAt ?? now,
      updatedAt: now,
    });
    if (!validated.success) {
      const detail = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ApiError(
        'VALIDATION_ERROR',
        `Решение модератора не соответствует схеме catalog_overrides — ${detail}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.overrideModel.findOneAndUpdate(
      { deviceId: input.deviceId },
      {
        $set: {
          patch: validated.data.patch,
          reason: validated.data.reason,
          decidedBy: validated.data.decidedBy,
          decidedAt: validated.data.decidedAt,
        },
      },
      { upsert: true },
    );

    await this.catalogService.reload();
    const updatedDevice = this.requireDevice(input.deviceId);

    await this.changeLog.append({
      deviceId: input.deviceId,
      taskId: input.taskId,
      action: input.action,
      field: input.field,
      previousValue: input.previousValue,
      newValue: input.field === null ? null : this.readField(updatedDevice, input.field),
      reason: input.reason,
      decidedBy: input.decidedBy,
    });

    return updatedDevice;
  }

  private readField(device: Device, field: string): unknown {
    if (field === 'modelCodes') {
      return device.modelCodes;
    }
    if (field === 'aliases') {
      return device.aliases;
    }
    if (field === 'screenSignatures') {
      return device.screenSignatures;
    }
    if (field === 'esim') {
      return device.esim;
    }
    if (field === 'deviceType') {
      return device.deviceType;
    }
    if (field === 'status') {
      return device.status;
    }
    if (field === 'dataConfidence') {
      return device.dataConfidence;
    }
    if (field === 'sources') {
      return device.sources;
    }
    return undefined;
  }

  /**
   * `PATCH /api/v1/admin/devices/{id}` (docs/15 §15.8) — применяет патч ЦЕЛИКОМ, каким его
   * собрал контроллер из DTO, независимо от того, сколько полей он затрагивает: «Изменить
   * статус eSIM» и «Отметить "не телефон"» (docs/15 §15.4) с точки зрения слоя overrides —
   * частные случаи одного и того же действия, различающиеся только набором полей патча.
   */
  public async genericPatch(
    deviceId: string,
    patch: CatalogOverridePatch,
    reason: string,
    decidedBy: string,
  ): Promise<Device> {
    const device = this.requireDevice(deviceId);
    const keys = Object.keys(patch);
    const singleField = keys.length === 1 ? (keys[0] ?? null) : null;

    return this.applyPatch({
      deviceId,
      patch,
      reason,
      decidedBy,
      taskId: null,
      action: singleField === 'deviceType' ? 'mark_not_phone' : 'update_device',
      field: singleField,
      previousValue: singleField !== null ? this.readField(device, singleField) : null,
    });
  }

  /**
   * «Привязать код к существующему устройству» (docs/15 §15.4). Уровень достоверности становится
   * `verified` ТОЛЬКО при указанной ссылке на источник (`input.source`) — см.
   * `confidenceFromSource`; без ссылки код привязывается, но достоверность записи не меняется.
   */
  public async linkModelCode(input: LinkModelCodeInput): Promise<Device> {
    const device = this.requireDevice(input.deviceId);
    const normalizedCode = input.code.trim();
    const modelCodes = [...new Set([...device.modelCodes, normalizedCode])];

    return this.applyPatch({
      deviceId: input.deviceId,
      patch: { modelCodes, ...this.confidenceFromSource(device, input.source) },
      reason: input.reason,
      decidedBy: input.decidedBy,
      taskId: input.taskId,
      action: 'link_model_code',
      field: 'modelCodes',
      previousValue: device.modelCodes,
    });
  }

  /** «Добавить псевдоним или синоним» (docs/15 §15.4) — применяется без перезапуска. */
  public async addAlias(
    deviceId: string,
    alias: string,
    reason: string,
    decidedBy: string,
  ): Promise<Device> {
    const device = this.requireDevice(deviceId);
    const normalizedAlias = alias.trim().toLowerCase();
    const aliases = [...new Set([...device.aliases, normalizedAlias])];

    return this.applyPatch({
      deviceId,
      patch: { aliases },
      reason,
      decidedBy,
      taskId: null,
      action: 'add_alias',
      field: 'aliases',
      previousValue: device.aliases,
    });
  }

  /** «Изменить статус eSIM» (docs/15 §15.4) — предыдущее значение сохраняется в журнале. */
  public async changeEsimStatus(
    deviceId: string,
    esimPatch: CatalogOverridePatch['esim'],
    dataConfidence: DataConfidence,
    sources: readonly DeviceSource[] | undefined,
    reason: string,
    decidedBy: string,
    taskId: string | null,
  ): Promise<Device> {
    const device = this.requireDevice(deviceId);

    return this.applyPatch({
      deviceId,
      patch: {
        esim: esimPatch,
        dataConfidence,
        ...(sources !== undefined ? { sources: [...sources] } : {}),
      },
      reason,
      decidedBy,
      taskId,
      action: 'change_esim_status',
      field: 'esim',
      previousValue: device.esim,
    });
  }

  /** «Отметить "не телефон"» (docs/15 §15.4). */
  public async markNotPhone(
    deviceId: string,
    deviceType: CatalogOverridePatch['deviceType'],
    reason: string,
    decidedBy: string,
  ): Promise<Device> {
    const device = this.requireDevice(deviceId);

    return this.applyPatch({
      deviceId,
      patch: { deviceType },
      reason,
      decidedBy,
      taskId: null,
      action: 'mark_not_phone',
      field: 'deviceType',
      previousValue: device.deviceType,
    });
  }

  /**
   * «Привязать... сигнатуру к существующему устройству» (docs/15 §15.4) — ветка iOS. Единственное
   * действие, которое кроме `catalog_overrides` пишет ЕЩЁ и производную запись `screen_signatures`
   * напрямую (пункт 8 передачи агента 6.6/431bd8d): без этого действие технически «применяется»
   * (запись в overrides видна на `GET /api/v1/admin/devices/{id}`), но НЕ меняет ответ
   * `POST /api/v1/detect` для пользователей с той же сигнатурой, потому что горячий путь ветки
   * iOS резолюции читает `screen_signatures`, а не `devices.screenSignatures` (docs/05 §5.5).
   */
  public async linkScreenSignature(input: LinkScreenSignatureInput): Promise<Device> {
    const device = this.requireDevice(input.deviceId);
    const { signature } = input;
    const alreadyLinked = device.screenSignatures.some(
      (entry) =>
        entry.cssWidth === signature.cssWidth &&
        entry.cssHeight === signature.cssHeight &&
        entry.dpr === signature.dpr &&
        entry.zoomed === signature.zoomed,
    );
    const screenSignatures = alreadyLinked
      ? device.screenSignatures
      : [...device.screenSignatures, signature];

    const updatedDevice = await this.applyPatch({
      deviceId: input.deviceId,
      patch: { screenSignatures, ...this.confidenceFromSource(device, input.source) },
      reason: input.reason,
      decidedBy: input.decidedBy,
      taskId: input.taskId,
      action: 'link_screen_signature',
      field: 'screenSignatures',
      previousValue: device.screenSignatures,
    });

    await this.rebuildSingleScreenSignature(buildSignatureString(signature));
    return updatedDevice;
  }

  /**
   * Пересборка ОДНОЙ записи `screen_signatures` из СВЕЖЕГО (уже перечитанного) снимка справочника
   * (пункт 8 передачи) — не запускает `tools/seed rebuild-signatures` целиком (инструмент командной
   * строки, отдельный процесс) и не переписывает его пайплайн: пересчитывает и заменяет РОВНО ту
   * запись, кандидатов которой могло затронуть решение модератора, а затем просит
   * `ScreenSignatureService` перечитать кэш. Полная пересборка всех записей остаётся операционной
   * процедурой (`pnpm seed rebuild-signatures`, docs/07 §7.6) — необходима после массового
   * повторного `pnpm seed load`, а не после одного точечного решения.
   */
  private async rebuildSingleScreenSignature(signatureString: string): Promise<void> {
    const snapshot = this.catalogService.getSnapshot();
    const { matches, zoomed } = collectDevicesForSignature(
      snapshot.devices.values(),
      signatureString,
    );

    if (matches.length === 0) {
      await this.screenSignatureModel.deleteOne({ signature: signatureString }).exec();
    } else {
      const esimConsensus = computeScreenSignatureConsensus(matches);
      await this.screenSignatureModel
        .findOneAndUpdate(
          { signature: signatureString },
          {
            $set: {
              signature: signatureString,
              zoomed,
              candidates: matches.map((device) => device._id),
              esimConsensus,
            },
          },
          { upsert: true },
        )
        .exec();
    }

    await this.screenSignatureService.reload();
  }

  /**
   * «Создать запись устройства» (docs/15 §15.4) — записывается НЕПОСРЕДСТВЕННО в `devices`
   * (не в `catalog_overrides`: слой overrides — патч над СУЩЕСТВУЮЩЕЙ записью, а не полноценная
   * новая). Переживает повторный `pnpm seed load`: загрузка выполняет только `upsert` по
   * идентификаторам импорта и не удаляет посторонние записи (`tools/seed/src/mongo/load-devices.ts`).
   */
  public async createDevice(input: CreateDeviceInput): Promise<Device> {
    const validated = deviceSchema.parse(input.device);
    const existing = await this.deviceModel.findById(validated._id).lean().exec();
    if (existing !== null) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Устройство с идентификатором "${validated._id}" уже существует`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.deviceModel.create(validated);
    await this.catalogService.reload();

    await this.changeLog.append({
      deviceId: validated._id,
      taskId: null,
      action: 'create_device',
      field: null,
      previousValue: null,
      newValue: validated,
      reason: input.reason,
      decidedBy: input.decidedBy,
    });

    return this.requireDevice(validated._id);
  }
}

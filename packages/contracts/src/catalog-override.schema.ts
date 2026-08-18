import { z } from 'zod';

import { dataConfidenceSchema, deviceStatusSchema } from './enums';
import { type Device, type EsimInfo, deviceSourceSchema, esimInfoSchema } from './device.schema';

/**
 * Слой решений модератора (docs/05-data-model.md, §5.6: коллекция `catalog_overrides`) —
 * применяется поверх всех прочих источников последним и переживает повторные импорты
 * (ADR-014, docs/14-catalog-ingestion.md §14.4 шаг 6, приоритет 1). Docs не фиксируют
 * буквальную форму документа — она введена этим агентом и задокументирована здесь и в
 * docs/05 §5.6 как принятое решение.
 *
 * `patch` — частичное переопределение ТОЛЬКО тех полей записи, которые реально решает
 * модератор (ADR-014: подтверждение статуса eSIM со ссылкой на источник, повышение
 * достоверности, деактивация устаревшей записи). Остальные поля записи (название, коды,
 * псевдонимы и т. п.) через этот слой не переопределяются намеренно: их источник истины —
 * курируемое ядро и импорт, а не ручное решение по конкретному полю (.cursor/rules/catalog-data.mdc:
 * «Приоритет источников при слиянии... порядок не менять»). Расширение перечня
 * переопределяемых полей — решение потребителя очереди модерации (агент 7), а не этого пакета.
 */
/**
 * Тип патча `esim` выделен в отдельную схему (а не инлайн `esimInfoSchema.partial()`), чтобы
 * `mergeEsimInfo` ниже мог принять ИМЕННО этот выведенный тип: у `zod` необязательное поле
 * после `.partial()` типизируется как `T | undefined` (а не только `?:`), и обычный
 * `Partial<EsimInfo>` (утилита TypeScript) при `exactOptionalPropertyTypes: true` с ним не
 * совпадает — компилятор считает это двумя разными типами, хотя по форме они одинаковы.
 */
export const esimInfoPatchSchema = esimInfoSchema.partial();
export type EsimInfoPatch = z.infer<typeof esimInfoPatchSchema>;

export const catalogOverridePatchSchema = z
  .object({
    esim: esimInfoPatchSchema,
    dataConfidence: dataConfidenceSchema,
    sources: z.array(deviceSourceSchema),
    status: deviceStatusSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Решение модератора обязано переопределять хотя бы одно поле',
  });

export type CatalogOverridePatch = z.infer<typeof catalogOverridePatchSchema>;

export const catalogOverrideSchema = z.object({
  /** Совпадает с `Device["_id"]` — уникальный индекс коллекции (docs/05 §5.7). */
  deviceId: z.string().min(1),
  patch: catalogOverridePatchSchema,
  /** Ссылка на источник решения — обязательна (ADR-014: verified требует ссылки, даже от модератора). */
  reason: z.string().min(1),
  decidedBy: z.string().min(1),
  decidedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CatalogOverride = z.infer<typeof catalogOverrideSchema>;

export function parseCatalogOverride(input: unknown): CatalogOverride {
  return catalogOverrideSchema.parse(input);
}

/**
 * Объединяет `esim` записи с частичным переопределением поле за полем — НЕ через `{...a, ...b}`:
 * при `exactOptionalPropertyTypes` спред необязательных полей `Partial<EsimInfo>` статически
 * даёт тип `T | undefined` даже для обязательных полей результата (известная особенность
 * вывода типов TypeScript для спреда), поэтому объединение выполняется явно, поле за полем.
 */
function mergeEsimInfo(base: EsimInfo, patch: EsimInfoPatch): EsimInfo {
  return {
    support: patch.support ?? base.support,
    dualSim: patch.dualSim ?? base.dualSim,
    maxProfiles: patch.maxProfiles !== undefined ? patch.maxProfiles : base.maxProfiles,
    conditions: patch.conditions ?? base.conditions,
    clarifyingQuestion:
      patch.clarifyingQuestion !== undefined ? patch.clarifyingQuestion : base.clarifyingQuestion,
    notes: patch.notes ?? base.notes,
  };
}

/**
 * Применяет решение модератора поверх записи импорта (docs/14 §14.4 шаг 6, приоритет 1) —
 * чистая функция без побочных эффектов, используется и `CatalogModule` (агент 3, прогрев
 * кэша), и очередью модерации (агент 7, предпросмотр решения до сохранения). Поля, которых
 * `patch` не касается, остаются от исходной записи; `esim` объединяется неглубоко по своим
 * полям (частичная замена `support`/`conditions`/... по отдельности, а не целиком объектом).
 */
export function applyCatalogOverride(device: Device, override?: CatalogOverride): Device {
  if (override === undefined) {
    return device;
  }

  const { patch } = override;
  return {
    ...device,
    ...(patch.esim !== undefined ? { esim: mergeEsimInfo(device.esim, patch.esim) } : {}),
    ...(patch.dataConfidence !== undefined ? { dataConfidence: patch.dataConfidence } : {}),
    ...(patch.sources !== undefined ? { sources: patch.sources } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  };
}

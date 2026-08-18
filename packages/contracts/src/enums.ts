import { z } from 'zod';

/**
 * Перечисляемые значения записи справочника (docs/05-data-model.md, §5.3—5.4) — единственное
 * объявление, из которого выводятся и схема Mongoose (apps/api), и типы TypeScript (ADR-011).
 * Каждый zod-enum ниже — источник истины для соответствующего множества значений; типы
 * TypeScript выводятся через `z.infer`, а не объявляются отдельно.
 */

export const platformSchema = z.enum(['ios', 'android', 'harmonyos', 'other']);
export type Platform = z.infer<typeof platformSchema>;

export const deviceTypeSchema = z.enum(['phone', 'tablet', 'watch', 'laptop', 'other']);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

/** `esim.support` (docs/05 §5.4). */
export const esimSupportSchema = z.enum(['supported', 'not_supported', 'conditional']);
export type EsimSupport = z.infer<typeof esimSupportSchema>;

/**
 * Статус, который может фигурировать ВНУТРИ одного условия `esim.conditions[].support`
 * (docs/05 §5.4, пример `{ support: "not_supported" }`). Значение `conditional` внутри
 * самого условия не допускается намеренно: условие обязано разрешаться в конкретный статус,
 * иначе получилась бы бесконечная вложенность `conditional`-внутри-`conditional`, которую
 * ничем не заканчивающийся сценарий уточнения не может разрешить (ADR-007).
 */
export const esimConditionSupportSchema = z.enum(['supported', 'not_supported']);
export type EsimConditionSupport = z.infer<typeof esimConditionSupportSchema>;

export const dualSimModeSchema = z.enum(['physical+esim', 'dual-esim', 'esim-only', 'none']);
export type DualSimMode = z.infer<typeof dualSimModeSchema>;

/**
 * Область действия условия `esim.conditions[].scope` (docs/05 §5.4). Docs фиксируют дословно
 * только пример `scope: "region"` (случаи 1 и 3 из §5.4). Случай 4 §5.4 («устройства, где
 * eSIM появилась с обновлением ПО, условие по минимальной версии ОС») структурно ТОЖЕ является
 * условием `conditional`, а не отдельным механизмом — поэтому перечень `scope` расширен здесь
 * значением `osVersion`, а не заведён отдельным полем. Решение и его семантика сравнения
 * задокументированы в `packages/esim-rules/src/conditions.ts` и отражены в docs/05 §5.4.
 */
export const esimConditionScopeSchema = z.enum(['region', 'osVersion']);
export type EsimConditionScope = z.infer<typeof esimConditionScopeSchema>;

export const marketPresenceRuSchema = z.enum(['official', 'parallel-import', 'none']);
export type MarketPresenceRu = z.infer<typeof marketPresenceRuSchema>;

/** Достоверность записи справочника (ADR-013, docs/14 §14.4 шаг 7). */
export const dataConfidenceSchema = z.enum(['verified', 'derived', 'unverified', 'quarantined']);
export type DataConfidence = z.infer<typeof dataConfidenceSchema>;

export const deviceStatusSchema = z.enum(['active', 'deprecated']);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

/**
 * Единый перечень статусов результата (docs/06-api-contract.md, §6.1). Ровно три значения —
 * промежуточные и дополнительные статусы не вводятся ни в одном модуле, использующем этот тип.
 */
export const resultStatusSchema = z.enum(['supported', 'not_supported', 'clarification_required']);
export type ResultStatus = z.infer<typeof resultStatusSchema>;

/** Итоговое согласие кандидатов по статусу eSIM (docs/05 §5.5: `screen_signatures.esimConsensus`). */
export const esimConsensusSchema = z.enum(['supported', 'not_supported', 'conditional', 'mixed']);
export type EsimConsensus = z.infer<typeof esimConsensusSchema>;

import type { DataConfidence, Device } from '@esim-detector/contracts';

import type { QuarantineEntry, QuarantineCode, RowNotice } from '../domain/types';
import type { FamilyAggregateReportEntry } from '../pipeline/family-aggregate';

/**
 * Отчёт об импорте (docs/14-catalog-ingestion.md §14.6) — машиночитаемый (`ImportReportData`,
 * записывается как `reports/import-<дата>.json`) и человекочитаемый (`renderMarkdown`,
 * `reports/import-<дата>.md`). Оба формата строятся из ОДНИХ данных — числа в тексте не могут
 * расходиться с числами в JSON, потому что второе не пересчитывается заново.
 */

export interface SourceFileStats {
  readonly source: string;
  readonly batchId: string;
  readonly linesParsed: number;
  readonly linesRealigned: number;
  readonly csvQuarantineCount: number;
}

export interface PreviousSnapshotEntry {
  readonly id: string;
  readonly esimSupport: Device['esim']['support'];
  readonly dataConfidence: DataConfidence;
}

export interface ImportReportInput {
  readonly generatedAt: Date;
  readonly sourceFiles: readonly SourceFileStats[];
  readonly quarantine: readonly QuarantineEntry[];
  readonly notices: readonly RowNotice[];
  readonly noDataCount: number;
  readonly referenceChecked: number;
  readonly referenceMatched: number;
  readonly referenceFileMissing: boolean;
  readonly devices: readonly Device[];
  readonly familyAggregates: readonly FamilyAggregateReportEntry[];
  readonly curatedAppliedCount: number;
  readonly appleRuleAppliedCount: number;
  readonly invariantViolationsCount: number;
  /** Устройств, исключённых из `devices` за нарушение инвариантов §5.8 (docs/09 ADR-029). */
  readonly invariantQuarantinedCount: number;
  readonly previousSnapshot?: readonly PreviousSnapshotEntry[];
}

export interface ImportReportData {
  readonly generatedAt: string;
  readonly totals: {
    readonly linesParsed: number;
    readonly linesRealigned: number;
    readonly accepted: number;
    readonly quarantined: number;
    readonly noData: number;
  };
  readonly quarantineByCode: Readonly<Record<string, number>>;
  readonly quarantineExamples: Readonly<Record<string, readonly string[]>>;
  readonly codePatternRejectionsByBrand: Readonly<Record<string, number>>;
  readonly reference: {
    readonly fileMissing: boolean;
    readonly checked: number;
    readonly matched: number;
    readonly mismatchRate: number;
  };
  readonly byDataConfidence: Readonly<Record<DataConfidence, number>>;
  readonly byBrand: Readonly<Record<string, number>>;
  readonly curatedAppliedCount: number;
  readonly appleRuleAppliedCount: number;
  readonly familyRules: readonly {
    readonly brand: string;
    readonly family: string;
    readonly status: string;
    readonly dataConfidence: DataConfidence;
    readonly recordCount: number;
    readonly resolvedAnswer: string;
  }[];
  readonly invariantViolationsCount: number;
  readonly invariantQuarantinedCount: number;
  readonly diffFromPrevious?: {
    readonly added: number;
    readonly removed: number;
    readonly changedStatus: number;
  };
}

function countBy<T extends string>(items: readonly T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    result[item] = (result[item] ?? 0) + 1;
  }
  return result;
}

function buildQuarantineExamples(
  quarantine: readonly QuarantineEntry[],
): Record<string, readonly string[]> {
  const examples: Record<string, string[]> = {};
  for (const entry of quarantine) {
    const bucket = examples[entry.code] ?? [];
    if (bucket.length < 3) {
      bucket.push(
        `${entry.source}/${entry.batchId}:${entry.lineNumber} — ${entry.rawBrand ?? '?'} "${entry.rawMarketingName ?? '?'}": ${entry.detail}`,
      );
    }
    examples[entry.code] = bucket;
  }
  return examples;
}

function buildCodePatternRejectionsByBrand(notices: readonly RowNotice[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const notice of notices) {
    if (notice.code !== 'CODE_PATTERN_INVALID') {
      continue;
    }
    const [brand] = notice.deviceId.split('-');
    const key = brand ?? notice.deviceId;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function computeDiff(
  devices: readonly Device[],
  previous: readonly PreviousSnapshotEntry[] | undefined,
): ImportReportData['diffFromPrevious'] {
  if (previous === undefined) {
    return undefined;
  }
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const currentIds = new Set(devices.map((device) => device._id));

  let added = 0;
  let changedStatus = 0;
  for (const device of devices) {
    const previousEntry = previousById.get(device._id);
    if (previousEntry === undefined) {
      added += 1;
      continue;
    }
    if (
      previousEntry.esimSupport !== device.esim.support ||
      previousEntry.dataConfidence !== device.dataConfidence
    ) {
      changedStatus += 1;
    }
  }
  const removed = previous.filter((entry) => !currentIds.has(entry.id)).length;

  return { added, removed, changedStatus };
}

export function buildImportReport(input: ImportReportInput): ImportReportData {
  const linesParsed = input.sourceFiles.reduce((sum, file) => sum + file.linesParsed, 0);
  const linesRealigned = input.sourceFiles.reduce((sum, file) => sum + file.linesRealigned, 0);
  const quarantineByCode = countBy(input.quarantine.map((entry) => entry.code));
  const byDataConfidenceRaw = countBy(input.devices.map((device) => device.dataConfidence));
  const byDataConfidence: Record<DataConfidence, number> = {
    verified: byDataConfidenceRaw['verified'] ?? 0,
    derived: byDataConfidenceRaw['derived'] ?? 0,
    unverified: byDataConfidenceRaw['unverified'] ?? 0,
    quarantined: byDataConfidenceRaw['quarantined'] ?? 0,
  };

  const diffFromPrevious = computeDiff(input.devices, input.previousSnapshot);

  return {
    generatedAt: input.generatedAt.toISOString(),
    totals: {
      linesParsed,
      linesRealigned,
      accepted: input.devices.length,
      quarantined: input.quarantine.length,
      noData: input.noDataCount,
    },
    quarantineByCode,
    quarantineExamples: buildQuarantineExamples(input.quarantine),
    codePatternRejectionsByBrand: buildCodePatternRejectionsByBrand(input.notices),
    reference: {
      fileMissing: input.referenceFileMissing,
      checked: input.referenceChecked,
      matched: input.referenceMatched,
      mismatchRate:
        input.referenceChecked === 0 ? 0 : 1 - input.referenceMatched / input.referenceChecked,
    },
    byDataConfidence,
    byBrand: countBy(input.devices.map((device) => device.brand)),
    curatedAppliedCount: input.curatedAppliedCount,
    appleRuleAppliedCount: input.appleRuleAppliedCount,
    familyRules: input.familyAggregates.map((entry) => ({
      brand: entry.rule.brand,
      family: entry.rule.family,
      status: entry.rule.status,
      dataConfidence: entry.rule.dataConfidence,
      recordCount: entry.rule.recordCount,
      resolvedAnswer: entry.resolution.status,
    })),
    invariantViolationsCount: input.invariantViolationsCount,
    invariantQuarantinedCount: input.invariantQuarantinedCount,
    ...(diffFromPrevious !== undefined ? { diffFromPrevious } : {}),
  };
}

const QUARANTINE_CODE_LABELS: Readonly<Record<QuarantineCode, string>> = {
  FIELD_COUNT_MISMATCH: 'Неверное число полей (допустимого выравнивания нет)',
  ENUM_INVALID: 'Значение перечислимого поля вне допустимого набора',
  CONDITION_SYNTAX_INVALID: 'esim_conditions не разобрался при статусе conditional',
  BRAND_UNKNOWN: 'Бренд не найден в словаре известных',
  NAME_UNPARSEABLE: 'Название не разбирается на слоты',
  CODE_COLLISION: 'Один сервисный код у двух разных устройств',
  NAME_COLLISION_CONFLICT: 'Дубликат идентификатора с разным статусом eSIM',
  YEAR_IMPLAUSIBLE: 'Год выпуска вне диапазона 2007…текущий+1',
  ESIM_ANACHRONISM: 'eSIM заявлена у устройства до 2017 года',
  REFERENCE_MISMATCH: 'Противоречит эталонной выборке',
  SOURCE_DISAGREEMENT_UNRESOLVED:
    '"yes" против "no" без "conditional" — не разрешено автоматически',
  IOS_FIELDS_MISSING: 'iOS без сигнатур экрана/os.maxVersion из курируемого ядра',
  // Инварианты §5.8, найденные ПОСЛЕ построения устройств (docs/09-decisions.md ADR-029) — карантин
  // индивидуальной записи (или пары для DUPLICATE_MODEL_CODE/CONFLICTING_ALIAS), а не блокировка
  // загрузки целиком.
  DUPLICATE_DEVICE_ID: 'Инвариант §5.8 п.1: дублирующийся _id',
  DUPLICATE_MODEL_CODE: 'Инвариант §5.8 п.2: сервисный код у двух разных записей',
  CONFLICTING_ALIAS: 'Инвариант §5.8 п.3: псевдоним с разным статусом eSIM у разных записей',
  IOS_SCREEN_SIGNATURES_MISSING: 'Инвариант §5.8 п.4: iOS без screenSignatures',
  IOS_MAX_VERSION_MISSING: 'Инвариант §5.8 п.4: iOS без os.maxVersion',
  CONDITIONAL_CONDITIONS_MISSING: 'Инвариант §5.8 п.5: "conditional" без esim.conditions',
  CONDITIONAL_CLARIFYING_QUESTION_MISSING:
    'Инвариант §5.8 п.5: "conditional" без esim.clarifyingQuestion',
  SUPPORTED_SOURCES_MISSING: 'Инвариант §5.8 п.6: "supported"+"verified" без sources',
  SCREEN_SIGNATURE_CONSENSUS_MISMATCH:
    'Инвариант §5.8 п.7: esimConsensus не совпадает с кандидатами',
  SCREEN_SIGNATURE_UNKNOWN_CANDIDATE:
    'Инвариант §5.8 п.7: сигнатура ссылается на неизвестное устройство',
};

function isKnownQuarantineCode(code: string): code is QuarantineCode {
  return Object.hasOwn(QUARANTINE_CODE_LABELS, code);
}

export function renderMarkdown(report: ImportReportData): string {
  const lines: string[] = [];
  lines.push(`# Отчёт об импорте справочника — ${report.generatedAt}`);
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push(
    `- Строк разобрано: ${report.totals.linesParsed} (восстановлено выравниванием: ${report.totals.linesRealigned})`,
  );
  lines.push(`- Принято в справочник: ${report.totals.accepted}`);
  lines.push(`- В карантине: ${report.totals.quarantined}`);
  lines.push(
    `- Без статуса ни от одного источника (не загружено, не карантин): ${report.totals.noData}`,
  );
  lines.push(
    `- Нарушений инвариантов §5.8 после построения: ${report.invariantViolationsCount} ` +
      `(карантинировано записей: ${report.invariantQuarantinedCount} — docs/09-decisions.md ADR-029)`,
  );
  lines.push('');

  lines.push('## Карантин по кодам нарушений');
  lines.push('');
  lines.push('| Код | Описание | Строк | Примеры |');
  lines.push('| --- | --- | --- | --- |');
  for (const [code, count] of Object.entries(report.quarantineByCode)) {
    const label = isKnownQuarantineCode(code) ? QUARANTINE_CODE_LABELS[code] : code;
    const examples = (report.quarantineExamples[code] ?? []).join('; ');
    lines.push(`| ${code} | ${label} | ${count} | ${examples} |`);
  }
  lines.push('');

  lines.push('## Сервисные коды, отброшенные по шаблону вендора (CODE_PATTERN_INVALID)');
  lines.push('');
  lines.push('| Бренд | Отброшено кодов |');
  lines.push('| --- | --- |');
  for (const [brand, count] of Object.entries(report.codePatternRejectionsByBrand)) {
    lines.push(`| ${brand} | ${count} |`);
  }
  lines.push('');

  lines.push('## Сверка с эталоном');
  lines.push('');
  if (report.reference.fileMissing) {
    lines.push(
      '**Файл `data/fixtures/catalog.reference.json` отсутствует — покрытие эталоном НЕ ПРОВЕРЕНО.** ' +
        'Доля расхождений с эталоном не может быть измерена до появления файла ' +
        '(docs/09-decisions.md, ADR-013, дополнение "вопрос 13 закрыт" — выборку формирует агент 5.4).',
    );
  } else {
    lines.push(`- Пересечение с эталоном: ${report.reference.checked}`);
    lines.push(`- Совпало: ${report.reference.matched}`);
    lines.push(`- Доля расхождений: ${(report.reference.mismatchRate * 100).toFixed(1)}%`);
  }
  lines.push('');

  lines.push('## Распределение по уровню достоверности');
  lines.push('');
  lines.push('| Уровень | Число записей |');
  lines.push('| --- | --- |');
  for (const [level, count] of Object.entries(report.byDataConfidence)) {
    lines.push(`| ${level} | ${count} |`);
  }
  lines.push('');

  lines.push('## Распределение по брендам');
  lines.push('');
  lines.push('| Бренд | Число записей |');
  lines.push('| --- | --- |');
  for (const [brand, count] of Object.entries(report.byBrand)) {
    lines.push(`| ${brand} | ${count} |`);
  }
  lines.push('');

  lines.push('## Слияние с курируемым ядром и правилами');
  lines.push('');
  lines.push(`- Записей заменено курируемым ядром: ${report.curatedAppliedCount}`);
  lines.push(
    `- Записей разрешено правилом Apple по перечню поколений: ${report.appleRuleAppliedCount}`,
  );
  lines.push('');

  lines.push('## Правила уровня линейки (агрегация принятых записей, ADR-021)');
  lines.push('');
  lines.push(
    '| Бренд | Линейка | Статус агрегата | Достоверность | Записей | Ответ пользователю |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const rule of report.familyRules) {
    lines.push(
      `| ${rule.brand} | ${rule.family} | ${rule.status} | ${rule.dataConfidence} | ${rule.recordCount} | ${rule.resolvedAnswer} |`,
    );
  }
  lines.push('');

  lines.push('## Сравнение с предыдущим импортом');
  lines.push('');
  if (report.diffFromPrevious === undefined) {
    lines.push('Предыдущего снимка не найдено — это первый прогон (либо снимок не сохранён).');
  } else {
    lines.push(`- Добавлено записей: ${report.diffFromPrevious.added}`);
    lines.push(`- Удалено записей: ${report.diffFromPrevious.removed}`);
    lines.push(
      `- Изменили статус eSIM либо достоверность: ${report.diffFromPrevious.changedStatus}`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

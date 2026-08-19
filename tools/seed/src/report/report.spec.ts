import { buildSampleDevice } from '@esim-detector/contracts';

import type { QuarantineEntry, RowNotice } from '../domain/types';
import { buildImportReport, renderMarkdown } from './report';

const NOW = new Date('2026-08-18T00:00:00Z');

const QUARANTINE: readonly QuarantineEntry[] = [
  {
    code: 'CODE_COLLISION',
    source: 'llm:model-a',
    batchId: '04a',
    lineNumber: 5,
    detail: 'дубликат кода',
    rawBrand: 'samsung',
    rawMarketingName: 'Galaxy A21',
  },
];

const NOTICES: readonly RowNotice[] = [
  {
    code: 'CODE_PATTERN_INVALID',
    deviceId: 'samsung-galaxy-s9',
    detail: 'код не соответствует шаблону',
  },
  {
    code: 'CODE_PATTERN_INVALID',
    deviceId: 'samsung-galaxy-s10',
    detail: 'код не соответствует шаблону',
  },
];

describe('buildImportReport', () => {
  it('считает итоги по строкам, карантину и распределениям', () => {
    const devices = [
      buildSampleDevice({ _id: 'a', brand: 'samsung', dataConfidence: 'derived' }),
      buildSampleDevice({ _id: 'b', brand: 'apple', dataConfidence: 'verified' }),
    ];
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [
        {
          source: 'llm:model-a',
          batchId: '02',
          linesParsed: 30,
          linesRealigned: 3,
          csvQuarantineCount: 1,
        },
      ],
      quarantine: QUARANTINE,
      notices: NOTICES,
      noDataCount: 2,
      referenceChecked: 10,
      referenceMatched: 9,
      referenceFileMissing: false,
      devices,
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
    });

    expect(report.totals).toEqual({
      linesParsed: 30,
      linesRealigned: 3,
      accepted: 2,
      quarantined: 1,
      noData: 2,
    });
    expect(report.quarantineByCode).toEqual({ CODE_COLLISION: 1 });
    expect(report.codePatternRejectionsByBrand).toEqual({ samsung: 2 });
    expect(report.reference.fileMissing).toBe(false);
    expect(report.reference.checked).toBe(10);
    expect(report.reference.matched).toBe(9);
    expect(report.reference.mismatchRate).toBeCloseTo(0.1);
    expect(report.byDataConfidence).toEqual({
      verified: 1,
      derived: 1,
      unverified: 0,
      quarantined: 0,
    });
    expect(report.byBrand).toEqual({ samsung: 1, apple: 1 });
  });

  it('отмечает отсутствие эталона явно, без деления на ноль', () => {
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [],
      notices: [],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices: [],
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
    });
    expect(report.reference).toEqual({
      fileMissing: true,
      checked: 0,
      matched: 0,
      mismatchRate: 0,
    });
  });

  it('считает разницу с предыдущим снимком', () => {
    const devices = [
      buildSampleDevice({ _id: 'a', esim: { ...buildSampleDevice().esim, support: 'supported' } }),
    ];
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [],
      notices: [],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices,
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
      previousSnapshot: [
        { id: 'a', esimSupport: 'not_supported', dataConfidence: 'derived' },
        { id: 'removed', esimSupport: 'supported', dataConfidence: 'derived' },
      ],
    });
    expect(report.diffFromPrevious).toEqual({ added: 0, removed: 1, changedStatus: 1 });
  });

  it('считает "added", когда устройства нет в предыдущем снимке', () => {
    const devices = [buildSampleDevice({ _id: 'new-device' })];
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [],
      notices: [],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices,
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
      previousSnapshot: [],
    });
    expect(report.diffFromPrevious).toEqual({ added: 1, removed: 0, changedStatus: 0 });
  });

  it('игнорирует уведомления с кодом, отличным от CODE_PATTERN_INVALID', () => {
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [],
      notices: [{ code: 'SOURCE_MISSING', deviceId: 'samsung-galaxy-s9', detail: 'нет источника' }],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices: [],
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
    });
    expect(report.codePatternRejectionsByBrand).toEqual({});
  });
});

describe('renderMarkdown', () => {
  it('строит markdown без исключений на минимальном отчёте', () => {
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [],
      notices: [],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices: [],
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
    });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('# Отчёт об импорте справочника');
    expect(markdown).toContain('ПРОВЕРЕНО');
  });

  it('строит markdown со всеми разделами на заполненном отчёте (эталон, карантин, линейки, диф)', () => {
    const devices = [buildSampleDevice({ _id: 'a', brand: 'samsung', dataConfidence: 'derived' })];
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [
        {
          source: 'llm:model-a',
          batchId: '02',
          linesParsed: 10,
          linesRealigned: 1,
          csvQuarantineCount: 0,
        },
      ],
      quarantine: QUARANTINE,
      notices: NOTICES,
      noDataCount: 1,
      referenceChecked: 5,
      referenceMatched: 4,
      referenceFileMissing: false,
      devices,
      familyAggregates: [
        {
          rule: {
            brand: 'xiaomi',
            family: 'redmi-a',
            status: 'not_supported',
            dataConfidence: 'derived',
            recordCount: 3,
            moderatorConfirmed: false,
          },
          resolution: { status: 'clarification_required', reasons: [] },
        },
      ],
      curatedAppliedCount: 1,
      appleRuleAppliedCount: 1,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
      previousSnapshot: [{ id: 'a', esimSupport: 'not_supported', dataConfidence: 'unverified' }],
    });

    const markdown = renderMarkdown(report);
    expect(markdown).toContain('CODE_COLLISION');
    expect(markdown).toContain('| samsung | 2 |');
    expect(markdown).toContain('Пересечение с эталоном: 5');
    expect(markdown).toContain('xiaomi | redmi-a | not_supported');
    expect(markdown).toContain('Добавлено записей: 0');
  });

  it('подставляет сырой код нарушения, если для него нет русской подписи', () => {
    const report = buildImportReport({
      generatedAt: NOW,
      sourceFiles: [],
      quarantine: [
        {
          code: 'CODE_COLLISION',
          source: 's',
          batchId: 'b',
          lineNumber: 1,
          detail: 'd',
          rawBrand: 'x',
          rawMarketingName: 'y',
        },
      ],
      notices: [],
      noDataCount: 0,
      referenceChecked: 0,
      referenceMatched: 0,
      referenceFileMissing: true,
      devices: [],
      familyAggregates: [],
      curatedAppliedCount: 0,
      appleRuleAppliedCount: 0,
      invariantViolationsCount: 0,
      invariantQuarantinedCount: 0,
    });
    expect(renderMarkdown(report)).toContain('Один сервисный код у двух разных устройств');
  });
});

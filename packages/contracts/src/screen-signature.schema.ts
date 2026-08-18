import { z } from 'zod';

import { esimConsensusSchema } from './enums';

/**
 * Запись производной коллекции `screen_signatures` (docs/05-data-model.md, §5.5) — быстрая
 * резолюция ветки iOS: по сигнатуре экрана сразу возвращается множество кандидатов и заранее
 * посчитанное согласие статусов eSIM среди них, чтобы отвечать за один поиск.
 *
 * Строится агентом 4 (`tools/seed rebuild-signatures`) из принятых записей `devices`; этот
 * пакет фиксирует форму записи и инвариант её согласованности (`invariants.ts`, §5.8 п.7), но
 * не наполняет коллекцию — знания об устройствах остают в `data/catalog/` (ADR-006).
 */
export const screenSignatureRecordSchema = z.object({
  /** Формат `"<cssWidth>x<cssHeight>@<dpr>"`, например `"393x852@3"` (docs/05 §5.5). */
  signature: z.string().min(1),
  /** Экран в режиме «Увеличенный» (docs/03 §3.5, шаг 3) — отдельная сигнатура, а не поле кандидата. */
  zoomed: z.boolean(),
  candidates: z.array(z.string().min(1)).min(1),
  esimConsensus: esimConsensusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ScreenSignatureRecord = z.infer<typeof screenSignatureRecordSchema>;

export function parseScreenSignatureRecord(input: unknown): ScreenSignatureRecord {
  return screenSignatureRecordSchema.parse(input);
}

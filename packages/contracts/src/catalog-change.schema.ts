import { z } from 'zod';

/**
 * Журнал изменений справочника (docs/15-moderation.md §15.6; docs/05-data-model.md §5.6:
 * коллекция `catalog_changes`) — только для чтения, пишется исключительно `ModerationService`
 * при применении решения модератора. Форма документа не зафиксирована docs буквально (как и
 * `CatalogOverride`, агент 3) — вводится здесь.
 *
 * `deviceId` необязателен: действие «Отклонить задачу» (docs/15 §15.4) не касается конкретной
 * записи справочника, но всё равно должно оставлять след в журнале (§15.6: «кто, когда, какая
 * задача» — само действие важно независимо от того, изменило ли оно `devices`).
 */
export const catalogChangeActionSchema = z.enum([
  'link_model_code',
  'link_screen_signature',
  'create_device',
  'update_device',
  'change_esim_status',
  'add_alias',
  'mark_not_phone',
  'confirm_quarantine',
  'reject_quarantine',
  'reject_task',
]);
export type CatalogChangeAction = z.infer<typeof catalogChangeActionSchema>;

export const catalogChangeEntrySchema = z.object({
  _id: z.string().min(1),
  deviceId: z.string().min(1).nullable(),
  taskId: z.string().min(1).nullable(),
  action: catalogChangeActionSchema,
  field: z.string().min(1).nullable(),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().min(1),
  decidedBy: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type CatalogChangeEntry = z.infer<typeof catalogChangeEntrySchema>;

export function parseCatalogChangeEntry(input: unknown): CatalogChangeEntry {
  return catalogChangeEntrySchema.parse(input);
}

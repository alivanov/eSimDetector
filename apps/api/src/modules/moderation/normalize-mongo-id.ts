/**
 * `moderation_tasks`/`catalog_changes` объявляют `_id` в zod-схеме как `string` (docs/05
 * §5.6/§5.7 — оба используют автоматический `ObjectId` Mongoose, в отличие от `devices`, где
 * `_id` — детерминированная строка, заданная явно, `_id: false` в схеме). Документ, прочитанный
 * через `.lean()`, отдаёт `_id` инстансом `ObjectId`, а не строкой — эта функция приводит его к
 * строке ДО валидации `moderationTaskSchema`/`catalogChangeEntrySchema` (ADR-016: тип появляется
 * после разбора схемой, `as` для внешних данных запрещён), а не полагается на то, что zod сам
 * поймёт нестроковый `_id`.
 */
export function normalizeMongoId(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, _id: String(raw['_id']) };
}

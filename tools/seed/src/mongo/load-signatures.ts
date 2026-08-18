import type { ScreenSignatureRecord } from '@esim-detector/contracts';
import type { Connection } from 'mongoose';

import { SCREEN_SIGNATURES_COLLECTION } from './collections';

/**
 * Идемпотентная перезапись `screen_signatures` (docs/05-data-model.md §5.5,
 * `tools/seed rebuild-signatures`) — коллекция целиком производная от `devices`, поэтому,
 * в отличие от `loadDevices`, безопасно заменяется целиком (`deleteMany` + вставка): здесь нет
 * решений модератора, которые нужно сохранить между запусками.
 */
export async function loadScreenSignatures(
  connection: Connection,
  records: readonly ScreenSignatureRecord[],
): Promise<number> {
  const collection = connection.collection(SCREEN_SIGNATURES_COLLECTION);
  await collection.deleteMany({});
  if (records.length === 0) {
    return 0;
  }
  const result = await collection.insertMany([...records]);
  return result.insertedCount;
}

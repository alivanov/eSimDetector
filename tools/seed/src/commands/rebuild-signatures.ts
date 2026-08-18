import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { loadScreenSignatures } from '../mongo/load-signatures';
import { readDevices } from '../mongo/read-collections';
import { rebuildScreenSignatures } from '../pipeline/rebuild-signatures';

export interface RebuildSignaturesOptions {
  readonly mongoUri: string;
}

/**
 * `pnpm seed rebuild-signatures` (docs/05-data-model.md §5.5) — читает `devices` из MongoDB
 * (уже загруженные `load`), пересобирает `screen_signatures` целиком (коллекция производная,
 * решений модератора в ней нет — безопасно заменяется полностью).
 */
export async function runRebuildSignaturesCommand(
  options: RebuildSignaturesOptions,
): Promise<number> {
  const connection = await connectToMongo(options.mongoUri);
  try {
    const devices = await readDevices(connection);
    const now = new Date();
    const records = rebuildScreenSignatures(devices, now);
    const inserted = await loadScreenSignatures(connection, records);
    process.stdout.write(`Пересобрано сигнатур экрана: ${inserted}\n`);
    return 0;
  } finally {
    await disconnectFromMongo(connection);
  }
}

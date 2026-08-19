import {
  applyCatalogOverride,
  validateCatalogInvariants,
  type EsimSupport,
} from '@esim-detector/contracts';

import { defaultPipelinePaths } from '../defaults';
import { fileExists, readJson } from '../io/files';
import { connectToMongo, disconnectFromMongo } from '../mongo/connection';
import { readCatalogOverrides, readDevices } from '../mongo/read-collections';
import {
  compareToReference,
  parseReferenceFile,
  type ReferenceEsimSupport,
} from '../pipeline/reference';

/** `Device.esim.support` ("supported"/"not_supported"/"conditional") → форма эталона ("yes"/"no"/"conditional"). */
function toReferenceSupport(value: EsimSupport): ReferenceEsimSupport {
  if (value === 'supported') {
    return 'yes';
  }
  if (value === 'not_supported') {
    return 'no';
  }
  return 'conditional';
}

export interface VerifyOptions {
  readonly mongoUri: string;
  readonly referencePath?: string;
}

/**
 * `pnpm seed verify` (docs/14-catalog-ingestion.md §14.5) — сверка ЗАГРУЖЕННОЙ базы с эталоном,
 * код возврата для CI: 1, если найдены нарушения инвариантов §5.8 (слой `catalog_overrides`
 * применяется перед проверкой — как это делает `CatalogModule` на чтении, ADR-022 п.5) либо
 * доля расхождений с эталоном ненулевая. Без файла эталона сверка пропускается с явной пометкой
 * (файл появится по решению вопроса 13 — docs/09-decisions.md, ADR-013, дополнение "вопрос 13
 * закрыт"), а не тихо считается пройденной.
 */
export async function runVerifyCommand(options: VerifyOptions): Promise<number> {
  const connection = await connectToMongo(options.mongoUri);
  let exitCode = 0;
  try {
    const [devices, overrides] = await Promise.all([
      readDevices(connection),
      readCatalogOverrides(connection),
    ]);
    const overrideByDeviceId = new Map(overrides.map((override) => [override.deviceId, override]));
    const resolvedDevices = devices.map((device) =>
      applyCatalogOverride(device, overrideByDeviceId.get(device._id)),
    );

    const invariantResult = validateCatalogInvariants(resolvedDevices);
    process.stdout.write(`Устройств в базе: ${resolvedDevices.length}\n`);
    process.stdout.write(`Нарушений инвариантов §5.8: ${invariantResult.violations.length}\n`);
    for (const violation of invariantResult.violations) {
      process.stdout.write(`  [${violation.code}] ${violation.message}\n`);
    }
    if (!invariantResult.valid) {
      exitCode = 1;
    }

    const referencePath = options.referencePath ?? defaultPipelinePaths().referencePath;
    if (!fileExists(referencePath)) {
      process.stdout.write(
        'data/fixtures/catalog.reference.json отсутствует — сверка с эталоном пропущена (docs/09-decisions.md, ADR-013, дополнение "вопрос 13 закрыт")\n',
      );
    } else {
      const parsed = parseReferenceFile(readJson(referencePath));
      if (!parsed.ok) {
        process.stderr.write(
          `catalog.reference.json не прошёл валидацию: ${parsed.errors.join('; ')}\n`,
        );
        exitCode = 1;
      } else {
        const deviceStatuses = new Map(
          resolvedDevices.map((device) => [device._id, toReferenceSupport(device.esim.support)]),
        );
        const comparison = compareToReference(deviceStatuses, parsed.value);
        process.stdout.write(
          `Сверка с эталоном: пересечение ${comparison.intersectionSize}, расхождений ${comparison.mismatches.length} (${(comparison.mismatchRate * 100).toFixed(1)}%)\n`,
        );
        if (comparison.mismatches.length > 0) {
          exitCode = 1;
        }
      }
    }

    return exitCode;
  } finally {
    await disconnectFromMongo(connection);
  }
}

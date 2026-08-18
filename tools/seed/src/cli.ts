#!/usr/bin/env node
import { DEFAULT_MONGODB_URI } from './defaults';
import { runConsensusCommand } from './commands/consensus';
import { runExportOverridesCommand } from './commands/export-overrides';
import { runImportCommand } from './commands/import';
import { runLoadCommand } from './commands/load';
import { runRebuildSignaturesCommand } from './commands/rebuild-signatures';
import { runVerifyCommand } from './commands/verify';

/**
 * CLI-обёртка `tools/seed` (docs/14-catalog-ingestion.md §14.5) — единственное место
 * инструмента, которое читает `process.argv`/`process.env` (.cursor/rules/pure-packages.mdc:
 * дисциплина "окружение — только на верхнем уровне" соблюдена и здесь, хотя формально правило
 * писано про `packages/*`). Подкоманды: import, consensus, load, rebuild-signatures,
 * export-overrides, verify.
 */

function readMongoUri(): string {
  return process.env['MONGODB_URI'] ?? DEFAULT_MONGODB_URI;
}

function readFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function splitCommaList(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const dryRun = readFlag(args, '--dry-run');
  const mongoUri = readMongoUri();

  switch (command) {
    case 'import': {
      const source = readOption(args, '--source');
      return runImportCommand({ dryRun, ...(source !== undefined ? { source } : {}) });
    }

    case 'consensus': {
      const sources = splitCommaList(readOption(args, '--sources'));
      return runConsensusCommand({ dryRun, ...(sources !== undefined ? { sources } : {}) });
    }

    case 'load':
      return runLoadCommand({ dryRun, mongoUri });

    case 'rebuild-signatures':
      return runRebuildSignaturesCommand({ mongoUri });

    case 'export-overrides':
      return runExportOverridesCommand({ mongoUri });

    case 'verify':
      return runVerifyCommand({ mongoUri });

    default:
      process.stderr.write(
        'Использование: pnpm seed <import|consensus|load|rebuild-signatures|export-overrides|verify> [опции]\n',
      );
      return 1;
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Ошибка: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

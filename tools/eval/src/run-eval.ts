import { resolveEvalCliOptions } from './lib/eval-options';
import { runDetectionEval } from './run-detection-eval';
import { runMatchingEval } from './run-matching-eval';

/**
 * `pnpm eval` (docs/08-testing-and-quality.md §8.6) — оба контура последовательно, сводный
 * отчёт печатается каждым прогоном по отдельности (`reports/eval-detection-*.md`,
 * `reports/eval-matching-*.md`); здесь — только объединённый код возврата для CI/консоли.
 */
async function main(): Promise<void> {
  const options = resolveEvalCliOptions();
  console.log('=== Стенд оценки качества: автоопределение (К1) ===');
  const detection = await runDetectionEval(options);

  console.log('\n=== Стенд оценки качества: обработка ввода (К2) ===');
  const matching = await runMatchingEval(options);

  const totalFalsePositives = detection.falsePositives + matching.falsePositives;
  if (totalFalsePositives > 0) {
    console.error(
      `\nИтог: ${totalFalsePositives} ложных определений — целевое значение по К1/К2 равно нулю.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nИтог: ложных определений не обнаружено (К1/К2).');
}

main().catch((error: unknown) => {
  console.error('Прогон стенда оценки качества не выполнен:', error);
  process.exitCode = 1;
});

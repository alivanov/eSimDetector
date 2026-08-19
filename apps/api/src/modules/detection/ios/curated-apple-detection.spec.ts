import { parseDevice, type Device, type ScreenSignatureRecord } from '@esim-detector/contracts';
import { ConfigService } from '@nestjs/config';

import appleCuratedJson from '../../../../../../data/catalog/curated/apple-iphone.json';
import { validateEnv, type EnvConfig } from '../../../config/env.schema';
import { buildCatalogSnapshot } from '../../catalog/catalog.snapshot';
import type { CatalogService } from '../../catalog/catalog.service';
import type { ResolutionLogService } from '../../resolution-log/resolution-log.service';
import { DetectionService } from '../detection.service';
import type { ScreenSignatureService } from './screen-signature.service';

/**
 * Ветка iOS на РЕАЛЬНОМ курируемом ядре Apple (`data/catalog/curated/apple-iphone.json`), а не на
 * фикстурах, подготовленных самим тестом: до появления этого файла корректность ветки iOS была
 * проверена только на искусственных данных (docs/09-decisions.md ADR-024, «Последствия»).
 *
 * Проверяется главное свойство ADR-002 и предметного правила 3 (AGENTS.md): на iOS определяется
 * ГРУППА моделей (`exactModelKnown: false`), и однозначный статус выдаётся там, где он совпадает
 * у всех кандидатов группы. Сигнатуры экранов строятся из тех же записей справочника, что и
 * `tools/seed rebuild-signatures` (группировка по `cssWidth×cssHeight@dpr`); `esimConsensus`
 * веткой определения не читается — она резолвит статусы кандидатов сама (`esim-rules`).
 */

// Файл данных проходит валидацию схемой (`parseDevice`), а не утверждение типа (ADR-016):
// вывод `resolveJsonModule` описывает форму файла на диске, но не гарантирует её.
const CURATED_DEVICES: readonly Device[] = appleCuratedJson.map((raw) => parseDevice(raw));

function buildSignatureRecords(devices: readonly Device[]): readonly ScreenSignatureRecord[] {
  const byKey = new Map<string, string[]>();
  for (const device of devices) {
    for (const signature of device.screenSignatures) {
      const key = `${signature.cssWidth}x${signature.cssHeight}@${signature.dpr}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(device._id);
      byKey.set(key, bucket);
    }
  }
  return [...byKey.entries()].map(([signature, candidates]) => ({
    signature,
    zoomed: false,
    candidates,
    // Ветка определения это поле не читает; для формы записи достаточно консервативного значения.
    esimConsensus: 'mixed',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  }));
}

function buildService(): DetectionService {
  const snapshot = buildCatalogSnapshot(CURATED_DEVICES);
  const catalog: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };

  const records = new Map(buildSignatureRecords(CURATED_DEVICES).map((r) => [r.signature, r]));
  const signatures: Pick<ScreenSignatureService, 'getBySignature'> = {
    getBySignature: (signature) => records.get(signature),
  };

  const log: Pick<ResolutionLogService, 'record' | 'hashSignals'> = {
    record: async () => {},
    hashSignals: () => 'hash',
  };

  const env: EnvConfig = validateEnv({ NODE_ENV: 'test' });

  return new DetectionService(
    catalog as CatalogService,
    signatures as ScreenSignatureService,
    new ConfigService<EnvConfig, true>(env),
    log as ResolutionLogService,
  );
}

/** Сигналы Safari на iPhone: UA-CH недоступны вовсе (ADR-002), версия iOS — из User-Agent. */
function safariSignals(iosVersion: string, width: number, height: number, dpr: number) {
  const uaVersion = iosVersion.replace(/\./g, '_');
  return {
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${uaVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1`,
    screen: { width, height, dpr },
    hardware: { maxTouchPoints: 5 },
  };
}

describe('Ветка iOS на курируемом ядре Apple', () => {
  const service = buildService();

  it('сигнатура 375×667@2 + iOS 26 → определённый ответ "supported" по группе SE 2/3 (шаги 1 и 2 дополняют друг друга)', () => {
    const result = service.detect(safariSignals('26_6_1', 375, 667, 2), {});

    // Сигнатура сама по себе неоднозначна (iPhone 6/6s/7/8 без eSIM и SE 2/3 с eSIM), но
    // iOS 26 физически невозможен на 6/6s/7/8 — остаются только SE 2-го и 3-го поколений.
    expect(result.status).toBe('supported');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.detection.method).toBe('ios_version_and_screen_signature');
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'PLATFORM_DETECTED',
        'IOS_VERSION_IMPLIES_MIN_MODEL',
        'SCREEN_SIGNATURE_MATCHED',
        'CANDIDATES_AGREE_ON_ESIM',
      ]),
    );
  });

  it('сигнатура 414×736@3 + iOS 15 → определённый ответ "not_supported" по группе из трёх Plus', () => {
    const result = service.detect(safariSignals('15_8_8', 414, 736, 3), {});

    // iPhone 6 Plus остановился на iOS 12, поэтому в группе только 6s/7/8 Plus — у всех трёх
    // eSIM отсутствует, значит ответ однозначен без уточнения модели.
    expect(result.status).toBe('not_supported');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.device).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('сигнатура 414×736@3 + iOS 16 → группа сузилась до одной модели, статус тот же', () => {
    const result = service.detect(safariSignals('16_7_16', 414, 736, 3), {});

    // iOS 16 из линейки Plus получил только iPhone 8 Plus — сужение по двум измерениям дало
    // точную модель, что для iOS является приятным исключением, а не ожидаемым результатом.
    expect(result.status).toBe('not_supported');
    expect(result.detection.exactModelKnown).toBe(true);
    expect(result.device?.id).toBe('apple-iphone-8-plus');
  });

  it('сигнатура 420×912@3 → единственный кандидат iPhone Air, модель определена точно', () => {
    const result = service.detect(safariSignals('26_6_1', 420, 912, 3), {});

    expect(result.status).toBe('supported');
    expect(result.detection.exactModelKnown).toBe(true);
    expect(result.device?.id).toBe('apple-iphone-air');
  });

  it('сигнатура 393×852@3 без региона → адресный вопрос про nano-SIM/Китай, а не список моделей (этап 5.3а)', () => {
    const result = service.detect(safariSignals('26_6_1', 393, 852, 3), {});

    // Все кандидаты этой сигнатуры — записи со статусом `conditional` с ОДНИМ и тем же вопросом
    // (регион КНР/ГК/Макао), а региона в сигналах браузера нет вовсе. Список моделей здесь вводил
    // бы в заблуждение о природе вопроса: сервис не знает, iPhone 14 Pro это или 15, — он не знает
    // региона покупки, поэтому задаёт именно этот вопрос (docs/09 ADR-031, закрывает пробел ADR-030).
    expect(result.status).toBe('clarification_required');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      'apple-iphone-14-pro',
      'apple-iphone-15',
      'apple-iphone-15-pro',
      'apple-iphone-16',
    ]);
    expect(result.clarification?.kind).toBe('answer_question');
    expect(result.clarification?.question).toContain('nano-SIM');
    expect(result.clarification?.options?.map((option) => option.id).sort()).toEqual([
      'CN',
      'OTHER',
    ]);
  });

  it('сигнатура 393×852@3 с регионом "CN" → определённый ответ "not_supported" (условие сработало)', () => {
    const result = service.detect(safariSignals('26_6_1', 393, 852, 3), {}, 'unknown', 'CN');

    expect(result.status).toBe('not_supported');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.clarification).toBeUndefined();
    expect(result.reasons.map((reason) => reason.code)).toContain('ESIM_CONDITION_MATCHED_REGION');
  });

  it('сигнатура 393×852@3 с любым другим регионом → определённый ответ "supported" (общий случай conditional)', () => {
    const result = service.detect(safariSignals('26_6_1', 393, 852, 3), {}, 'unknown', 'RU');

    expect(result.status).toBe('supported');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.clarification).toBeUndefined();
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'ESIM_CONDITION_DEFAULT_SUPPORTED',
    );
  });

  it('сигнатура 390×844@3 (17e без условия рядом с условными 12/13/14/16e) → по-прежнему выбор из моделей', () => {
    const result = service.detect(safariSignals('26_6_1', 390, 844, 3), {});

    // iPhone 17e поддерживает eSIM безусловно — у него нет `esim.conditions`, поэтому общего
    // вопроса для всей группы не существует: список моделей — единственный корректный сценарий.
    expect(result.status).toBe('clarification_required');
    expect(result.clarification?.kind).toBe('choose_candidate');
    expect(result.candidates.map((candidate) => candidate.id)).toContain('apple-iphone-17e');
  });

  it('сигнатура 414×736@3 с iOS 15 → "not_supported" сразу, без лишнего уточнения (регрессия)', () => {
    const result = service.detect(safariSignals('15_8_8', 414, 736, 3), {});

    expect(result.status).toBe('not_supported');
    expect(result.clarification).toBeUndefined();
  });

  it('неизвестная сигнатура при известной версии iOS не даёт догадки: только уточнение', () => {
    const result = service.detect(safariSignals('26_6_1', 999, 1777, 3), {});

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.map((reason) => reason.code)).toContain('SCREEN_SIGNATURE_UNKNOWN');
  });
});

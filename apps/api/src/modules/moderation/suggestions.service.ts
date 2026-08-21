import { Inject, Injectable } from '@nestjs/common';
import type { Device } from '@esim-detector/contracts';
import { matchQuery } from '@esim-detector/fuzzy-matcher';
import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { normalizeQuery } from '@esim-detector/text-normalizer';

import { CatalogService } from '../catalog/catalog.service';
import { NORMALIZATION_DICTIONARY } from '../matching/dictionary/normalization-dictionary.provider';
import { ScreenSignatureService } from '../detection/ios/screen-signature.service';

export interface ModelCodeSuggestion {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly matchedCode: string;
  readonly commonPrefixLength: number;
}

export interface ScreenSignatureSuggestion {
  readonly signature: string;
  readonly candidates: readonly string[];
  readonly distance: number;
}

export interface NameSuggestion {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly score: number;
}

const MIN_CODE_PREFIX_LENGTH = 4;
const MAX_SUGGESTIONS = 5;
/** См. `MatchingService.suggest` (`apps/api/src/modules/matching/matching.service.ts`) — тот же приём. */
const SUGGEST_UNREACHABLE_CONFIDENCE_THRESHOLD = 2;

function commonPrefixLength(a: string, b: string): number {
  const upperA = a.toUpperCase();
  const upperB = b.toUpperCase();
  let length = 0;
  while (length < upperA.length && length < upperB.length && upperA[length] === upperB[length]) {
    length += 1;
  }
  return length;
}

/**
 * Подсказки специалисту (docs/15-moderation.md §15.3). Не переписывает `matching`/`detection`
 * (AGENTS.md, «чего не делать») — использует те же публичные пакеты (`text-normalizer`,
 * `fuzzy-matcher`) независимо, симметрично тому, как это уже делают `MatchingService` и
 * `DetectionService` каждый по отдельности, а не через общий сервис между модулями (это и
 * избавляет от циклической зависимости `ModerationModule` ↔ `MatchingModule`: подсказки по
 * названию нужны модерации, а запись задач `unmatched_query`/`ambiguous_query` нужна из
 * `MatchingService` — если бы оба модуля зависели друг от друга напрямую, получился бы цикл).
 */
@Injectable()
export class SuggestionsService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly screenSignatureService: ScreenSignatureService,
    @Inject(NORMALIZATION_DICTIONARY) private readonly dictionary: NormalizationDictionary,
  ) {}

  /** «По сервисному коду» (docs/15 §15.3): неизвестный код сопоставляется по префиксу с известным. */
  public suggestByModelCode(unknownCode: string): readonly ModelCodeSuggestion[] {
    const devices = [...this.catalogService.getSnapshot().devices.values()].filter(
      (device) => device.status === 'active',
    );
    const suggestions: ModelCodeSuggestion[] = [];

    for (const device of devices) {
      for (const code of device.modelCodes) {
        const length = commonPrefixLength(unknownCode, code);
        if (length >= MIN_CODE_PREFIX_LENGTH) {
          suggestions.push({
            deviceId: device._id,
            deviceName: device.displayName,
            matchedCode: code,
            commonPrefixLength: length,
          });
        }
      }
    }

    return suggestions
      .sort((a, b) => b.commonPrefixLength - a.commonPrefixLength)
      .slice(0, MAX_SUGGESTIONS);
  }

  /** «По названию» (docs/15 §15.3): ближайшие кандидаты с оценками для несопоставленного запроса. */
  public suggestByName(rawQuery: string): readonly NameSuggestion[] {
    const snapshot = this.catalogService.getSnapshot();
    const normalized = normalizeQuery(rawQuery, this.dictionary);
    const decision = matchQuery(normalized.slots, snapshot.matchIndex, {
      queryText: normalized.normalized,
      thresholds: {
        confidenceThreshold: SUGGEST_UNREACHABLE_CONFIDENCE_THRESHOLD,
        gapThreshold: 0,
        maxClarificationCandidates: MAX_SUGGESTIONS,
      },
    });

    const suggestions: NameSuggestion[] = [];
    for (const candidate of decision.candidates) {
      const device: Device | undefined = snapshot.devices.get(candidate.device.id);
      if (device !== undefined) {
        suggestions.push({
          deviceId: device._id,
          deviceName: device.displayName,
          score: candidate.score,
        });
      }
    }
    return suggestions;
  }

  /** «По сигнатуре экрана» (docs/15 §15.3): известные сигнатуры с наименьшим отличием. */
  public suggestByScreenSignature(
    cssWidth: number,
    cssHeight: number,
    dpr: number,
  ): readonly ScreenSignatureSuggestion[] {
    const parsed = this.screenSignatureService.entries().map((record) => {
      const [dimensions, dprPart] = record.signature.split('@');
      const [widthPart, heightPart] = (dimensions ?? '').split('x');
      return {
        record,
        width: Number(widthPart),
        height: Number(heightPart),
        dpr: Number(dprPart),
      };
    });

    return parsed
      .filter((entry) => Number.isFinite(entry.width) && Number.isFinite(entry.height))
      .map((entry) => ({
        signature: entry.record.signature,
        candidates: entry.record.candidates,
        distance:
          Math.abs(entry.width - cssWidth) +
          Math.abs(entry.height - cssHeight) +
          Math.abs(entry.dpr - dpr) * 100,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_SUGGESTIONS);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CatalogAnswerPolicy,
  Device,
  EsimResolutionContext,
  ResultStatus,
} from '@esim-detector/contracts';
import {
  resolveCandidateGroupEsimStatus,
  resolveDeviceEsimStatus,
} from '@esim-detector/esim-rules';
import type {
  DecisionThresholds,
  MatchDecision,
  ScoredCandidate,
} from '@esim-detector/fuzzy-matcher';
import { matchQuery } from '@esim-detector/fuzzy-matcher';
import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { normalizeQuery } from '@esim-detector/text-normalizer';

import type { EnvConfig } from '../../config/env.schema';
import type {
  ApiReason,
  Clarification,
  DeviceSummary,
  MatchSummary,
  Presentation,
} from '../../common/response';
import { buildPresentation, toDeviceSummary, toMatchSummary } from '../../common/response';
import { findSharedClarifyingQuestion } from '../detection/ios/build-ios-clarification';
import { CatalogService } from '../catalog/catalog.service';
import { ModerationTaskService } from '../moderation/moderation-task.service';

import { NORMALIZATION_DICTIONARY } from './dictionary/normalization-dictionary.provider';
import type { SuggestItem } from './search-response';

/**
 * Оркестрация конвейера docs/04-matching-algorithm.md §4.3—4.7: нормализация (`text-normalizer`)
 * → отбор кандидатов по индексам `CatalogService.getSnapshot()` → нечёткое сопоставление
 * (`fuzzy-matcher`) → вывод статуса eSIM (`esim-rules`) → формирование ответа. Ни слотовый
 * разбор, ни жёсткие ограничения здесь не переизобретаются (ADR-019/ADR-020) — модуль вызывает
 * готовые пакеты и добавляет только то, что требует справочника и состояния приложения (ADR-019).
 */

export interface SearchResult {
  readonly query: { readonly raw: string; readonly normalized: string };
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly device: DeviceSummary | null;
  readonly matches: readonly MatchSummary[];
  readonly reasons: readonly ApiReason[];
  readonly clarification?: Clarification;
  readonly presentation: Presentation;
}

export interface SuggestResult {
  readonly query: { readonly raw: string; readonly normalized: string };
  readonly suggestions: readonly SuggestItem[];
}

/**
 * Порог решения выше максимально достижимой оценки (`scoreCandidate` нормирует сумму весов до
 * `1`) — намеренный приём, а не ошибка: при таком пороге `decide` (`fuzzy-matcher/decision.ts`)
 * никогда не проходит ветку "оценка лидера >= порога" и всегда возвращает СПИСОК до
 * `maxClarificationCandidates` кандидатов (branch "ниже порога"), что и нужно подсказкам
 * (docs/04 §4.8: «до 10 вариантов»), а не решение "устройство определено". Жёсткие ограничения
 * (`rejectCandidate`) и обе ступени отбора при этом применяются как обычно — подсказка не может
 * предложить кандидата с несовпадающим поколением/модификатором.
 */
const SUGGEST_UNREACHABLE_CONFIDENCE_THRESHOLD = 2;

@Injectable()
export class MatchingService {
  public constructor(
    private readonly catalogService: CatalogService,
    @Inject(NORMALIZATION_DICTIONARY) private readonly dictionary: NormalizationDictionary,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly moderationTaskService: ModerationTaskService,
  ) {}

  private policy(): CatalogAnswerPolicy {
    return {
      allowDerivedCatalogAnswers: this.configService.get('ALLOW_DERIVED_CATALOG_ANSWERS', {
        infer: true,
      }),
      allowUnverifiedCatalogAnswers: this.configService.get('ALLOW_UNVERIFIED_CATALOG_ANSWERS', {
        infer: true,
      }),
    };
  }

  private thresholds(): DecisionThresholds {
    return {
      confidenceThreshold: this.configService.get('CONFIDENCE_ANSWER_THRESHOLD', { infer: true }),
      gapThreshold: this.configService.get('CONFIDENCE_GAP_THRESHOLD', { infer: true }),
    };
  }

  /**
   * `region` — ТОЛЬКО явный ответ пользователя на адресный вопрос уточнения (docs/06 §6.3,
   * ADR-007), симметрично `context.region` `/detect` (ADR-003: не выводится из `locale`/IP).
   */
  public search(rawQuery: string, region?: string): SearchResult {
    const snapshot = this.catalogService.getSnapshot();
    const normalized = normalizeQuery(rawQuery, this.dictionary);
    const policy = this.policy();
    const esimContext: EsimResolutionContext = region !== undefined ? { region } : {};

    const decision = matchQuery(normalized.slots, snapshot.matchIndex, {
      queryText: normalized.normalized,
      thresholds: this.thresholds(),
      constraints: { knownBrands: this.knownBrands(snapshot.devices) },
      // docs/04 §4.7: «если статус eSIM у всех кандидатов совпадает, ответ выдаётся сразу» —
      // кандидаты, иначе давшие бы уточнение по разрыву оценок, эквивалентны, когда конвейер
      // вывода статуса дал бы им один и тот же итоговый статус (с учётом того же региона).
      resolveEquivalenceKey: (deviceId) =>
        this.resolveEquivalenceKey(deviceId, esimContext, policy),
    });

    return this.buildSearchResult(
      normalized.raw,
      normalized.normalized,
      decision,
      snapshot.devices,
      policy,
      esimContext,
    );
  }

  private knownBrands(devices: ReadonlyMap<string, Device>): ReadonlySet<string> {
    return new Set([...devices.values()].map((device) => device.brand.toLowerCase()));
  }

  private resolveEquivalenceKey(
    deviceId: string,
    esimContext: EsimResolutionContext,
    policy: CatalogAnswerPolicy,
  ): string {
    const device = this.catalogService.getSnapshot().devices.get(deviceId);
    if (device === undefined) {
      return deviceId;
    }
    return resolveDeviceEsimStatus(device, esimContext, policy).status;
  }

  private buildSearchResult(
    raw: string,
    normalizedText: string,
    decision: MatchDecision,
    devices: ReadonlyMap<string, Device>,
    policy: CatalogAnswerPolicy,
    esimContext: EsimResolutionContext,
  ): SearchResult {
    const query = { raw, normalized: normalizedText };
    const reasons: ApiReason[] = decision.reasons.map((code) => ({ code }));

    if (decision.status === 'determined') {
      return this.buildDeterminedResult(
        query,
        decision.candidates,
        devices,
        policy,
        reasons,
        esimContext,
      );
    }

    if (decision.status === 'not_found') {
      void this.moderationTaskService.recordUnmatchedQuery({
        rawQuery: query.raw,
        normalizedQuery: query.normalized,
      });
      return {
        query,
        status: 'clarification_required',
        confidence: 0,
        device: null,
        matches: [],
        reasons,
        clarification: {
          kind: 'manual_input',
          question: 'Не удалось найти устройство по названию. Выберите модель из каталога вручную.',
        },
        presentation: buildPresentation({
          status: 'clarification_required',
          exactModelKnown: false,
        }),
      };
    }

    return this.buildAmbiguousResult(query, decision.candidates, devices, reasons);
  }

  private buildDeterminedResult(
    query: { readonly raw: string; readonly normalized: string },
    candidates: readonly ScoredCandidate[],
    devices: ReadonlyMap<string, Device>,
    policy: CatalogAnswerPolicy,
    matchReasons: readonly ApiReason[],
    esimContext: EsimResolutionContext,
  ): SearchResult {
    const live: { readonly candidate: ScoredCandidate; readonly device: Device }[] = [];
    for (const candidate of candidates) {
      const device = devices.get(candidate.device.id);
      if (device !== undefined) {
        live.push({ candidate, device });
      }
    }

    if (live.length === 0) {
      return {
        query,
        status: 'clarification_required',
        confidence: 0,
        device: null,
        matches: [],
        reasons: matchReasons,
        clarification: {
          kind: 'manual_input',
          question: 'Не удалось найти устройство по названию. Выберите модель из каталога вручную.',
        },
        presentation: buildPresentation({
          status: 'clarification_required',
          exactModelKnown: false,
        }),
      };
    }

    // Группа эквивалентности (ADR-002, docs/04 §4.7): статус eSIM общий, точная модель —
    // нет. Не выбираем лидера как device с exactModelKnown:true (иначе «iphone pro» → 17 Pro).
    if (live.length > 1) {
      return this.buildGroupDeterminedResult(query, live, policy, matchReasons, esimContext);
    }

    const leader = live[0]?.candidate;
    const leaderDevice = live[0]?.device;
    if (leader === undefined || leaderDevice === undefined) {
      return {
        query,
        status: 'clarification_required',
        confidence: 0,
        device: null,
        matches: [],
        reasons: matchReasons,
        clarification: {
          kind: 'manual_input',
          question: 'Не удалось найти устройство по названию. Выберите модель из каталога вручную.',
        },
        presentation: buildPresentation({
          status: 'clarification_required',
          exactModelKnown: false,
        }),
      };
    }

    const resolution = resolveDeviceEsimStatus(leaderDevice, esimContext, policy);
    const reasons: ApiReason[] = [
      ...matchReasons,
      ...resolution.reasons.map((reason) => ({ ...reason })),
    ];

    return {
      query,
      status: resolution.status,
      confidence: leader.score,
      device: toDeviceSummary(leaderDevice),
      matches: [],
      reasons,
      ...(resolution.clarification !== undefined
        ? {
            // EsimClarifyingQuestion.kind — scope условия ("region"/"osVersion", docs/05 §5.4),
            // а не kind API-уровня (docs/06 §6.2) — вопрос по условию всегда предъявляется
            // пользователю как "answer_question" (один точный вопрос), а не выбор из списка.
            clarification: {
              kind: 'answer_question' as const,
              question: resolution.clarification.question,
              options: resolution.clarification.options.map((option) => ({
                id: option.value,
                label: option.label,
              })),
            },
          }
        : resolution.status === 'clarification_required'
          ? {
              clarification: {
                kind: 'check_on_device' as const,
                question:
                  'Устройство определено, но данные о поддержке eSIM пока не подтверждены. Проверьте наличие eSIM в настройках устройства.',
              },
            }
          : {}),
      presentation: buildPresentation({
        status: resolution.status,
        deviceName: leaderDevice.displayName,
        exactModelKnown: true,
        ...(resolution.clarification !== undefined
          ? { clarificationQuestion: resolution.clarification.question }
          : {}),
      }),
    };
  }

  /**
   * Ответ при `decision.status === 'determined'` и нескольких живых кандидатах
   * (`DECISION_RESOLVED_BY_EQUIVALENCE`): статус группы — только при согласии всех записей;
   * `device` всегда `null`, `exactModelKnown: false` (как группа iOS, ADR-002).
   */
  private buildGroupDeterminedResult(
    query: { readonly raw: string; readonly normalized: string },
    live: readonly { readonly candidate: ScoredCandidate; readonly device: Device }[],
    policy: CatalogAnswerPolicy,
    matchReasons: readonly ApiReason[],
    esimContext: EsimResolutionContext,
  ): SearchResult {
    const groupResolution = resolveCandidateGroupEsimStatus(
      live.map(({ device }) => ({
        esim: device.esim,
        dataConfidence: device.dataConfidence,
      })),
      esimContext,
      policy,
    );
    const reasons: ApiReason[] = [
      ...matchReasons,
      ...groupResolution.reasons.map((reason) => ({ ...reason })),
    ];
    const leaderScore = live[0]?.candidate.score ?? 0;

    if (groupResolution.status === 'supported' || groupResolution.status === 'not_supported') {
      return {
        query,
        status: groupResolution.status,
        confidence: leaderScore,
        device: null,
        matches: [],
        reasons,
        presentation: buildPresentation({
          status: groupResolution.status,
          exactModelKnown: false,
        }),
      };
    }

    // ADR-045 / docs/03 §3.7 п.2: единогласное уточнение по одному и тому же условию
    // (регион/ОС) — задаём этот вопрос, а не список моделей. Иначе «iPhone 15» после
    // расширения на Pro/Plus считался бы избыточным choose_candidate при том, что статус
    // eSIM у всех кандидатов разрешается одним ответом.
    const sharedQuestion = findSharedClarifyingQuestion(live.map(({ device }) => device));
    if (sharedQuestion !== undefined) {
      return {
        query,
        status: 'clarification_required',
        confidence: leaderScore,
        device: null,
        matches: [],
        reasons,
        clarification: {
          kind: 'answer_question',
          question: sharedQuestion.question,
          options: sharedQuestion.options.map((option) => ({
            id: option.value,
            label: option.label,
          })),
        },
        presentation: buildPresentation({
          status: 'clarification_required',
          exactModelKnown: false,
          clarificationQuestion: sharedQuestion.question,
        }),
      };
    }

    // Согласие «всем нужно уточнение» без общего clarifyingQuestion (часто гейт unverified
    // у пары base/Pro) — не список моделей: пользователь не выбирает между недостоверными
    // записями. Тот же check_on_device, что у одиночной записи без условия.
    if (reasons.some((reason) => reason.code === 'CANDIDATES_AGREE_ON_CLARIFICATION')) {
      return {
        query,
        status: 'clarification_required',
        confidence: leaderScore,
        device: null,
        matches: [],
        reasons,
        clarification: {
          kind: 'check_on_device',
          question:
            'Устройство определено, но данные о поддержке eSIM пока не подтверждены. Проверьте наличие eSIM в настройках устройства.',
        },
        presentation: buildPresentation({
          status: 'clarification_required',
          exactModelKnown: false,
        }),
      };
    }

    return this.buildAmbiguousResult(
      query,
      live.map(({ candidate }) => candidate),
      new Map(live.map(({ device }) => [device._id, device])),
      reasons,
    );
  }

  private buildAmbiguousResult(
    query: { readonly raw: string; readonly normalized: string },
    candidates: readonly ScoredCandidate[],
    devices: ReadonlyMap<string, Device>,
    matchReasons: readonly ApiReason[],
  ): SearchResult {
    const matches: MatchSummary[] = [];
    for (const candidate of candidates) {
      const device = devices.get(candidate.device.id);
      if (device !== undefined) {
        matches.push(toMatchSummary(device, candidate.score));
      }
    }
    const leaderScore = candidates[0]?.score ?? 0;

    void this.moderationTaskService.recordAmbiguousQuery({
      rawQuery: query.raw,
      normalizedQuery: query.normalized,
      candidateIds: matches.map((match) => match.id),
    });

    return {
      query,
      status: 'clarification_required',
      confidence: leaderScore,
      device: null,
      matches,
      reasons: matchReasons,
      clarification: {
        kind: 'choose_candidate',
        question: 'Уточните модель устройства',
        options: [
          ...matches.map((match) => ({ id: match.id, label: match.name })),
          { id: '__other__', label: 'Другая модель' },
        ],
      },
      presentation: buildPresentation({ status: 'clarification_required', exactModelKnown: false }),
    };
  }

  public suggest(rawQuery: string, limit: number): SuggestResult {
    const snapshot = this.catalogService.getSnapshot();
    const normalized = normalizeQuery(rawQuery, this.dictionary);

    const decision = matchQuery(normalized.slots, snapshot.matchIndex, {
      queryText: normalized.normalized,
      thresholds: {
        confidenceThreshold: SUGGEST_UNREACHABLE_CONFIDENCE_THRESHOLD,
        gapThreshold: 0,
        maxClarificationCandidates: limit,
      },
      constraints: { knownBrands: this.knownBrands(snapshot.devices) },
    });

    const suggestions: SuggestItem[] = [];
    for (const candidate of decision.candidates) {
      const device = snapshot.devices.get(candidate.device.id);
      if (device !== undefined) {
        suggestions.push({ id: device._id, name: device.displayName, brand: device.brandTitle });
      }
    }

    return {
      query: { raw: normalized.raw, normalized: normalized.normalized },
      suggestions,
    };
  }
}

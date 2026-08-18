import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CatalogAnswerPolicy,
  Device,
  EsimResolutionContext,
  Platform,
} from '@esim-detector/contracts';
import {
  resolveCandidateGroupEsimStatus,
  resolveDeviceEsimStatus,
} from '@esim-detector/esim-rules';

import type { ApiReason, Clarification } from '../../common/response';
import { buildPresentation, toCandidateSummary, toDeviceSummary } from '../../common/response';
import type { EnvConfig } from '../../config/env.schema';
import { CatalogService } from '../catalog/catalog.service';
import { ResolutionLogService } from '../resolution-log/resolution-log.service';

import { resolveAndroidDevice } from './android/resolve-android';
import { BASE_CONFIDENCE, applyConfidenceGate, applyHeaderConsistency } from './confidence';
import type { DetectionInfo, DetectResponse } from './detect-response';
import type { DetectionSignals, RequestHeaderSignals } from './detection-signals';
import { detectEmulation } from './emulation/detect-emulation';
import { checkHeaderConsistency, type HeaderConsistencyResult } from './header-consistency';
import { buildScreenSignatureKey } from './ios/build-screen-signature-key';
import { ScreenSignatureService } from './ios/screen-signature.service';
import { selectIosCandidates } from './ios/select-ios-candidates';
import { classifyPlatform } from './platform/classify-platform';
import {
  parseAndroidVersionFromUserAgent,
  parseIosVersionFromUserAgent,
} from './platform/parse-user-agent';

export type DetectResult = Omit<DetectResponse, 'requestId'>;

/**
 * Оркестрация автоопределения (docs/03-detection-algorithm.md, §3.3): классификация платформы →
 * проверка на эмуляцию → ветка Android/HarmonyOS/iOS → вывод статуса eSIM (`esim-rules`) → расчёт
 * уверенности (§3.6) → формирование ответа. Каждый шаг вынесен в чистую функцию своего файла —
 * этот сервис только связывает их и добавляет то, что требует состояния приложения (справочник,
 * конфигурация), симметрично `MatchingService` (ADR-019 для модуля `matching`).
 */
@Injectable()
export class DetectionService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly screenSignatureService: ScreenSignatureService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly resolutionLogService: ResolutionLogService,
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

  private answerThreshold(): number {
    return this.configService.get('CONFIDENCE_ANSWER_THRESHOLD', { infer: true });
  }

  /**
   * `requestId` — только для журнала resolution_logs (docs/05 §5.6), не влияет на алгоритм.
   * Запись в журнал выполняется в фоне (`void`, без ожидания) — сбой или задержка записи не
   * должны замедлять или ломать ответ пользователю (ADR-008: результат определения — не ошибка,
   * и служебный журнал тем более не должен становиться источником отказа).
   */
  public detect(
    signals: DetectionSignals | undefined,
    headers: RequestHeaderSignals,
    requestId = 'unknown',
  ): DetectResult {
    const startedAt = Date.now();
    const result = this.resolveDetection(signals, headers);

    void this.resolutionLogService.record({
      requestId,
      signals,
      platform: result.detection.platform,
      status: result.status,
      confidence: result.confidence,
      reasonCodes: result.reasons.map((reason) => reason.code),
      durationMs: Date.now() - startedAt,
    });

    return result;
  }

  private resolveDetection(
    signals: DetectionSignals | undefined,
    headers: RequestHeaderSignals,
  ): DetectResult {
    const platform = classifyPlatform(signals);
    const emulation = detectEmulation({ platform, signals });

    if (emulation.suspected) {
      return this.buildClarificationOnly(
        platform,
        [
          { code: 'PLATFORM_DETECTED', detail: platform },
          ...emulation.details.map((detail) => ({ code: 'EMULATION_SUSPECTED', detail })),
        ],
        {
          kind: 'manual_input',
          question:
            'Не удалось подтвердить подлинность сигналов устройства. Уточните модель вручную.',
        },
      );
    }

    const headerConsistency = checkHeaderConsistency(signals, headers);
    const consistencyReason = this.consistencyReason(headerConsistency);

    if (platform === 'android' || platform === 'harmonyos') {
      return this.detectAndroidLike(platform, signals, headerConsistency, consistencyReason);
    }
    if (platform === 'ios') {
      return this.detectIos(signals, headerConsistency, consistencyReason);
    }

    const hasAnySignal =
      signals !== undefined && (signals.userAgent !== undefined || signals.uaData !== undefined);
    return this.buildClarificationOnly(
      platform,
      [hasAnySignal ? { code: 'PLATFORM_NOT_MOBILE', detail: platform } : { code: 'NO_SIGNALS' }],
      {
        kind: 'manual_input',
        question:
          'Не удалось определить мобильное устройство. Откройте эту страницу на телефоне либо выберите модель вручную.',
      },
    );
  }

  private consistencyReason(consistency: HeaderConsistencyResult): ApiReason | undefined {
    if (consistency === 'consistent') {
      return { code: 'SIGNAL_HEADERS_CONSISTENT' };
    }
    if (consistency === 'inconsistent') {
      return { code: 'SIGNAL_HEADERS_INCONSISTENT' };
    }
    return undefined;
  }

  private detectAndroidLike(
    platform: Platform,
    signals: DetectionSignals | undefined,
    headerConsistency: HeaderConsistencyResult,
    consistencyReason: ApiReason | undefined,
  ): DetectResult {
    const snapshot = this.catalogService.getSnapshot();
    const androidResolution = resolveAndroidDevice(signals, snapshot.matchIndex.aliasIndex);
    const baseReasons: ApiReason[] = [
      { code: 'PLATFORM_DETECTED', detail: platform },
      ...androidResolution.reasons,
    ];

    const device =
      androidResolution.deviceId === undefined
        ? undefined
        : snapshot.devices.get(androidResolution.deviceId);

    if (device === undefined) {
      return this.buildClarificationOnly(platform, baseReasons, {
        kind: 'manual_input',
        question: 'Модель устройства не найдена в справочнике. Попробуйте найти её вручную.',
      });
    }

    const osVersion =
      signals?.uaData?.platformVersion ?? parseAndroidVersionFromUserAgent(signals?.userAgent);
    const esimContext: EsimResolutionContext = osVersion !== undefined ? { osVersion } : {};
    const resolution = resolveDeviceEsimStatus(device, esimContext, this.policy());

    const baseConfidence =
      androidResolution.method === 'ua_client_hints_model'
        ? BASE_CONFIDENCE.androidExactCode
        : BASE_CONFIDENCE.androidLegacyUa;
    const confidence = applyHeaderConsistency(baseConfidence, headerConsistency);
    const gate = applyConfidenceGate({
      resolutionStatus: resolution.status,
      confidence,
      answerThreshold: this.answerThreshold(),
    });

    const reasons: ApiReason[] = [
      ...baseReasons,
      ...(consistencyReason !== undefined ? [consistencyReason] : []),
      ...resolution.reasons.map((reason) => ({ ...reason })),
      ...(gate.downgradedByConfidence
        ? [{ code: 'CONFIDENCE_BELOW_THRESHOLD', detail: confidence.toFixed(2) }]
        : []),
    ];

    const clarification = this.buildDeviceLevelClarification(resolution, gate.status);
    const detection: DetectionInfo = {
      method: androidResolution.method,
      platform,
      exactModelKnown: true,
    };

    return {
      status: gate.status,
      confidence,
      detection,
      device: toDeviceSummary(device),
      candidates: [],
      reasons,
      ...(clarification !== undefined ? { clarification } : {}),
      presentation: buildPresentation({
        status: gate.status,
        deviceName: device.displayName,
        exactModelKnown: true,
        ...(resolution.clarification !== undefined
          ? { clarificationQuestion: resolution.clarification.question }
          : {}),
      }),
    };
  }

  private detectIos(
    signals: DetectionSignals | undefined,
    headerConsistency: HeaderConsistencyResult,
    consistencyReason: ApiReason | undefined,
  ): DetectResult {
    const snapshot = this.catalogService.getSnapshot();
    const iosVersion = parseIosVersionFromUserAgent(signals?.userAgent);
    const screenKey = buildScreenSignatureKey(signals?.screen);
    const screenSignature =
      screenKey === undefined ? undefined : this.screenSignatureService.getBySignature(screenKey);

    const selection = selectIosCandidates(snapshot.devices, iosVersion, screenSignature);
    const esimContext: EsimResolutionContext =
      iosVersion !== undefined ? { osVersion: iosVersion } : {};
    const groupResolution = resolveCandidateGroupEsimStatus(
      selection.candidates.map((device) => ({
        esim: device.esim,
        dataConfidence: device.dataConfidence,
      })),
      esimContext,
      this.policy(),
    );

    const candidatesAgree = groupResolution.status !== 'clarification_required';
    const baseConfidence = !candidatesAgree
      ? BASE_CONFIDENCE.iosCandidatesDisagree
      : selection.usedOsVersionRule && selection.usedScreenSignature
        ? BASE_CONFIDENCE.iosCandidatesAgreeBothSignals
        : BASE_CONFIDENCE.iosCandidatesAgreeSingleSignal;
    const confidence = applyHeaderConsistency(baseConfidence, headerConsistency);
    const gate = applyConfidenceGate({
      resolutionStatus: groupResolution.status,
      confidence,
      answerThreshold: this.answerThreshold(),
    });

    const reasons: ApiReason[] = [
      { code: 'PLATFORM_DETECTED', detail: 'ios' },
      ...selection.reasons,
      ...(consistencyReason !== undefined ? [consistencyReason] : []),
      ...groupResolution.reasons.map((reason) => ({ ...reason })),
      ...(gate.downgradedByConfidence
        ? [{ code: 'CONFIDENCE_BELOW_THRESHOLD', detail: confidence.toFixed(2) }]
        : []),
    ];

    const exactModelKnown = groupResolution.exactModelKnown && selection.candidates.length === 1;
    const singleDevice: Device | undefined = exactModelKnown ? selection.candidates[0] : undefined;
    const detection: DetectionInfo = {
      method: 'ios_version_and_screen_signature',
      platform: 'ios',
      exactModelKnown,
    };

    return {
      status: gate.status,
      confidence,
      detection,
      device: singleDevice !== undefined ? toDeviceSummary(singleDevice) : null,
      candidates:
        gate.status === 'clarification_required'
          ? selection.candidates.map(toCandidateSummary)
          : [],
      reasons,
      ...(gate.status === 'clarification_required'
        ? { clarification: this.buildIosClarification(selection.candidates) }
        : {}),
      presentation: buildPresentation({
        status: gate.status,
        exactModelKnown,
        ...(singleDevice !== undefined ? { deviceName: singleDevice.displayName } : {}),
      }),
    };
  }

  private buildIosClarification(candidates: readonly Device[]): Clarification {
    if (candidates.length === 0) {
      return {
        kind: 'manual_input',
        question: 'Не удалось определить модель iPhone. Введите модель вручную.',
      };
    }
    return {
      kind: 'choose_candidate',
      question: 'Уточните модель вашего iPhone',
      options: [
        ...candidates.map((device) => ({ id: device._id, label: device.displayName })),
        { id: '__other__', label: 'Другая модель' },
      ],
    };
  }

  /**
   * Уточнение уровня устройства (не группы) — либо адресный вопрос по условию `esim.conditions`
   * (регион/версия ОС, ADR-007), либо, при отсутствии такого вопроса, крайний случай "проверить
   * на устройстве" (docs/03 §3.7, п.4) для записей, заблокированных гейтом достоверности данных.
   */
  private buildDeviceLevelClarification(
    resolution: ReturnType<typeof resolveDeviceEsimStatus>,
    finalStatus: DetectResult['status'],
  ): Clarification | undefined {
    if (resolution.clarification !== undefined) {
      return {
        kind: 'answer_question',
        question: resolution.clarification.question,
        options: resolution.clarification.options.map((option) => ({
          id: option.value,
          label: option.label,
        })),
      };
    }
    if (finalStatus === 'clarification_required') {
      return {
        kind: 'check_on_device',
        question:
          'Устройство определено, но данные о поддержке eSIM пока не подтверждены. Проверьте наличие eSIM в настройках устройства.',
      };
    }
    return undefined;
  }

  private buildClarificationOnly(
    platform: Platform,
    reasons: readonly ApiReason[],
    clarification: Clarification,
  ): DetectResult {
    const detection: DetectionInfo = { method: 'unknown', platform, exactModelKnown: false };
    return {
      status: 'clarification_required',
      confidence: 0,
      detection,
      device: null,
      candidates: [],
      reasons: [...reasons],
      clarification,
      presentation: buildPresentation({
        status: 'clarification_required',
        exactModelKnown: false,
        clarificationQuestion: clarification.question,
      }),
    };
  }
}
